import { MachineStatus } from '@prisma/client';
import { AppError } from '../../core/errors/AppError';
import { eventBus } from '../../core/events/EventBus';
import { outbox } from '../../core/events/outbox/Outbox';
import { EventType } from '../../core/events/types';
import { prisma } from '../../infrastructure/database/prisma';
import { MachineRepository } from './machine.repository';

export class MachineService {
  constructor(private readonly repo: MachineRepository) {}

  async listMachines(factoryId: string, query: { search?: string; status?: MachineStatus }) {
    return this.repo.findMany(factoryId, query);
  }

  async getMachine(id: string, factoryId: string) {
    const machine = await this.repo.findById(id, factoryId);
    if (!machine) throw AppError.notFound('Machine not found');
    return machine;
  }

  async createMachine(factoryId: string, data: { name: string; serialNumber: string; model?: string; location: string }) {
    return this.repo.create({ ...data, factoryId });
  }

  async updateMachineStatus(id: string, factoryId: string, status: MachineStatus, reason?: string) {
    const machine = await this.repo.findById(id, factoryId);
    if (!machine) throw AppError.notFound('Machine not found');

    const previousStatus = machine.status;

    const eventType =
      status === MachineStatus.ONLINE
        ? EventType.MACHINE_ONLINE
        : status === MachineStatus.OFFLINE
          ? EventType.MACHINE_OFFLINE
          : EventType.MACHINE_STATUS_CHANGED;

    // Status write, history row and outbox event commit atomically, so a
    // machine that went offline can never lose its downtime event to a crash.
    const { updated, event } = await prisma.$transaction(async (tx) => {
      const u = await this.repo.updateStatus(id, status, reason, tx);
      const evt = eventBus.createEvent({
        eventType,
        factoryId,
        machineId: id,
        payload: {
          machineId: id,
          machineName: machine.name,
          previousStatus,
          newStatus: status,
          reason,
        },
      });
      await outbox.enqueue(evt, tx);
      return { updated: u, event: evt };
    });

    outbox.dispatchInstant(event);
    return updated;
  }

  async getMachineStatusSummary(factoryId: string) {
    const counts = await this.repo.countByStatus(factoryId);
    const summary: Record<string, number> = {};
    for (const { status, _count } of counts) {
      summary[status] = _count.status;
    }
    return summary;
  }
}
