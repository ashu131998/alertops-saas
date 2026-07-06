import { prisma } from '../../../infrastructure/database/prisma';
import { config } from '../../../config';
import { PushNotificationService } from '../../../infrastructure/push/PushNotificationService';
import { OutboxDispatcher } from '../outbox/OutboxDispatcher';
import { AlertCreatedEvent, EventType } from '../types';

const SEVERITY_EMOJI: Record<string, string> = {
  CRITICAL: '🚨',
  HIGH: '⚠️',
  MEDIUM: '⚡',
  LOW: 'ℹ️',
};

/**
 * Durable push delivery. Registered on the outbox dispatcher (not the in-process
 * bus) so a failed send is retried by the worker and every recipient gets a
 * delivery receipt keyed by the event id — the core of the never-miss promise.
 */
export function registerPushNotificationHandlers(dispatcher: OutboxDispatcher): void {
  const pushService = new PushNotificationService(prisma, config.EXPO_ACCESS_TOKEN);

  dispatcher.subscribe<AlertCreatedEvent>(EventType.ALERT_CREATED, async (event) => {
    const { payload } = event;
    const emoji = SEVERITY_EMOJI[payload.severity] ?? '🔔';
    const machineSuffix = payload.machineName ? ` — ${payload.machineName}` : '';
    const notification = {
      title: `${emoji} ${payload.severity} Alert${machineSuffix}`,
      body: payload.title,
      data: { alertId: payload.alertId, screen: 'alert-detail' },
    };

    // Targeted alerts (assigned workers) go only to those users; otherwise the
    // whole factory is notified. Receipts are keyed by event.eventId so worker
    // retries never double-notify a recipient already SENT.
    if (payload.targetUserIds && payload.targetUserIds.length > 0) {
      await pushService.deliverToUsers(event.eventId, payload.targetUserIds, notification);
    } else {
      await pushService.deliverToFactory(event.eventId, event.factoryId, notification);
    }
  });
}
