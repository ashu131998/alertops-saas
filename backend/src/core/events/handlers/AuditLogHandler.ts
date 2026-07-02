import { prisma } from '../../../infrastructure/database/prisma';
import { eventBus } from '../EventBus';
import { DomainEvent, EventType } from '../types';

const AUDITED_EVENTS = new Set([
  EventType.ALERT_CREATED,
  EventType.ALERT_UPDATED,
  EventType.ALERT_ACKNOWLEDGED,
  EventType.ALERT_RESOLVED,
  EventType.MACHINE_STATUS_CHANGED,
]);

export function registerAuditLogHandlers(): void {
  for (const eventType of AUDITED_EVENTS) {
    eventBus.subscribe(eventType, async (event: DomainEvent) => {
      try {
        await prisma.eventStore.create({
          data: {
            eventId: event.eventId,
            eventType: event.eventType,
            factoryId: event.factoryId,
            machineId: event.machineId,
            alertId: event.alertId,
            payload: (event as any).payload ?? {},
            version: event.version,
          },
        });
      } catch {
        // Non-fatal: audit log write failure shouldn't crash the app
      }
    });
  }
}
