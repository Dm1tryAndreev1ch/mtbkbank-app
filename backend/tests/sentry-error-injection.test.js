/**
 * Dev-only /__test__/sentry-error endpoint integration tests.
 * Reference: VALIDATION row 1-08-02, CONTEXT D-03, RESEARCH §6.5 lines 1280-1284.
 *
 * Strategy:
 *   - Test cases 1-4 boot the app with NODE_ENV=test (dev mount active) and exercise
 *     the JSON shape, requestId echo, no-stack-leak, and messageOverride wins.
 *   - Test cases 5-6 verify the production guard via static source-level assertions
 *     (avoids the fragile production-mode supertest boot which depends on a real
 *     DB/Redis stack and a populated SENTRY_DSN to satisfy envalid in production).
 */
const supertest = require('supertest');
const fs = require('fs');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-jwt-refresh';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
process.env.ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || 'http://localhost:5173';
process.env.SENTRY_DSN = process.env.SENTRY_DSN || '';

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let app;
beforeAll(() => {
  jest.resetModules();
  app = require('../src/index');
});

describe('GET /__test__/sentry-error — dev mount (NODE_ENV=test)', () => {
  test('returns 500 with {error:"INTERNAL_ERROR", message:"Phase-1 test error", requestId:<uuid>}', async () => {
    const res = await supertest(app).get('/__test__/sentry-error');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('INTERNAL_ERROR');
    expect(res.body.message).toBe('Phase-1 test error');
    expect(typeof res.body.requestId).toBe('string');
  });

  test('requestId is UUID v4 and matches X-Request-Id response header', async () => {
    const res = await supertest(app).get('/__test__/sentry-error');
    expect(res.body.requestId).toMatch(UUID_V4_RE);
    expect(res.body.requestId).toBe(res.headers['x-request-id']);
  });

  test('response carries no stack-frame markers', async () => {
    const res = await supertest(app).get('/__test__/sentry-error');
    const json = JSON.stringify(res.body);
    expect(json).not.toMatch(/at\s+.*\.js:\d+:\d+/);
    expect(res.body.stack).toBeUndefined();
  });

  test('messageOverride wins over codebook (Phase-1 test error, not the Russian generic)', async () => {
    const res = await supertest(app).get('/__test__/sentry-error');
    expect(res.body.message).toBe('Phase-1 test error');
    expect(res.body.message).not.toBe('Внутренняя ошибка сервера');
  });
});

describe('production guard — static source-level assertion', () => {
  test('the dev endpoint is INSIDE an `if (env.NODE_ENV !== "production")` block in backend/src/index.js', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.js'), 'utf8');
    // Locate the conditional block that wraps the dev endpoint
    const matches = src.match(/if\s*\(\s*env\.NODE_ENV\s*!==\s*['"]production['"]\s*\)\s*\{[\s\S]*?app\.get\(\s*['"]\/__test__\/sentry-error['"]/);
    expect(matches).not.toBeNull();
  });

  test('the dev endpoint is NOT mounted unconditionally', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.js'), 'utf8');
    // No bare top-level `app.get('/__test__/sentry-error', ...)` outside the conditional.
    // Strategy: find every occurrence and assert each is preceded (within 200 chars) by the production guard.
    const occurrences = [...src.matchAll(/app\.get\(\s*['"]\/__test__\/sentry-error['"]/g)];
    expect(occurrences.length).toBeGreaterThan(0);
    for (const m of occurrences) {
      const start = Math.max(0, m.index - 200);
      const window = src.slice(start, m.index);
      expect(window).toMatch(/env\.NODE_ENV\s*!==\s*['"]production['"]/);
    }
  });
});
