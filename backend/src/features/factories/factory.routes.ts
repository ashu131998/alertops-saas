import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../infrastructure/database/prisma';
import { authenticate, authorize } from '../../core/middleware/auth';
import { validate } from '../../core/middleware/validate';
import { AppError } from '../../core/errors/AppError';

const createFactorySchema = z.object({
  name: z.string().min(1).max(100),
  location: z.string().min(1).max(200),
  timezone: z.string().default('UTC'),
});

export const factoryRouter = Router();
factoryRouter.use(authenticate);

factoryRouter.get('/', async (req, res, next) => {
  try {
    const factories = await prisma.factory.findMany({ where: { deletedAt: null }, orderBy: { name: 'asc' } });
    res.json({ data: factories });
  } catch (err) { next(err); }
});

factoryRouter.get('/:id', async (req, res, next) => {
  try {
    const factory = await prisma.factory.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!factory) throw AppError.notFound('Factory not found');
    res.json({ data: factory });
  } catch (err) { next(err); }
});

factoryRouter.post('/', authorize('ADMIN'), validate(createFactorySchema), async (req, res, next) => {
  try {
    const factory = await prisma.factory.create({ data: req.body });
    res.status(201).json({ data: factory });
  } catch (err) { next(err); }
});
