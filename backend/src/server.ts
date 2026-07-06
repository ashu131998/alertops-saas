import http from 'http';
import { createApp } from './app';
import { config } from './config';
import { logger } from './config/logger';
import { connectDatabase, disconnectDatabase, prisma } from './infrastructure/database/prisma';
import { wsGateway } from './infrastructure/websocket/WebSocketGateway';
import { registerWebSocketHandlers } from './core/events/handlers/WebSocketHandler';
import { registerPushNotificationHandlers } from './core/events/handlers/PushNotificationHandler';
import { registerMachineDowntimeHandler } from './core/events/handlers/MachineDowntimeHandler';
import { outbox } from './core/events/outbox/Outbox';
import { outboxDispatcher } from './core/events/outbox/OutboxDispatcher';
import { OutboxWorker } from './core/events/outbox/OutboxWorker';

async function bootstrap() {
  await connectDatabase();

  // Instant, best-effort live-view fan-out (WebSocket) runs on the in-process bus.
  registerWebSocketHandlers();

  // Durable side effects (push, downtime-alert creation) run off the persisted
  // outbox via the worker, so they survive crashes and are retried on failure.
  registerPushNotificationHandlers(outboxDispatcher);
  registerMachineDowntimeHandler(outboxDispatcher);

  const outboxWorker = new OutboxWorker(prisma, outboxDispatcher, {
    pollIntervalMs: config.OUTBOX_POLL_INTERVAL_MS,
    batchSize: config.OUTBOX_BATCH_SIZE,
    maxAttempts: config.OUTBOX_MAX_ATTEMPTS,
    baseBackoffMs: config.OUTBOX_BASE_BACKOFF_MS,
    maxBackoffMs: config.OUTBOX_MAX_BACKOFF_MS,
  });
  outbox.registerWorker(outboxWorker);
  if (config.OUTBOX_ENABLED) outboxWorker.start();

  const app = createApp();
  const server = http.createServer(app);

  // Attach WebSocket gateway
  wsGateway.attach(server);

  server.listen(config.PORT, () => {
    logger.info({ port: config.PORT, env: config.NODE_ENV }, '🚀 Server running');
    logger.info(`📚 Swagger docs: http://localhost:${config.PORT}/docs`);
    logger.info(`🔌 WebSocket: ws://localhost:${config.PORT}/ws`);
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Received shutdown signal');
    wsGateway.close();
    await outboxWorker.stop();
    server.close(async () => {
      await disconnectDatabase();
      logger.info('Server shut down gracefully');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception');
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'Unhandled rejection');
    process.exit(1);
  });
}

bootstrap().catch((err) => {
  console.error('Bootstrap failed:', err);
  process.exit(1);
});
