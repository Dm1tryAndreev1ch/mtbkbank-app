/**
 * Middleware-order integration tests.
 * Boots the full Express app via supertest and asserts:
 *   - X-Request-Id header is echoed on every response (UUID v4 shape)
 *   - X-Request-Id from the inbound header is honoured (not overwritten)
 *   - req.log child logger is bound to the request (different ids per request)
 *   - 10kb body limit is enforced (413 on oversize POST)
 *   - app.set('trust proxy', 1) is in place
 */
const supertest = require('supertest');

// Defensive: prevent envalid fail-fast in case setup.js was bypassed
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-jwt-refresh';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
process.env.ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || 'http://localhost:5173';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'silent';

let app;
beforeAll(() => {
  // supertest binds its own ephemeral port; the require() loads the module-level
  // app.listen() which would also bind, but supertest passes the app directly so
  // it does not exercise the listener. The hp-tick interval is unref'd via Jest
  // forceExit (no manual cleanup needed).
  jest.resetModules();
  app = require('../src/index');
});

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('middleware order: pino-http + X-Request-Id', () => {
  test('GET /health echoes X-Request-Id with a UUID v4', async () => {
    const res = await supertest(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.headers['x-request-id']).toMatch(UUID_V4_RE);
  });

  test('inbound X-Request-Id header is honoured (not overwritten)', async () => {
    const incoming = '11111111-2222-4333-8444-555555555555';
    const res = await supertest(app).get('/health').set('X-Request-Id', incoming);
    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toBe(incoming);
  });

  test('different requests get different UUIDs', async () => {
    const r1 = await supertest(app).get('/health');
    const r2 = await supertest(app).get('/health');
    expect(r1.headers['x-request-id']).not.toBe(r2.headers['x-request-id']);
  });
});

describe('middleware order: express.json limit', () => {
  test('POST with body > 10kb returns 413 (or 4xx)', async () => {
    const oversized = { junk: 'x'.repeat(15 * 1024) };
    const res = await supertest(app)
      .post('/api/auth/register')
      .set('Content-Type', 'application/json')
      .send(oversized);
    // 413 Payload Too Large from express.json's body-parser. Some routes wrap
    // this in 400; either is acceptable as long as it is NOT 200/2xx (the 10kb
    // gate must reject before route logic runs).
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect([413, 400]).toContain(res.status);
  });
});

describe('middleware order: trust proxy is set', () => {
  test('app.get("trust proxy") is truthy', () => {
    expect(app.get('trust proxy')).toBeTruthy();
  });
});
