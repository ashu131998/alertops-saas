import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../infrastructure/database/prisma';
import { integrationAuth } from '../../core/middleware/integrationAuth';
import { validate } from '../../core/middleware/validate';
import { IntegrationService } from './integration.service';

const service = new IntegrationService(prisma);

const syncWorkerSchema = z.object({
  externalFactoryId: z.string().min(1),
  factoryName: z.string().optional(),
  factoryLocation: z.string().optional(),
  externalWorkerId: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8).optional(),
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
  role: z.enum(['ADMIN', 'SUPERVISOR', 'WORKER']).optional(),
  phone: z.string().optional(),
});

const notifySchema = z.object({
  externalFactoryId: z.string().min(1),
  externalWorkerIds: z.array(z.string()).min(1),
  title: z.string().min(1).max(200),
  body: z.string().min(1),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  externalMachineId: z.string().optional(),
  externalMachineName: z.string().optional(),
  data: z.record(z.unknown()).optional(),
});

export const integrationRouter = Router();

integrationRouter.use(integrationAuth);

integrationRouter.post('/sync-worker', validate(syncWorkerSchema), async (req, res, next) => {
  try {
    const result = await service.syncWorker(req.body);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
});

integrationRouter.post('/notify', validate(notifySchema), async (req, res, next) => {
  try {
    const result = await service.notify(req.body);
    res.status(202).json({ data: result });
  } catch (err) {
    next(err);
  }
});
