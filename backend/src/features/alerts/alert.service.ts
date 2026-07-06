import { AlertStatus, ActionType } from '@prisma/client';
import { AppError } from '../../core/errors/AppError';
import { eventBus } from '../../core/events/EventBus';
import { outbox } from '../../core/events/outbox/Outbox';
import { EventType } from '../../core/events/types';
import { prisma } from '../../infrastructure/database/prisma';
import { espBridge } from '../../infrastructure/esp/EspBridgeClient';
import { AlertRepository } from './alert.repository';
import type { CreateAlertDto, ListAlertsQuery, TakeActionDto, AvailableAction } from './alert.types';

const STATUS_TRANSITIONS: Record<AlertStatus, AlertStatus[]> = {
  [AlertStatus.OPEN]: [AlertStatus.ACKNOWLEDGED, AlertStatus.IN_PROGRESS, AlertStatus.RESOLVED],
  [AlertStatus.ACKNOWLEDGED]: [AlertStatus.IN_PROGRESS, AlertStatus.RESOLVED],
  [AlertStatus.IN_PROGRESS]: [AlertStatus.RESOLVED],
  [AlertStatus.RESOLVED]: [AlertStatus.CLOSED],
  [AlertStatus.CLOSED]: [],
};

const ACTION_TO_STATUS: Record<string, AlertStatus | null> = {
  [ActionType.ACKNOWLEDGE]: AlertStatus.ACKNOWLEDGED,
  [ActionType.START_REPAIR]: AlertStatus.IN_PROGRESS,
  [ActionType.RESOLVE]: AlertStatus.RESOLVED,
  [ActionType.CLOSE]: AlertStatus.CLOSED,
  [ActionType.ESCALATE]: null,
  [ActionType.COMMENT]: null,
};

const ACTION_DEFINITIONS: Record<AlertStatus, AvailableAction[]> = {
  [AlertStatus.OPEN]: [
    { actionType: ActionType.ACKNOWLEDGE, label: 'Acknowledge', description: 'Confirm you are aware of this alert', requiresComment: false, confirmationRequired: false },
    { actionType: ActionType.START_REPAIR, label: 'Start Repair', description: 'Begin repair process on this machine', requiresComment: true, confirmationRequired: true },
    { actionType: ActionType.ESCALATE, label: 'Escalate', description: 'Escalate to supervisor', requiresComment: true, confirmationRequired: false },
    { actionType: ActionType.COMMENT, label: 'Add Comment', description: 'Add an observation or note', requiresComment: true, confirmationRequired: false },
  ],
  [AlertStatus.ACKNOWLEDGED]: [
    { actionType: ActionType.START_REPAIR, label: 'Start Repair', description: 'Begin repair process', requiresComment: false, confirmationRequired: true },
    { actionType: ActionType.ESCALATE, label: 'Escalate', description: 'Escalate to supervisor', requiresComment: true, confirmationRequired: false },
    { actionType: ActionType.COMMENT, label: 'Add Comment', description: 'Add a note', requiresComment: true, confirmationRequired: false },
  ],
  [AlertStatus.IN_PROGRESS]: [
    { actionType: ActionType.RESOLVE, label: 'Resolve', description: 'Mark as resolved', requiresComment: false, confirmationRequired: true },
    { actionType: ActionType.COMMENT, label: 'Add Comment', description: 'Add a note', requiresComment: true, confirmationRequired: false },
  ],
  [AlertStatus.RESOLVED]: [
    { actionType: ActionType.CLOSE, label: 'Close', description: 'Close this alert permanently', requiresComment: false, confirmationRequired: true },
    { actionType: ActionType.COMMENT, label: 'Add Comment', description: 'Add a note', requiresComment: true, confirmationRequired: false },
  ],
  [AlertStatus.CLOSED]: [
    { actionType: ActionType.COMMENT, label: 'Add Comment', description: 'Add a note', requiresComment: true, confirmationRequired: false },
  ],
};

export class AlertService {
  constructor(private readonly repo: AlertRepository) {}

  async listAlerts(factoryId: string, query: ListAlertsQuery) {
    const { alerts, total } = await this.repo.findMany(factoryId, query);
    const { page = 1, limit = 20 } = query;
    return {
      data: alerts.map((a) => ({
        id: a.id,
        title: a.title,
        severity: a.severity,
        status: a.status,
        isRead: a.isRead,
        machineId: a.machineId,
        machineName: (a as any).machine?.name,
        factoryId: a.factoryId,
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
      })),
      meta: {
        total,
        page,
        limit,
        hasMore: page * limit < total,
      },
    };
  }

  async getAlert(id: string, factoryId: string) {
    const alert = await this.repo.findById(id, factoryId);
    if (!alert) throw AppError.notFound('Alert not found');

    if (!alert.isRead) await this.repo.markRead(id);

    return {
      ...alert,
      availableActions: ACTION_DEFINITIONS[alert.status] ?? [],
    };
  }

  async createAlert(dto: CreateAlertDto) {
    // The alert row and its outbox event commit atomically, so a crash can never
    // leave a created alert whose notification was never enqueued.
    const { alert, event } = await prisma.$transaction(async (tx) => {
      const created = await this.repo.create({ ...dto, metadata: dto.metadata as any }, tx);
      const evt = eventBus.createEvent({
        eventType: EventType.ALERT_CREATED,
        factoryId: created.factoryId,
        machineId: created.machineId ?? undefined,
        alertId: created.id,
        payload: {
          alertId: created.id,
          title: created.title,
          description: created.description,
          severity: created.severity,
          status: created.status,
          machineId: created.machineId,
          machineName: (created as any).machine?.name ?? '',
          factoryId: created.factoryId,
        },
      });
      await outbox.enqueue(evt, tx);
      return { alert: created, event: evt };
    });

    outbox.dispatchInstant(event);
    return alert;
  }

  async takeAction(alertId: string, factoryId: string, userId: string, dto: TakeActionDto) {
    const alert = await this.repo.findById(alertId, factoryId);
    if (!alert) throw AppError.notFound('Alert not found');

    const targetStatus = ACTION_TO_STATUS[dto.actionType];
    if (targetStatus !== null) {
      const allowed = STATUS_TRANSITIONS[alert.status];
      if (!allowed.includes(targetStatus as AlertStatus)) {
        throw AppError.badRequest(`Cannot transition from ${alert.status} to ${targetStatus}`);
      }
    }

    const previousStatus = alert.status;

    const description = dto.comment
      ? `${dto.actionType} by user — "${dto.comment}"`
      : `${dto.actionType} by user`;

    // Status change, action record, timeline entry and (when the status moved)
    // the outbox event all commit atomically.
    const event = await prisma.$transaction(async (tx) => {
      if (targetStatus) {
        await this.repo.update(
          alertId,
          {
            status: targetStatus,
            ...(targetStatus === AlertStatus.RESOLVED ? { resolvedAt: new Date() } : {}),
          },
          tx,
        );
      }

      await this.repo.createAction({ alertId, userId, actionType: dto.actionType, comment: dto.comment }, tx);
      await this.repo.addTimelineEntry({ alertId, eventType: dto.actionType, description }, tx);

      if (!targetStatus) return null;

      const evt = eventBus.createEvent({
        eventType: EventType.ALERT_UPDATED,
        factoryId,
        machineId: alert.machineId ?? undefined,
        alertId,
        payload: {
          alertId,
          previousStatus,
          newStatus: targetStatus,
          actionType: dto.actionType,
          updatedBy: userId,
          comment: dto.comment,
        },
      });
      await outbox.enqueue(evt, tx);
      return evt;
    });

    if (event) outbox.dispatchInstant(event);

    return this.repo.findById(alertId, factoryId);
  }

  async getDashboardStats(factoryId: string) {
    const [statusCounts, unreadCount, criticalCount] = await Promise.all([
      this.repo.countByStatus(factoryId),
      this.repo.countUnread(factoryId),
      this.repo.countCritical(factoryId),
    ]);

    const stats: Record<string, number> = {};
    for (const { status, _count } of statusCounts) {
      stats[status] = _count.status;
    }

    return {
      unreadCount,
      criticalCount,
      openCount: stats['OPEN'] ?? 0,
      acknowledgedCount: stats['ACKNOWLEDGED'] ?? 0,
      inProgressCount: stats['IN_PROGRESS'] ?? 0,
      resolvedCount: stats['RESOLVED'] ?? 0,
    };
  }

  async markAllRead(factoryId: string) {
    return this.repo.markAllRead(factoryId);
  }

  /**
   * A worker answers an interactive alert (downtime reason / config selection).
   * The chosen option is validated against the alert metadata, recorded on the
   * timeline, and relayed to the ESP-IoT query-api to apply on the dashboard.
   */
  async respondToAlert(alertId: string, factoryId: string, userId: string, optionId: string) {
    const alert = await this.repo.findById(alertId, factoryId);
    if (!alert) throw AppError.notFound('Alert not found');

    const meta = (alert.metadata ?? {}) as any;
    const options: Array<{ id: string; label: string }> = Array.isArray(meta.options) ? meta.options : [];
    if (options.length === 0) throw AppError.badRequest('This alert has no reply options');
    const chosen = options.find((o) => o.id === optionId);
    if (!chosen) throw AppError.badRequest('Invalid option for this alert');

    await this.repo.addTimelineEntry({
      alertId,
      eventType: 'WORKER_REPLY',
      description: `Worker responded: ${chosen.label}`,
      metadata: { optionId, kind: meta.kind ?? null },
    });
    // Mark handled without asserting the machine is fixed.
    await this.repo.update(alertId, {
      isRead: true,
      ...(alert.status === AlertStatus.OPEN ? { status: AlertStatus.ACKNOWLEDGED } : {}),
    });

    const ctx = await this.repo.getReplyContext(userId, factoryId);
    const relay = await espBridge.relayReply({
      replyId: optionId,
      externalWorkerId: ctx.userExternalId,
      externalFactoryId: ctx.factoryExternalId,
    });

    return {
      ok: relay.ok,
      message: relay.message ?? `Selected: ${chosen.label}`,
      error: relay.error,
      alert: await this.repo.findById(alertId, factoryId),
    };
  }
}
