import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../infrastructure/database/prisma';
import { authenticate } from '../../core/middleware/auth';
import { validate } from '../../core/middleware/validate';

const registerTokenSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(['EXPO', 'FCM', 'APNS', 'WEBPUSH']).default('EXPO'),
});

export const notificationRouter = Router();
notificationRouter.use(authenticate);

notificationRouter.post('/tokens', validate(registerTokenSchema), async (req, res, next) => {
  try {
    const { token, platform } = req.body;
    await prisma.notificationToken.upsert({
      where: { token },
      update: { userId: req.user!.id, platform, isActive: true },
      create: { userId: req.user!.id, token, platform },
    });
    res.status(201).json({ data: { message: 'Token registered' } });
  } catch (err) { next(err); }
});

notificationRouter.delete('/tokens/:token', async (req, res, next) => {
  try {
    await prisma.notificationToken.updateMany({
      where: { token: req.params.token, userId: req.user!.id },
      data: { isActive: false },
    });
    res.status(204).send();
  } catch (err) { next(err); }
});
