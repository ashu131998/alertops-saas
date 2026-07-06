import { PrismaClient, MachineStatus, Machine, Prisma } from '@prisma/client';

// Base client or an interactive-transaction client, so the status write can be
// enlisted in the same transaction as the outbox enqueue.
type DbClient = PrismaClient | Prisma.TransactionClient;

export class MachineRepository {
  constructor(private readonly db: PrismaClient) {}

  findMany(factoryId: string, query: { search?: string; status?: MachineStatus }) {
    return this.db.machine.findMany({
      where: {
        factoryId,
        deletedAt: null,
        ...(query.status && { status: query.status }),
        ...(query.search && {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { serialNumber: { contains: query.search, mode: 'insensitive' } },
            { location: { contains: query.search, mode: 'insensitive' } },
          ],
        }),
      },
      include: { _count: { select: { alerts: { where: { deletedAt: null, status: { notIn: ['RESOLVED', 'CLOSED'] } } } } } },
      orderBy: { name: 'asc' },
    });
  }

  findById(id: string, factoryId: string) {
    return this.db.machine.findFirst({
      where: { id, factoryId, deletedAt: null },
      include: {
        statusHistory: { orderBy: { recordedAt: 'desc' }, take: 10 },
        _count: { select: { alerts: true } },
      },
    });
  }

  create(data: { name: string; serialNumber: string; model?: string; location: string; factoryId: string; metadata?: Prisma.InputJsonValue }) {
    return this.db.machine.create({ data });
  }

  // When a transaction client is supplied the two writes join the caller's
  // transaction (alongside the outbox enqueue); otherwise they run in their own.
  async updateStatus(id: string, status: MachineStatus, reason?: string, client?: DbClient): Promise<Machine> {
    if (!client) {
      return this.db.$transaction((tx) => this.updateStatus(id, status, reason, tx));
    }
    const machine = await client.machine.update({
      where: { id },
      data: { status, lastSeenAt: new Date() },
    });
    await client.machineStatusHistory.create({ data: { machineId: id, status, reason } });
    return machine;
  }

  countByStatus(factoryId: string) {
    return this.db.machine.groupBy({
      by: ['status'],
      where: { factoryId, deletedAt: null },
      _count: { status: true },
    });
  }
}
