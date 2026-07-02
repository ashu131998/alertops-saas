import { Router } from 'express';
import { prisma } from '../../infrastructure/database/prisma';
import { authenticate } from '../../core/middleware/auth';
import { validate } from '../../core/middleware/validate';
import { authRateLimiter } from '../../core/middleware/rateLimiter';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { loginSchema, registerSchema, refreshSchema } from './auth.validation';

const repo = new AuthRepository(prisma);
const service = new AuthService(repo);
const controller = new AuthController(service);

export const authRouter = Router();

/**
 * @swagger
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login with email and password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 */
authRouter.post('/login', authRateLimiter, validate(loginSchema), controller.login);

/**
 * @swagger
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user
 */
authRouter.post('/register', validate(registerSchema), controller.register);

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Refresh access token
 */
authRouter.post('/refresh', validate(refreshSchema), controller.refresh);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Logout and invalidate refresh token
 */
authRouter.post('/logout', validate(refreshSchema), controller.logout);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get current user profile
 *     security:
 *       - bearerAuth: []
 */
authRouter.get('/me', authenticate, controller.getMe);
