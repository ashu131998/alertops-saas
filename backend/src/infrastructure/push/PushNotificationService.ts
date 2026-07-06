import Expo, { ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import webpush, { PushSubscription } from 'web-push';
import { PrismaClient, NotificationPlatform, DeliveryStatus } from '@prisma/client';
import { logger } from '../../config/logger';
import { config } from '../../config';

type Notification = { title: string; body: string; data?: Record<string, unknown> };
type Recipient = { userId: string; token: string; platform: NotificationPlatform };

// Outcome of a single push attempt. `permanent` failures (dead token, malformed
// subscription) retire the token and are NOT retried; `retryable` failures
// (network, 5xx) bubble up so the outbox worker re-drives the event later.
type SendOutcome = 'sent' | 'retryable' | 'permanent';

// Configure VAPID once at module load if keys are present. Web push is simply
// skipped when they are not, so the server still runs without them.
const webPushEnabled = Boolean(config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY);
if (webPushEnabled) {
  webpush.setVapidDetails(config.VAPID_SUBJECT, config.VAPID_PUBLIC_KEY!, config.VAPID_PRIVATE_KEY!);
}

// Only query for WEBPUSH tokens once web push is actually enabled. This keeps
// the WEBPUSH enum value out of DB queries on environments where the schema
// hasn't been migrated yet, so an older prod DB can't error on an unknown enum.
const PUSH_PLATFORMS: NotificationPlatform[] = webPushEnabled
  ? [NotificationPlatform.EXPO, NotificationPlatform.WEBPUSH]
  : [NotificationPlatform.EXPO];

export class PushNotificationService {
  private readonly expo: Expo;

  constructor(private readonly db: PrismaClient, accessToken?: string) {
    this.expo = new Expo({ accessToken });
  }

  /**
   * Deliver an alert to every active device of the given users, recording a
   * per-recipient receipt keyed by `eventId`. Safe to call repeatedly for the
   * same event: recipients already marked SENT are skipped, so worker retries
   * never double-notify. Throws if any recipient failed transiently, so the
   * outbox worker retries the event.
   */
  async deliverToUsers(eventId: string, userIds: string[], notification: Notification): Promise<void> {
    if (userIds.length === 0) return;
    const tokens = await this.db.notificationToken.findMany({
      where: { userId: { in: userIds }, isActive: true, platform: { in: PUSH_PLATFORMS } },
      select: { userId: true, token: true, platform: true },
    });
    await this.deliver(eventId, tokens, notification);
  }

  /** Deliver an alert to every active device in a factory, with receipts. */
  async deliverToFactory(eventId: string, factoryId: string, notification: Notification): Promise<void> {
    const tokens = await this.db.notificationToken.findMany({
      where: {
        isActive: true,
        platform: { in: PUSH_PLATFORMS },
        user: { factoryId, isActive: true, deletedAt: null },
      },
      select: { userId: true, token: true, platform: true },
    });
    await this.deliver(eventId, tokens, notification);
  }

  private async deliver(eventId: string, recipients: Recipient[], notification: Notification): Promise<void> {
    if (recipients.length === 0) return;

    // Reserve a receipt per recipient (idempotent on the unique key). Existing
    // receipts keep their status so an already-SENT recipient is never resent.
    await Promise.all(
      recipients.map((r) =>
        this.db.notificationDelivery.upsert({
          where: {
            eventId_userId_channel_token: {
              eventId,
              userId: r.userId,
              channel: r.platform,
              token: r.token,
            },
          },
          create: { eventId, userId: r.userId, channel: r.platform, token: r.token, status: DeliveryStatus.PENDING },
          update: {},
        }),
      ),
    );

    const pending = await this.db.notificationDelivery.findMany({
      where: { eventId, status: { not: DeliveryStatus.SENT } },
    });

    let retryable = 0;
    await Promise.all(
      pending.map(async (receipt) => {
        const outcome =
          receipt.channel === NotificationPlatform.WEBPUSH
            ? await this.sendWebPush(receipt.token, notification)
            : await this.sendExpo(receipt.token, notification);

        if (outcome === 'sent') {
          await this.db.notificationDelivery.update({
            where: { id: receipt.id },
            data: { status: DeliveryStatus.SENT, sentAt: new Date(), attempts: { increment: 1 }, error: null },
          });
        } else {
          if (outcome === 'permanent') await this.deactivate(receipt.token);
          if (outcome === 'retryable') retryable += 1;
          await this.db.notificationDelivery.update({
            where: { id: receipt.id },
            data: { status: DeliveryStatus.FAILED, attempts: { increment: 1 }, error: outcome },
          });
        }
      }),
    );

    // Only transient failures should force an event retry — permanent failures
    // (dead tokens) are terminal and already retired.
    if (retryable > 0) {
      throw new Error(`${retryable} push delivery(ies) failed transiently for event ${eventId}`);
    }
  }

  private async sendExpo(token: string, notification: Notification): Promise<SendOutcome> {
    if (!Expo.isExpoPushToken(token)) {
      logger.warn({ token }, 'Invalid Expo push token; retiring');
      return 'permanent';
    }
    const message: ExpoPushMessage = {
      to: token,
      title: notification.title,
      body: notification.body,
      data: notification.data ?? {},
      sound: 'default',
      priority: 'high',
    };
    try {
      const [ticket] = await this.expo.sendPushNotificationsAsync([message]);
      return this.classifyExpoTicket(ticket);
    } catch (err) {
      logger.error({ err }, 'Expo push send failed (transient)');
      return 'retryable';
    }
  }

  private classifyExpoTicket(ticket: ExpoPushTicket | undefined): SendOutcome {
    if (!ticket) return 'retryable';
    if (ticket.status === 'ok') return 'sent';
    // DeviceNotRegistered means the token is gone for good.
    if (ticket.details?.error === 'DeviceNotRegistered') return 'permanent';
    logger.warn({ ticket }, 'Expo push ticket error (transient)');
    return 'retryable';
  }

  private async sendWebPush(raw: string, notification: Notification): Promise<SendOutcome> {
    if (!webPushEnabled) return 'permanent';

    let subscription: PushSubscription;
    try {
      subscription = JSON.parse(raw) as PushSubscription;
    } catch {
      logger.warn('Malformed web push subscription; retiring');
      return 'permanent';
    }

    const payload = JSON.stringify({
      title: notification.title,
      body: notification.body,
      data: notification.data ?? {},
    });

    try {
      // High urgency + a long TTL so a phone that is offline / asleep still
      // receives the alert when it reconnects (FCM holds it for the TTL).
      await webpush.sendNotification(subscription, payload, { TTL: 24 * 60 * 60, urgency: 'high' });
      return 'sent';
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number })?.statusCode;
      // 404/410 mean the subscription is gone for good — retire it.
      if (statusCode === 404 || statusCode === 410) return 'permanent';
      logger.error({ err }, 'Web push send failed (transient)');
      return 'retryable';
    }
  }

  private async deactivate(token: string): Promise<void> {
    try {
      await this.db.notificationToken.updateMany({ where: { token }, data: { isActive: false } });
    } catch (err) {
      logger.error({ err }, 'Failed to deactivate stale push token');
    }
  }
}
