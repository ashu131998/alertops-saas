import { PrismaClient, MachineStatus, Prisma } from '@prisma/client';

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

  updateStatus(id: string, status: MachineStatus, reason?: string) {
    return this.db.$transaction(async (tx) => {
      const machine = await tx.machine.update({
        where: { id },
        data: { status, lastSeenAt: new Date() },
      });
      await tx.machineStatusHistory.create({
        data: { machineId: id, status, reason },
      });
      return machine;
    });
  }

  countByStatus(factoryId: string) {
    return this.db.machine.groupBy({
      by: ['status'],
      where: { factoryId, deletedAt: null },
      _count: { status: true },
    });
  }
}
