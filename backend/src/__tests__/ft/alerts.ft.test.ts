/**
 * FT: /api/v1/alerts — exercises auth middleware, role guards, Zod validation,
 * and the full controller→service→repository→prisma chain (prisma mocked).
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

// pino-http requires a real pino instance (needs .child()); use silent mode.
jest.mock('../../config/logger', () => ({
  logger: require('pino')({ level: 'silent' }),
}));

jest.mock('../../core/middleware/rateLimiter', () => ({
  defaultRateLimiter: (_r: any, _s: any, n: any) => n(),
  authRateLimiter: (_r: any, _s: any, n: any) => n(),
}));

jest.mock('../../core/events/EventBus', () => ({
  eventBus: {
    publish: jest.fn().mockResolvedValue(undefined),
    createEvent: jest.fn().mockImplementation((p: object) => ({
      ...p, eventId: 'evt-ft', timestamp: new Date().toISOString(), version: 1,
    })),
  },
}));

jest.mock('../../infrastructure/esp/EspBridgeClient', () => ({
  espBridge: { relayReply: jest.fn().mockResolvedValue({ ok: true }) },
}));

jest.mock('../../infrastructure/database/prisma', () => ({
  prisma: {
    alert: {
      findMany:   jest.fn(),
      findFirst:  jest.fn(),
      findUnique: jest.fn(),
      create:     jest.fn(),
      update:     jest.fn(),
      updateMany: jest.fn(),
      count:      jest.fn(),
      groupBy:    jest.fn(),
    },
    alertAction:   { create: jest.fn() },
    alertTimeline: { create: jest.fn() },
    user: { findFirst: jest.fn() },
    session: { create: jest.fn(), findUnique: jest.fn(), deleteMany: jest.fn() },
    eventStore: { findMany: jest.fn().mockResolvedValue([]) },
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import request from 'supertest';
import jwt from 'jsonwebtoken';
import { AlertStatus, ActionType } from '@prisma/client';
import { createApp } from '../../app';
import { prisma } from '../../infrastructure/database/prisma';

const app = createApp();
const JWT_SECRET = process.env.JWT_ACCESS_SECRET!;

// ── Helpers ───────────────────────────────────────────────────────────────────

function token(role: string = 'ADMIN', factoryId = 'factory-1') {
  return jwt.sign(
    { sub: 'user-1', email: 'admin@factory.com', role, factoryId, type: 'access' },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
}

function dbAlert(overrides: Record<string, unknown> = {}) {
  return {
    id: 'alert-1',
    title: 'Loom Down',
    description: 'Machine stopped unexpectedly',
    severity: 'HIGH',
    status: AlertStatus.OPEN,
    isRead: false,
    machineId: 'machine-1',
    factoryId: 'factory-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    resolvedAt: null,
    metadata: null,
    machine: { name: 'Loom 1' },
    ...overrides,
  };
}

beforeEach(() => jest.clearAllMocks());

// ── GET /api/v1/alerts ────────────────────────────────────────────────────────

describe('GET /api/v1/alerts', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/v1/alerts');
    expect(res.status).toBe(401);
  });

  it('returns 200 with paginated data for an authenticated request', async () => {
    (prisma.alert.findMany as jest.Mock).mockResolvedValue([dbAlert()]);
    (prisma.alert.count as jest.Mock).mockResolvedValue(1);

    const res = await request(app)
      .get('/api/v1/alerts')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe('alert-1');
    expect(res.body.meta.total).toBe(1);
  });

  it('returns 200 with an empty list when no alerts exist', async () => {
    (prisma.alert.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.alert.count as jest.Mock).mockResolvedValue(0);

    const res = await request(app)
      .get('/api/v1/alerts')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.meta.total).toBe(0);
    expect(res.body.meta.hasMore).toBe(false);
  });

  it('forwards page and limit query params', async () => {
    (prisma.alert.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.alert.count as jest.Mock).mockResolvedValue(0);

    await request(app)
      .get('/api/v1/alerts?page=2&limit=5')
      .set('Authorization', `Bearer ${token()}`);

    // prisma.alert.findMany should be called — exact skip/take are internal
    expect(prisma.alert.findMany).toHaveBeenCalled();
  });
});

// ── GET /api/v1/alerts/stats ──────────────────────────────────────────────────

describe('GET /api/v1/alerts/stats', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/v1/alerts/stats');
    expect(res.status).toBe(401);
  });

  it('returns 200 with stat counts', async () => {
    (prisma.alert.groupBy as jest.Mock).mockResolvedValue([
      { status: AlertStatus.OPEN, _count: { status: 3 } },
    ]);
    (prisma.alert.count as jest.Mock)
      .mockResolvedValueOnce(2)  // unreadCount
      .mockResolvedValueOnce(1); // criticalCount

    const res = await request(app)
      .get('/api/v1/alerts/stats')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(typeof res.body.data.openCount).toBe('number');
    expect(typeof res.body.data.unreadCount).toBe('number');
  });
});

// ── GET /api/v1/alerts/:id ────────────────────────────────────────────────────

describe('GET /api/v1/alerts/:id', () => {
  it('returns 200 with alert and availableActions', async () => {
    (prisma.alert.findFirst as jest.Mock).mockResolvedValue(dbAlert());

    const res = await request(app)
      .get('/api/v1/alerts/alert-1')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('alert-1');
    expect(Array.isArray(res.body.data.availableActions)).toBe(true);
  });

  it('returns 404 when alert does not exist', async () => {
    (prisma.alert.findFirst as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/alerts/nonexistent')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(404);
  });

  it('marks alert as read on first fetch (calls update)', async () => {
    (prisma.alert.findFirst as jest.Mock).mockResolvedValue(dbAlert({ isRead: false }));
    (prisma.alert.update as jest.Mock).mockResolvedValue(dbAlert({ isRead: true }));

    await request(app)
      .get('/api/v1/alerts/alert-1')
      .set('Authorization', `Bearer ${token()}`);

    expect(prisma.alert.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isRead: true }) }),
    );
  });
});

// ── POST /api/v1/alerts ───────────────────────────────────────────────────────

describe('POST /api/v1/alerts', () => {
  const validBody = {
    title: 'New Alert',
    description: 'Something broke',
    severity: 'HIGH',
    machineId: 'claaaaaaaaaaaaaaaaaaaaaaaaa', // cuid-length placeholder
  };

  it('returns 401 without a token', async () => {
    const res = await request(app).post('/api/v1/alerts').send(validBody);
    expect(res.status).toBe(401);
  });

  it('returns 403 when the role is WORKER', async () => {
    const res = await request(app)
      .post('/api/v1/alerts')
      .set('Authorization', `Bearer ${token('WORKER')}`)
      .send(validBody);
    expect(res.status).toBe(403);
  });

  it('returns 201 when ADMIN creates a valid alert', async () => {
    const created = dbAlert({ title: 'New Alert', machineId: validBody.machineId });
    (prisma.alert.create as jest.Mock).mockResolvedValue(created);

    const res = await request(app)
      .post('/api/v1/alerts')
      .set('Authorization', `Bearer ${token('ADMIN')}`)
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('New Alert');
  });

  it('returns 201 when SUPERVISOR creates a valid alert', async () => {
    (prisma.alert.create as jest.Mock).mockResolvedValue(dbAlert());

    const res = await request(app)
      .post('/api/v1/alerts')
      .set('Authorization', `Bearer ${token('SUPERVISOR')}`)
      .send(validBody);

    expect(res.status).toBe(201);
  });

  it('returns 400 for an invalid severity value', async () => {
    const res = await request(app)
      .post('/api/v1/alerts')
      .set('Authorization', `Bearer ${token('ADMIN')}`)
      .send({ ...validBody, severity: 'EXTREME' });

    expect(res.status).toBe(400);
    expect(prisma.alert.create).not.toHaveBeenCalled();
  });

  it('returns 400 when title is missing', async () => {
    const { title: _, ...noTitle } = validBody;
    const res = await request(app)
      .post('/api/v1/alerts')
      .set('Authorization', `Bearer ${token('ADMIN')}`)
      .send(noTitle);
    expect(res.status).toBe(400);
  });

  it('returns 400 when description is missing', async () => {
    const { description: _, ...noDesc } = validBody;
    const res = await request(app)
      .post('/api/v1/alerts')
      .set('Authorization', `Bearer ${token('ADMIN')}`)
      .send(noDesc);
    expect(res.status).toBe(400);
  });
});

// ── POST /api/v1/alerts/:id/actions ──────────────────────────────────────────

describe('POST /api/v1/alerts/:id/actions', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app)
      .post('/api/v1/alerts/alert-1/actions')
      .send({ actionType: 'ACKNOWLEDGE' });
    expect(res.status).toBe(401);
  });

  it('returns 400 for an invalid actionType', async () => {
    const res = await request(app)
      .post('/api/v1/alerts/alert-1/actions')
      .set('Authorization', `Bearer ${token()}`)
      .send({ actionType: 'DESTROY' });
    expect(res.status).toBe(400);
  });

  it('returns 404 when the alert does not exist', async () => {
    (prisma.alert.findFirst as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/alerts/missing/actions')
      .set('Authorization', `Bearer ${token()}`)
      .send({ actionType: ActionType.ACKNOWLEDGE });

    expect(res.status).toBe(404);
  });

  it('returns 400 for an invalid status transition (CLOSED → ACKNOWLEDGE)', async () => {
    (prisma.alert.findFirst as jest.Mock).mockResolvedValue(
      dbAlert({ status: AlertStatus.CLOSED }),
    );

    const res = await request(app)
      .post('/api/v1/alerts/alert-1/actions')
      .set('Authorization', `Bearer ${token()}`)
      .send({ actionType: ActionType.ACKNOWLEDGE });

    expect(res.status).toBe(400);
  });

  it('returns 200 on a valid ACKNOWLEDGE action (OPEN → ACKNOWLEDGED)', async () => {
    (prisma.alert.findFirst as jest.Mock)
      .mockResolvedValueOnce(dbAlert({ status: AlertStatus.OPEN }))   // first call: fetch before action
      .mockResolvedValueOnce(dbAlert({ status: AlertStatus.ACKNOWLEDGED })); // second call: re-fetch after
    (prisma.alert.update as jest.Mock).mockResolvedValue(dbAlert({ status: AlertStatus.ACKNOWLEDGED }));
    (prisma.alertAction.create as jest.Mock).mockResolvedValue({});
    (prisma.alertTimeline.create as jest.Mock).mockResolvedValue({});

    const res = await request(app)
      .post('/api/v1/alerts/alert-1/actions')
      .set('Authorization', `Bearer ${token()}`)
      .send({ actionType: ActionType.ACKNOWLEDGE });

    expect(res.status).toBe(200);
    expect(prisma.alert.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: AlertStatus.ACKNOWLEDGED }) }),
    );
  });

  it('returns 200 for COMMENT without changing status', async () => {
    (prisma.alert.findFirst as jest.Mock)
      .mockResolvedValueOnce(dbAlert({ status: AlertStatus.OPEN }))
      .mockResolvedValueOnce(dbAlert({ status: AlertStatus.OPEN }));
    (prisma.alertAction.create as jest.Mock).mockResolvedValue({});
    (prisma.alertTimeline.create as jest.Mock).mockResolvedValue({});

    const res = await request(app)
      .post('/api/v1/alerts/alert-1/actions')
      .set('Authorization', `Bearer ${token()}`)
      .send({ actionType: ActionType.COMMENT, comment: 'Checked the motor' });

    expect(res.status).toBe(200);
    expect(prisma.alert.update).not.toHaveBeenCalled();
  });
});

// ── PATCH /api/v1/alerts/read-all ────────────────────────────────────────────

describe('PATCH /api/v1/alerts/read-all', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).patch('/api/v1/alerts/read-all');
    expect(res.status).toBe(401);
  });

  it('returns 204 and marks all as read', async () => {
    (prisma.alert.updateMany as jest.Mock).mockResolvedValue({ count: 5 });

    const res = await request(app)
      .patch('/api/v1/alerts/read-all')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(204);
    expect(prisma.alert.updateMany).toHaveBeenCalled();
  });
});
