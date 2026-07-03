import Expo, { ExpoPushMessage } from 'expo-server-sdk';
import webpush, { PushSubscription } from 'web-push';
import { PrismaClient } from '@prisma/client';
import { logger } from '../../config/logger';
import { config } from '../../config';

type Notification = { title: string; body: string; data?: Record<string, unknown> };

// Configure VAPID once at module load if keys are present. Web push is simply
// skipped when they are not, so the server still runs without them.
const webPushEnabled = Boolean(config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY);
if (webPushEnabled) {
  webpush.setVapidDetails(config.VAPID_SUBJECT, config.VAPID_PUBLIC_KEY!, config.VAPID_PRIVATE_KEY!);
}

// Only query for WEBPUSH tokens once web push is actually enabled. This keeps
// the WEBPUSH enum value out of DB queries on environments where the schema
// hasn't been migrated yet, so an older prod DB can't error on an unknown enum.
const PUSH_PLATFORMS: ('EXPO' | 'WEBPUSH')[] = webPushEnabled ? ['EXPO', 'WEBPUSH'] : ['EXPO'];

export class PushNotificationService {
  private readonly expo: Expo;

  constructor(private readonly db: PrismaClient, accessToken?: string) {
    this.expo = new Expo({ accessToken });
  }

  async sendToFactory(factoryId: string, notification: Notification): Promise<void> {
    const tokens = await this.db.notificationToken.findMany({
      where: {
        isActive: true,
        platform: { in: PUSH_PLATFORMS },
        user: { factoryId, isActive: true, deletedAt: null },
      },
      select: { token: true, platform: true },
    });
    await this.dispatch(tokens, notification);
  }

  async sendToUser(userId: string, notification: Notification): Promise<void> {
    const tokens = await this.db.notificationToken.findMany({
      where: { userId, isActive: true, platform: { in: PUSH_PLATFORMS } },
      select: { token: true, platform: true },
    });
    await this.dispatch(tokens, notification);
  }

  private async dispatch(
    tokens: { token: string; platform: string }[],
    notification: Notification,
  ): Promise<void> {
    const expoTokens = tokens.filter((t) => t.platform === 'EXPO').map((t) => t.token);
    const webTokens = tokens.filter((t) => t.platform === 'WEBPUSH').map((t) => t.token);
    await Promise.all([
      this.sendExpo(expoTokens, notification),
      this.sendWebPush(webTokens, notification),
    ]);
  }

  private async sendExpo(tokens: string[], notification: Notification): Promise<void> {
    const messages: ExpoPushMessage[] = tokens
      .filter((token) => Expo.isExpoPushToken(token))
      .map((token) => ({
        to: token,
        title: notification.title,
        body: notification.body,
        data: notification.data ?? {},
        sound: 'default',
        priority: 'high',
      }));

    if (messages.length === 0) return;

    const chunks = this.expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      try {
        const receipts = await this.expo.sendPushNotificationsAsync(chunk);
        for (const receipt of receipts) {
          if (receipt.status === 'error') {
            logger.warn({ receipt }, 'Push notification error');
          }
        }
      } catch (err) {
        logger.error({ err }, 'Failed to send push notifications');
      }
    }
  }

  private async sendWebPush(tokens: string[], notification: Notification): Promise<void> {
    if (!webPushEnabled || tokens.length === 0) return;

    const payload = JSON.stringify({
      title: notification.title,
      body: notification.body,
      data: notification.data ?? {},
    });

    await Promise.all(
      tokens.map(async (raw) => {
        let subscription: PushSubscription;
        try {
          subscription = JSON.parse(raw) as PushSubscription;
        } catch {
          logger.warn('Malformed web push subscription; deactivating');
          await this.deactivate(raw);
          return;
        }
        try {
          // High urgency + a long TTL so a phone that is offline / asleep still
          // receives the alert when it reconnects (FCM holds it for the TTL).
          // The inbox is the real source of truth, so nothing is ever lost even
          // if delivery is delayed beyond this window.
          await webpush.sendNotification(subscription, payload, {
            TTL: 24 * 60 * 60,
            urgency: 'high',
          });
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number })?.statusCode;
          // 404/410 mean the subscription is gone for good — retire it.
          if (statusCode === 404 || statusCode === 410) {
            await this.deactivate(raw);
          } else {
            logger.error({ err }, 'Failed to send web push notification');
          }
        }
      }),
    );
  }

  private async deactivate(token: string): Promise<void> {
    try {
      await this.db.notificationToken.updateMany({ where: { token }, data: { isActive: false } });
    } catch (err) {
      logger.error({ err }, 'Failed to deactivate stale push token');
    }
  }
}
