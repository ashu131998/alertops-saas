import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).regex(/[A-Z]/, 'Must contain uppercase').regex(/[0-9]/, 'Must contain number'),
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
  role: z.enum(['ADMIN', 'SUPERVISOR', 'WORKER']).default('WORKER'),
  factoryId: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});
