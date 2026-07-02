import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import { config } from './config';
import { logger } from './config/logger';
import { requestId } from './core/middleware/requestId';
import { defaultRateLimiter } from './core/middleware/rateLimiter';
import { errorHandler, notFoundHandler } from './core/middleware/errorHandler';
import { authRouter } from './features/auth/auth.routes';
import { alertRouter } from './features/alerts/alert.routes';
import { machineRouter } from './features/machines/machine.routes';
import { factoryRouter } from './features/factories/factory.routes';
import { notificationRouter } from './features/notifications/notification.routes';

export function createApp() {
  const app = express();

  // Security & parsing
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(compression());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Logging & IDs
  app.use(pinoHttp({ logger }));
  app.use(requestId);

  // Rate limiting
  app.use(defaultRateLimiter);

  // Health check (no auth)
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() });
  });

  // Events sync endpoint
  app.get('/events/sync', async (req, res, next) => {
    try {
      const { prisma } = await import('./infrastructure/database/prisma');
      const afterSequence = req.query.afterSequence ? BigInt(req.query.afterSequence as string) : BigInt(0);
      const events = await prisma.eventStore.findMany({
        where: { sequence: { gt: afterSequence } },
        orderBy: { sequence: 'asc' },
        take: 100,
      });
      res.json({ data: events.map((e) => ({ ...e, sequence: e.sequence.toString() })) });
    } catch (err) { next(err); }
  });

  // Swagger docs
  const swaggerSpec = swaggerJsdoc({
    definition: {
      openapi: '3.0.0',
      info: { title: 'Industrial Alert Platform API', version: '1.0.0' },
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    },
    apis: ['./src/features/**/*.routes.ts'],
  });
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  // API routes
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/alerts', alertRouter);
  app.use('/api/v1/machines', machineRouter);
  app.use('/api/v1/factories', factoryRouter);
  app.use('/api/v1/notifications', notificationRouter);

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
