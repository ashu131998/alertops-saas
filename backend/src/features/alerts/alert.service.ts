import { AlertStatus, ActionType } from '@prisma/client';
import { AppError } from '../../core/errors/AppError';
import { eventBus } from '../../core/events/EventBus';
import { EventType } from '../../core/events/types';
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
    const alert = await this.repo.create({ ...dto, metadata: dto.metadata as any });

    await eventBus.publish(
      eventBus.createEvent({
        eventType: EventType.ALERT_CREATED,
        factoryId: alert.factoryId,
        machineId: alert.machineId,
        alertId: alert.id,
        payload: {
          alertId: alert.id,
          title: alert.title,
          description: alert.description,
          severity: alert.severity,
          status: alert.status,
          machineId: alert.machineId,
          machineName: (alert as any).machine?.name ?? '',
          factoryId: alert.factoryId,
        },
      }),
    );

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

    if (targetStatus) {
      await this.repo.update(alertId, {
        status: targetStatus,
        ...(targetStatus === AlertStatus.RESOLVED ? { resolvedAt: new Date() } : {}),
      });
    }

    await this.repo.createAction({
      alertId,
      userId,
      actionType: dto.actionType,
      comment: dto.comment,
    });

    const description = dto.comment
      ? `${dto.actionType} by user — "${dto.comment}"`
      : `${dto.actionType} by user`;

    await this.repo.addTimelineEntry({
      alertId,
      eventType: dto.actionType,
      description,
    });

    if (targetStatus) {
      await eventBus.publish(
        eventBus.createEvent({
          eventType: EventType.ALERT_UPDATED,
          factoryId,
          machineId: alert.machineId,
          alertId,
          payload: {
            alertId,
            previousStatus,
            newStatus: targetStatus,
            actionType: dto.actionType,
            updatedBy: userId,
            comment: dto.comment,
          },
        }),
      );
    }

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
}
