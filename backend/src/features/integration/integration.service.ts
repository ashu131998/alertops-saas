import bcrypt from 'bcryptjs';
import { PrismaClient, AlertSeverity, AlertStatus, Role } from '@prisma/client';
import { AppError } from '../../core/errors/AppError';
import { eventBus } from '../../core/events/EventBus';
import { outbox } from '../../core/events/outbox/Outbox';
import { EventType } from '../../core/events/types';
import { logger } from '../../config/logger';

const SALT_ROUNDS = 12;

export interface SyncWorkerDto {
  externalFactoryId: string;
  factoryName?: string;
  factoryLocation?: string;
  externalWorkerId: string;
  email: string;
  password?: string;
  firstName: string;
  lastName: string;
  role?: Role;
  phone?: string;
}

export interface NotifyDto {
  externalFactoryId: string;
  externalWorkerIds: string[];
  title: string;
  body: string;
  severity: AlertSeverity;
  externalMachineId?: string;
  externalMachineName?: string;
  data?: Record<string, unknown>;
}

export class IntegrationService {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Idempotently provision (or update) the AlertOps factory + worker user that
   * mirror an ESP-IoT factory + worker. Returns the AlertOps user id so the
   * bridge can store it on the worker record.
   */
  async syncWorker(dto: SyncWorkerDto): Promise<{ userId: string; factoryId: string; created: boolean }> {
    const factory = await this.upsertFactory(dto.externalFactoryId, dto.factoryName, dto.factoryLocation);

    const existing = await this.db.user.findFirst({
      where: {
        OR: [{ externalId: dto.externalWorkerId }, { email: dto.email.toLowerCase() }],
      },
    });

    if (existing) {
      const user = await this.db.user.update({
        where: { id: existing.id },
        data: {
          externalId: dto.externalWorkerId,
          email: dto.email.toLowerCase(),
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: dto.role ?? existing.role,
          phone: dto.phone ?? existing.phone,
          factoryId: factory.id,
          isActive: true,
          ...(dto.password ? { passwordHash: await bcrypt.hash(dto.password, SALT_ROUNDS) } : {}),
        },
      });
      return { userId: user.id, factoryId: factory.id, created: false };
    }

    if (!dto.password) {
      throw AppError.badRequest('password is required when creating a new worker account');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.db.user.create({
      data: {
        externalId: dto.externalWorkerId,
        email: dto.email.toLowerCase(),
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role ?? Role.WORKER,
        phone: dto.phone,
        factoryId: factory.id,
      },
    });

    logger.info({ userId: user.id, externalWorkerId: dto.externalWorkerId }, 'integration: worker provisioned');
    return { userId: user.id, factoryId: factory.id, created: true };
  }

  /**
   * Create a targeted alert for the assigned workers and fan it out through the
   * event bus (WebSocket for dashboards, push for the assigned workers' phones).
   */
  async notify(dto: NotifyDto): Promise<{ alertId: string; recipientCount: number }> {
    const factory = await this.db.factory.findUnique({ where: { externalId: dto.externalFactoryId } });
    if (!factory) throw AppError.notFound(`No factory mapped for ${dto.externalFactoryId}`);

    const users = await this.db.user.findMany({
      where: {
        externalId: { in: dto.externalWorkerIds },
        factoryId: factory.id,
        isActive: true,
        deletedAt: null,
      },
      select: { id: true },
    });
    const targetUserIds = users.map((u) => u.id);

    // Alert insert + outbox event commit atomically, so a bridge alert can never
    // be created without its push being enqueued.
    const { alert, event } = await this.db.$transaction(async (tx) => {
      const created = await tx.alert.create({
        data: {
          title: dto.title,
          description: dto.body,
          severity: dto.severity,
          status: AlertStatus.OPEN,
          factoryId: factory.id,
          externalMachineId: dto.externalMachineId ?? null,
          externalMachineName: dto.externalMachineName ?? null,
          targetUserIds,
          metadata: (dto.data ?? {}) as any,
          timeline: {
            create: {
              eventType: 'ALERT_CREATED',
              description: `Alert created with severity ${dto.severity}`,
            },
          },
        },
      });

      const evt = eventBus.createEvent({
        eventType: EventType.ALERT_CREATED,
        factoryId: factory.id,
        machineId: undefined,
        alertId: created.id,
        payload: {
          alertId: created.id,
          title: created.title,
          description: created.description,
          severity: created.severity,
          status: created.status,
          machineId: null,
          machineName: dto.externalMachineName ?? '',
          factoryId: factory.id,
          targetUserIds,
        },
      });
      await outbox.enqueue(evt, tx);
      return { alert: created, event: evt };
    });

    outbox.dispatchInstant(event);

    return { alertId: alert.id, recipientCount: targetUserIds.length };
  }

  private async upsertFactory(externalId: string, name?: string, location?: string) {
    const existing = await this.db.factory.findUnique({ where: { externalId } });
    if (existing) return existing;
    return this.db.factory.create({
      data: {
        externalId,
        name: name ?? externalId,
        location: location ?? 'Unknown',
        timezone: 'Asia/Kolkata',
      },
    });
  }
}
