/**
 * FT: /api/v1/auth — full Express stack, prisma mocked at the boundary.
 *
 * What we are testing here that unit tests cannot:
 *   - Zod validation middleware rejects malformed requests before they hit the service
 *   - JWT middleware blocks requests with missing/bad/expired tokens
 *   - Route wiring (POST /login calls the right handler, GET /me is behind auth)
 *   - HTTP status codes and response shapes produced by real controllers
 */

// ── Mocks (hoisted before imports) ───────────────────────────────────────────

// pino-http requires a real pino instance (needs .child()); use silent mode.
jest.mock('../../config/logger', () => ({
  logger: require('pino')({ level: 'silent' }),
}));

jest.mock('../../core/middleware/rateLimiter', () => ({
  defaultRateLimiter: (_r: any, _s: any, n: any) => n(),
  authRateLimiter: (_r: any, _s: any, n: any) => n(),
}));

// Prisma mock — auth repository uses user.findFirst + session.*
jest.mock('../../infrastructure/database/prisma', () => ({
  prisma: {
    user: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    session: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    eventStore: { findMany: jest.fn().mockResolvedValue([]) },
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app';
import { prisma } from '../../infrastructure/database/prisma';

const app = createApp();

const JWT_SECRET = process.env.JWT_ACCESS_SECRET!;

// ── Fixtures ──────────────────────────────────────────────────────────────────

let passwordHash: string;

beforeAll(async () => {
  // Low rounds so beforeAll is fast; still exercises the real bcrypt path.
  passwordHash = await bcrypt.hash('Test@123!', 4);
});

beforeEach(() => jest.clearAllMocks());

function dbUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    email: 'admin@factory.com',
    passwordHash,
    firstName: 'Test',
    lastName: 'Admin',
    role: 'ADMIN',
    factoryId: 'factory-1',
    isActive: true,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    factory: { id: 'factory-1', name: 'Factory Alpha' },
    ...overrides,
  };
}

function makeToken(overrides: Record<string, unknown> = {}) {
  return jwt.sign(
    {
      sub: 'user-1',
      email: 'admin@factory.com',
      role: 'ADMIN',
      factoryId: 'factory-1',
      type: 'access',
      ...overrides,
    },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
}

// ── POST /api/v1/auth/login ───────────────────────────────────────────────────

describe('POST /api/v1/auth/login', () => {
  it('returns 200 with tokens on valid credentials', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue(dbUser());
    (prisma.session.create as jest.Mock).mockResolvedValue({ id: 'sess-1' });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@factory.com', password: 'Test@123!' });

    expect(res.status).toBe(200);
    expect(res.body.data.tokens.accessToken).toBeDefined();
    expect(res.body.data.tokens.refreshToken).toBeDefined();
    expect(res.body.data.user.email).toBe('admin@factory.com');
    expect(res.body.data.user.passwordHash).toBeUndefined(); // never exposed
  });

  it('returns 401 when user does not exist', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@factory.com', password: 'anything' });

    expect(res.status).toBe(401);
  });

  it('returns 401 when password is wrong', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue(dbUser());

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@factory.com', password: 'WrongPassword!' });

    expect(res.status).toBe(401);
  });

  it('returns 401 when account is inactive', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue(dbUser({ isActive: false }));

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@factory.com', password: 'Test@123!' });

    expect(res.status).toBe(401);
  });

  it('returns 400 when email is missing', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ password: 'Test@123!' });

    expect(res.status).toBe(400);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('returns 400 when password is missing', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@factory.com' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when body is empty', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({});

    expect(res.status).toBe(400);
  });
});

// ── GET /api/v1/auth/me ───────────────────────────────────────────────────────

describe('GET /api/v1/auth/me', () => {
  it('returns 200 with user data for a valid token', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue(dbUser());

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('user-1');
    expect(res.body.data.email).toBe('admin@factory.com');
  });

  it('returns 401 when no Authorization header is provided', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 when the token is malformed', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer not.a.valid.jwt');
    expect(res.status).toBe(401);
  });

  it('returns 401 when the token is signed with the wrong secret', async () => {
    const badToken = jwt.sign(
      { sub: 'user-1', email: 'a@b.com', role: 'ADMIN', factoryId: 'f1', type: 'access' },
      'wrong-secret-entirely',
      { expiresIn: '1h' },
    );
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${badToken}`);
    expect(res.status).toBe(401);
  });

  it('returns 401 when a refresh token is used instead of an access token', async () => {
    const refreshToken = jwt.sign(
      { sub: 'user-1', type: 'refresh' },
      JWT_SECRET,
      { expiresIn: '7d' },
    );
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${refreshToken}`);
    expect(res.status).toBe(401);
  });

  it('returns 401 for an expired token', async () => {
    const expired = jwt.sign(
      { sub: 'user-1', email: 'a@b.com', role: 'ADMIN', factoryId: 'f1', type: 'access' },
      JWT_SECRET,
      { expiresIn: '-1s' }, // already expired
    );
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });
});

// ── POST /api/v1/auth/refresh ─────────────────────────────────────────────────

describe('POST /api/v1/auth/refresh', () => {
  it('returns 400 when refreshToken is missing', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 401 for an unknown refresh token', async () => {
    (prisma.session.findUnique as jest.Mock).mockResolvedValue(null);
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'unknown-token' });
    expect(res.status).toBe(401);
  });
});
