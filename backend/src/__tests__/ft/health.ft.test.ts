/**
 * FT: /health — no auth, no DB.
 */
// pino-http requires a real pino instance (needs .child()); use silent mode.
jest.mock('../../config/logger', () => ({
  logger: require('pino')({ level: 'silent' }),
}));
jest.mock('../../core/middleware/rateLimiter', () => ({
  defaultRateLimiter: (_r: any, _s: any, n: any) => n(),
  authRateLimiter: (_r: any, _s: any, n: any) => n(),
}));
jest.mock('../../infrastructure/database/prisma', () => ({
  prisma: { eventStore: { findMany: jest.fn().mockResolvedValue([]) } },
}));

import request from 'supertest';
import { createApp } from '../../app';

const app = createApp();

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('includes a timestamp', async () => {
    const res = await request(app).get('/health');
    expect(typeof res.body.timestamp).toBe('string');
    expect(() => new Date(res.body.timestamp)).not.toThrow();
  });

  it('includes uptime as a number', async () => {
    const res = await request(app).get('/health');
    expect(typeof res.body.uptime).toBe('number');
    expect(res.body.uptime).toBeGreaterThanOrEqual(0);
  });
});

describe('unknown routes', () => {
  it('returns 404 for an unregistered path', async () => {
    const res = await request(app).get('/api/v1/nonexistent');
    expect(res.status).toBe(404);
  });
});
