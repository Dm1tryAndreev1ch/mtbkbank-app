/**
 * Health endpoint integration tests.
 * Builds a minimal Express app per describe; injects mock req.prisma + mock redisClient.
 * Reference: VALIDATION row 1-08-01 + RESEARCH §6.3 + CONTEXT D-04 (5s cache locked).
 */
const supertest = require('supertest');
const express = require('express');

// Mock cache module BEFORE requiring the router so the redisClient binding is the mock.
const mockRedis = { isReady: true };
jest.mock('../src/cache', () => ({ redisClient: mockRedis }));

const healthRouter = require('../src/routes/health');
const { __resetReadyzCacheForTests } = healthRouter;

function buildApp(mockPrisma) {
  const app = express();
  app.use((req, _res, next) => { req.prisma = mockPrisma; next(); });
  app.use(healthRouter);
  return app;
}

beforeEach(() => {
  __resetReadyzCacheForTests();
  mockRedis.isReady = true;
});

describe('GET /healthz — liveness', () => {
  test('returns 200 with {status:"ok"}', async () => {
    const queryRawSpy = jest.fn();
    const app = buildApp({ $queryRaw: queryRawSpy });
    const res = await supertest(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  test('does NOT touch req.prisma.$queryRaw', async () => {
    const queryRawSpy = jest.fn(() => { throw new Error('should not be called'); });
    const app = buildApp({ $queryRaw: queryRawSpy });
    const res = await supertest(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(queryRawSpy).not.toHaveBeenCalled();
  });

  test('responds in <100ms even with unreachable deps', async () => {
    const app = buildApp({ $queryRaw: () => new Promise(() => { /* never resolves */ }) });
    const t0 = Date.now();
    await supertest(app).get('/healthz');
    expect(Date.now() - t0).toBeLessThan(100);
  });
});

describe('GET /readyz — readiness', () => {
  test('happy path → 200 with {status:"ready", db:"ok", redis:"ok"}', async () => {
    const app = buildApp({ $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) });
    const res = await supertest(app).get('/readyz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ready', db: 'ok', redis: 'ok' });
  });

  test('DB failure → 503', async () => {
    const app = buildApp({ $queryRaw: jest.fn().mockRejectedValue(new Error('db down')) });
    const res = await supertest(app).get('/readyz');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('unready');
    expect(res.body.error).toContain('db down');
  });

  test('Redis failure → 503 (db ok, redis_not_ready)', async () => {
    mockRedis.isReady = false;
    const app = buildApp({ $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) });
    const res = await supertest(app).get('/readyz');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('unready');
    expect(res.body.error).toBe('redis_not_ready');
  });

  test('5s cache: 2nd and 3rd calls within window do NOT re-ping DB', async () => {
    const queryRawSpy = jest.fn().mockResolvedValue([{ '?column?': 1 }]);
    const app = buildApp({ $queryRaw: queryRawSpy });
    await supertest(app).get('/readyz'); // miss → ping
    await supertest(app).get('/readyz'); // cache hit → no ping
    await supertest(app).get('/readyz'); // cache hit → no ping
    expect(queryRawSpy).toHaveBeenCalledTimes(1);
  });

  test('cache invalidated after __resetReadyzCacheForTests() → 4th call re-pings', async () => {
    const queryRawSpy = jest.fn().mockResolvedValue([{ '?column?': 1 }]);
    const app = buildApp({ $queryRaw: queryRawSpy });
    await supertest(app).get('/readyz'); // miss → ping (1)
    await supertest(app).get('/readyz'); // cache hit
    __resetReadyzCacheForTests();
    await supertest(app).get('/readyz'); // miss → ping (2)
    expect(queryRawSpy).toHaveBeenCalledTimes(2);
  });

  test('cache returns same status code on hit (503 stays 503)', async () => {
    const queryRawSpy = jest.fn().mockRejectedValue(new Error('db down'));
    const app = buildApp({ $queryRaw: queryRawSpy });
    const r1 = await supertest(app).get('/readyz');
    const r2 = await supertest(app).get('/readyz');
    expect(r1.status).toBe(503);
    expect(r2.status).toBe(503);
    expect(queryRawSpy).toHaveBeenCalledTimes(1); // failure also cached
  });

  test('error response body has no stack-frame markers', async () => {
    const queryRawSpy = jest.fn().mockRejectedValue(new Error('synthetic db error'));
    const app = buildApp({ $queryRaw: queryRawSpy });
    const res = await supertest(app).get('/readyz');
    const json = JSON.stringify(res.body);
    expect(json).not.toMatch(/at\s+.*\.js:\d+:\d+/);
  });
});

describe('GET /version — build metadata', () => {
  test('returns body with version, sha, builtAt, nodeEnv keys', async () => {
    const app = buildApp({ $queryRaw: jest.fn() });
    const res = await supertest(app).get('/version');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('version');
    expect(res.body).toHaveProperty('sha');
    expect(res.body).toHaveProperty('builtAt');
    expect(res.body).toHaveProperty('nodeEnv');
  });

  test('builtAt is a valid ISO 8601 string', async () => {
    const app = buildApp({ $queryRaw: jest.fn() });
    const res = await supertest(app).get('/version');
    expect(() => new Date(res.body.builtAt).toISOString()).not.toThrow();
  });

  test('respects BUILD_TIMESTAMP env override', async () => {
    const orig = process.env.BUILD_TIMESTAMP;
    process.env.BUILD_TIMESTAMP = '2026-04-25T10:00:00.000Z';
    try {
      const app = buildApp({ $queryRaw: jest.fn() });
      const res = await supertest(app).get('/version');
      expect(res.body.builtAt).toBe('2026-04-25T10:00:00.000Z');
    } finally {
      if (orig === undefined) delete process.env.BUILD_TIMESTAMP;
      else process.env.BUILD_TIMESTAMP = orig;
    }
  });
});

describe('module exports', () => {
  test('exports __resetReadyzCacheForTests as a function', () => {
    expect(typeof __resetReadyzCacheForTests).toBe('function');
  });
});
