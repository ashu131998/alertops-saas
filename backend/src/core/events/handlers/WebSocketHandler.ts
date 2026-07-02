import { wsGateway } from '../../../infrastructure/websocket/WebSocketGateway';
import { eventBus } from '../EventBus';
import { DomainEvent, EventType } from '../types';

const BROADCAST_EVENTS = new Set([
  EventType.ALERT_CREATED,
  EventType.ALERT_UPDATED,
  EventType.ALERT_ACKNOWLEDGED,
  EventType.ALERT_RESOLVED,
  EventType.MACHINE_ONLINE,
  EventType.MACHINE_OFFLINE,
  EventType.MACHINE_STATUS_CHANGED,
]);

export function registerWebSocketHandlers(): void {
  for (const eventType of BROADCAST_EVENTS) {
    eventBus.subscribe(eventType, async (event: DomainEvent) => {
      wsGateway.broadcastToFactory(event.factoryId, event);
    });
  }
}
