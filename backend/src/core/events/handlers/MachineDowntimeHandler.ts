import { AlertSeverity } from '@prisma/client';
import { prisma } from '../../../infrastructure/database/prisma';
import { AlertRepository } from '../../../features/alerts/alert.repository';
import { AlertService } from '../../../features/alerts/alert.service';
import { eventBus } from '../EventBus';
import { EventType } from '../types';
import { logger } from '../../../config/logger';

const DOWNTIME_OPTIONS = [
  { id: 'changeover', label: 'Changeover' },
  { id: 'thread_break', label: 'Thread Break' },
  { id: 'small_break', label: 'Small Break' },
  { id: 'not_planned', label: 'Not Planned' },
];

export function registerMachineDowntimeHandler(): void {
  const alertService = new AlertService(new AlertRepository(prisma));

  eventBus.subscribe(EventType.MACHINE_OFFLINE, async (event) => {
    const { machineId, factoryId } = event;
    const { machineName } = (event as any).payload as { machineName: string };

    if (!machineId) return;

    // Avoid creating duplicate downtime alerts for a machine that is already
    // known to be offline (e.g. rapid status flapping).
    const existing = await prisma.alert.findFirst({
      where: {
        machineId,
        factoryId,
        deletedAt: null,
        status: { in: ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS'] },
        metadata: { path: ['kind'], equals: 'DOWNTIME_REASON' },
      },
    });
    if (existing) {
      logger.info({ machineId }, 'Downtime alert already open — skipping');
      return;
    }

    await alertService.createAlert({
      title: `Machine Down: ${machineName}`,
      description: `${machineName} has gone offline. Please select the reason.`,
      severity: AlertSeverity.HIGH,
      machineId,
      factoryId,
      metadata: {
        kind: 'DOWNTIME_REASON',
        prompt: 'Why is the machine down?',
        options: DOWNTIME_OPTIONS,
      },
    });

    logger.info({ machineId, machineName }, 'Downtime alert created');
  });
}
