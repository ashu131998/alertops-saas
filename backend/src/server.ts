import http from 'http';
import { createApp } from './app';
import { config } from './config';
import { logger } from './config/logger';
import { connectDatabase, disconnectDatabase } from './infrastructure/database/prisma';
import { wsGateway } from './infrastructure/websocket/WebSocketGateway';
import { registerWebSocketHandlers } from './core/events/handlers/WebSocketHandler';
import { registerPushNotificationHandlers } from './core/events/handlers/PushNotificationHandler';
import { registerAuditLogHandlers } from './core/events/handlers/AuditLogHandler';

async function bootstrap() {
  await connectDatabase();

  // Register event bus consumers
  registerWebSocketHandlers();
  registerPushNotificationHandlers();
  registerAuditLogHandlers();

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
