import { PrismaClient, AlertStatus, AlertSeverity, Prisma } from '@prisma/client';
import type { ListAlertsQuery } from './alert.types';

// Either the base client or an interactive-transaction client, so writes can be
// enlisted in the same transaction as the outbox enqueue.
type DbClient = PrismaClient | Prisma.TransactionClient;

const alertWithRelations = Prisma.validator<Prisma.AlertDefaultArgs>()({
  include: {
    machine: { select: { id: true, name: true, location: true } },
    factory: { select: { id: true, name: true } },
    timeline: { orderBy: { createdAt: 'asc' } },
    actions: { include: { user: { select: { id: true, firstName: true, lastName: true, role: true } } }, orderBy: { createdAt: 'desc' } },
    comments: { where: { deletedAt: null }, include: { user: { select: { id: true, firstName: true, lastName: true } } }, orderBy: { createdAt: 'asc' } },
  },
});

export type AlertWithRelations = Prisma.AlertGetPayload<typeof alertWithRelations>;

export class AlertRepository {
  constructor(private readonly db: PrismaClient) {}

  async findMany(factoryId: string, query: ListAlertsQuery) {
    const { page = 1, limit = 20, status, severity, machineId, search, unreadOnly, viewerId, viewerRole } = query;
    const skip = (page - 1) * limit;

    // Combine scope (worker targeting) and search — both use OR internally, so
    // they are ANDed together to avoid clobbering each other.
    const and: Prisma.AlertWhereInput[] = [];

    // Workers only see alerts targeted to them or factory-wide (untargeted)
    // alerts. Supervisors/admins see the whole factory.
    if (viewerRole === 'WORKER' && viewerId) {
      and.push({ OR: [{ targetUserIds: { has: viewerId } }, { targetUserIds: { isEmpty: true } }] });
    }
    if (search) {
      and.push({
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { machine: { name: { contains: search, mode: 'insensitive' } } },
        ],
      });
    }

    const where: Prisma.AlertWhereInput = {
      factoryId,
      deletedAt: null,
      ...(status && { status }),
      ...(severity && { severity }),
      ...(machineId && { machineId }),
      ...(unreadOnly && { isRead: false }),
      ...(and.length > 0 && { AND: and }),
    };

    const [alerts, total] = await Promise.all([
      this.db.alert.findMany({
        where,
        include: { machine: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.db.alert.count({ where }),
    ]);

    return { alerts, total };
  }

  findById(id: string, factoryId: string): Promise<AlertWithRelations | null> {
    return this.db.alert.findFirst({
      where: { id, factoryId, deletedAt: null },
      ...alertWithRelations,
    });
  }

  create(
    data: {
      title: string;
      description: string;
      severity: AlertSeverity;
      machineId: string;
      factoryId: string;
      metadata?: Prisma.InputJsonValue;
    },
    client: DbClient = this.db,
  ) {
    return client.alert.create({
      data: {
        ...data,
        status: AlertStatus.OPEN,
        timeline: {
          create: {
            eventType: 'ALERT_CREATED',
            description: `Alert created with severity ${data.severity}`,
          },
        },
      },
      include: { machine: { select: { id: true, name: true } }, factory: { select: { id: true, name: true } } },
    });
  }

  update(id: string, data: Prisma.AlertUpdateInput, client: DbClient = this.db) {
    return client.alert.update({ where: { id }, data });
  }

  markRead(id: string) {
    return this.db.alert.update({ where: { id }, data: { isRead: true } });
  }

  markAllRead(factoryId: string) {
    return this.db.alert.updateMany({ where: { factoryId, isRead: false, deletedAt: null }, data: { isRead: true } });
  }

  createAction(data: { alertId: string; userId: string; actionType: any; comment?: string }, client: DbClient = this.db) {
    return client.alertAction.create({ data });
  }

  addTimelineEntry(
    data: { alertId: string; eventType: string; description: string; metadata?: Prisma.InputJsonValue },
    client: DbClient = this.db,
  ) {
    return client.alertTimeline.create({ data });
  }

  /** External identity of the responding worker + their factory, for the ESP-IoT relay. */
  async getReplyContext(userId: string, factoryId: string) {
    const [user, factory] = await Promise.all([
      this.db.user.findUnique({ where: { id: userId }, select: { externalId: true } }),
      this.db.factory.findUnique({ where: { id: factoryId }, select: { externalId: true } }),
    ]);
    return { userExternalId: user?.externalId ?? null, factoryExternalId: factory?.externalId ?? null };
  }

  countByStatus(factoryId: string) {
    return this.db.alert.groupBy({
      by: ['status'],
      where: { factoryId, deletedAt: null },
      _count: { status: true },
    });
  }

  countUnread(factoryId: string) {
    return this.db.alert.count({ where: { factoryId, isRead: false, deletedAt: null } });
  }

  countCritical(factoryId: string) {
    return this.db.alert.count({ where: { factoryId, severity: 'CRITICAL', status: { notIn: ['RESOLVED', 'CLOSED'] }, deletedAt: null } });
  }
}
