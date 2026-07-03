import { prisma } from '../../../infrastructure/database/prisma';
import { config } from '../../../config';
import { PushNotificationService } from '../../../infrastructure/push/PushNotificationService';
import { eventBus } from '../EventBus';
import { AlertCreatedEvent, EventType } from '../types';

const SEVERITY_EMOJI: Record<string, string> = {
  CRITICAL: '🚨',
  HIGH: '⚠️',
  MEDIUM: '⚡',
  LOW: 'ℹ️',
};

export function registerPushNotificationHandlers(): void {
  const pushService = new PushNotificationService(prisma, config.EXPO_ACCESS_TOKEN);

  eventBus.subscribe<AlertCreatedEvent>(EventType.ALERT_CREATED, async (event) => {
    const { payload } = event;
    const emoji = SEVERITY_EMOJI[payload.severity] ?? '🔔';
    const machineSuffix = payload.machineName ? ` — ${payload.machineName}` : '';
    const notification = {
      title: `${emoji} ${payload.severity} Alert${machineSuffix}`,
      body: payload.title,
      data: { alertId: payload.alertId, screen: 'alert-detail' },
    };

    // Targeted alerts (assigned workers) go only to those users; otherwise the
    // whole factory is notified.
    if (payload.targetUserIds && payload.targetUserIds.length > 0) {
      await Promise.all(payload.targetUserIds.map((userId) => pushService.sendToUser(userId, notification)));
    } else {
      await pushService.sendToFactory(event.factoryId, notification);
    }
  });
}
