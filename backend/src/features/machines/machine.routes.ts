import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../infrastructure/database/prisma';
import { authenticate, authorize } from '../../core/middleware/auth';
import { validate } from '../../core/middleware/validate';
import { MachineRepository } from './machine.repository';
import { MachineService } from './machine.service';
import { MachineController } from './machine.controller';

const createMachineSchema = z.object({
  name: z.string().min(1).max(100),
  serialNumber: z.string().min(1).max(100),
  model: z.string().optional(),
  location: z.string().min(1).max(200),
});

const updateStatusSchema = z.object({
  status: z.enum(['ONLINE', 'OFFLINE', 'WARNING', 'CRITICAL', 'MAINTENANCE']),
  reason: z.string().max(500).optional(),
});

const repo = new MachineRepository(prisma);
const service = new MachineService(repo);
const controller = new MachineController(service);

export const machineRouter = Router();

machineRouter.use(authenticate);

machineRouter.get('/', controller.list);
machineRouter.get('/status-summary', controller.getStatusSummary);
machineRouter.get('/:id', controller.getOne);
machineRouter.post('/', authorize('ADMIN', 'SUPERVISOR'), validate(createMachineSchema), controller.create);
machineRouter.patch('/:id/status', authorize('ADMIN', 'SUPERVISOR'), validate(updateStatusSchema), controller.updateStatus);
