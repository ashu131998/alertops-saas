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
    await pushService.sendToFactory(event.factoryId, {
      title: `${emoji} ${payload.severity} Alert — ${payload.machineName}`,
      body: payload.title,
      data: { alertId: payload.alertId, screen: 'alert-detail' },
    });
  });
}
