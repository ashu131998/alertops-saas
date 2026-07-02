import { PrismaClient, AlertStatus, AlertSeverity, Prisma } from '@prisma/client';
import type { ListAlertsQuery } from './alert.types';

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
    const { page = 1, limit = 20, status, severity, machineId, search, unreadOnly } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.AlertWhereInput = {
      factoryId,
      deletedAt: null,
      ...(status && { status }),
      ...(severity && { severity }),
      ...(machineId && { machineId }),
      ...(unreadOnly && { isRead: false }),
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { machine: { name: { contains: search, mode: 'insensitive' } } },
        ],
      }),
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

  create(data: {
    title: string;
    description: string;
    severity: AlertSeverity;
    machineId: string;
    factoryId: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    return this.db.alert.create({
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

  update(id: string, data: Prisma.AlertUpdateInput) {
    return this.db.alert.update({ where: { id }, data });
  }

  markRead(id: string) {
    return this.db.alert.update({ where: { id }, data: { isRead: true } });
  }

  markAllRead(factoryId: string) {
    return this.db.alert.updateMany({ where: { factoryId, isRead: false, deletedAt: null }, data: { isRead: true } });
  }

  createAction(data: { alertId: string; userId: string; actionType: any; comment?: string }) {
    return this.db.alertAction.create({ data });
  }

  addTimelineEntry(data: { alertId: string; eventType: string; description: string; metadata?: Prisma.InputJsonValue }) {
    return this.db.alertTimeline.create({ data });
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
