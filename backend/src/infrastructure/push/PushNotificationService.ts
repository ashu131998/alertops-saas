import Expo, { ExpoPushMessage } from 'expo-server-sdk';
import { PrismaClient } from '@prisma/client';
import { logger } from '../../config/logger';

export class PushNotificationService {
  private readonly expo: Expo;

  constructor(private readonly db: PrismaClient, accessToken?: string) {
    this.expo = new Expo({ accessToken });
  }

  async sendToFactory(
    factoryId: string,
    notification: { title: string; body: string; data?: Record<string, unknown> },
  ): Promise<void> {
    const tokens = await this.db.notificationToken.findMany({
      where: {
        isActive: true,
        platform: 'EXPO',
        user: { factoryId, isActive: true, deletedAt: null },
      },
      select: { token: true },
    });

    if (tokens.length === 0) return;

    const messages: ExpoPushMessage[] = tokens
      .filter(({ token }) => Expo.isExpoPushToken(token))
      .map(({ token }) => ({
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

  async sendToUser(
    userId: string,
    notification: { title: string; body: string; data?: Record<string, unknown> },
  ): Promise<void> {
    const tokens = await this.db.notificationToken.findMany({
      where: { userId, isActive: true, platform: 'EXPO' },
      select: { token: true },
    });

    if (tokens.length === 0) return;

    const messages: ExpoPushMessage[] = tokens
      .filter(({ token }) => Expo.isExpoPushToken(token))
      .map(({ token }) => ({
        to: token,
        title: notification.title,
        body: notification.body,
        data: notification.data ?? {},
        sound: 'default',
        priority: 'high',
      }));

    try {
      await this.expo.sendPushNotificationsAsync(messages);
    } catch (err) {
      logger.error({ err, userId }, 'Failed to send push notification to user');
    }
  }
}
