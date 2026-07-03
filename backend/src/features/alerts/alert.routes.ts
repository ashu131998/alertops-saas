import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../infrastructure/database/prisma';
import { authenticate, authorize } from '../../core/middleware/auth';
import { validate } from '../../core/middleware/validate';
import { AlertRepository } from './alert.repository';
import { AlertService } from './alert.service';
import { AlertController } from './alert.controller';

const createAlertSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  machineId: z.string().cuid(),
  metadata: z.record(z.unknown()).optional(),
});

const takeActionSchema = z.object({
  actionType: z.enum(['ACKNOWLEDGE', 'START_REPAIR', 'ESCALATE', 'RESOLVE', 'CLOSE', 'COMMENT']),
  comment: z.string().max(1000).optional(),
});

const respondSchema = z.object({
  optionId: z.string().min(1),
});

const repo = new AlertRepository(prisma);
const service = new AlertService(repo);
const controller = new AlertController(service);

export const alertRouter = Router();

alertRouter.use(authenticate);

alertRouter.get('/', controller.list);
alertRouter.get('/stats', controller.getDashboardStats);
alertRouter.patch('/read-all', controller.markAllRead);
alertRouter.get('/:id', controller.getOne);
alertRouter.post('/', authorize('ADMIN', 'SUPERVISOR'), validate(createAlertSchema), controller.create);
alertRouter.post('/:id/actions', validate(takeActionSchema), controller.takeAction);
alertRouter.post('/:id/respond', validate(respondSchema), controller.respond);
