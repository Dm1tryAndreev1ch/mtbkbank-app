/**
 * Phase 2 — Plan 02-11 — Task 5
 *
 * SEC-05 + D-17: the seed script (`backend/src/seed/index.js`) MUST refuse to
 * run when NODE_ENV=production. Plan 02-10 Task 2 added the refusal block
 * (commit 2053dd8). This test pins it structurally.
 *
 * spawnSync idiom: pass all envalid-required vars in childEnv so envalid
 * does NOT throw before the seed's NODE_ENV-refusal block runs (otherwise
 * we'd be testing envalid's exit, not the refusal). DATABASE_URL is fake
 * (`postgresql://x:y@z/d`) — the seed must exit BEFORE attempting to connect.
 */

const { spawnSync } = require('child_process');
const path = require('path');

const SEED_JS = path.join(__dirname, '..', '..', 'src', 'seed', 'index.js');

const PROD_CHILD_ENV = {
  PATH: process.env.PATH,
  NODE_ENV: 'production',
  // envalid-required vars so envalid validation passes; the seed's own refusal
  // block must then take over and exit before any Prisma connection is opened.
  JWT_SECRET: 'test-jwt-secret',
  JWT_REFRESH_SECRET: 'test-refresh-secret',
  DATABASE_URL: 'postgresql://x:y@z/d',
  REDIS_URL: 'redis://localhost:6379',
  ALLOWED_ORIGINS: 'http://example.com',
  SENTRY_DSN: 'https://example@example.ingest.sentry.io/1',
};

describe('Seed script production refusal — SEC-05 / D-17', () => {
  test('seed/index.js exits non-zero when NODE_ENV=production', () => {
    const result = spawnSync(process.execPath, [SEED_JS], {
      env: PROD_CHILD_ENV,
      encoding: 'utf8',
      timeout: 5000,
    });
    expect(result.status).not.toBe(0);
  });

  test('seed/index.js logs a "production" mention before exiting', () => {
    const result = spawnSync(process.execPath, [SEED_JS], {
      env: PROD_CHILD_ENV,
      encoding: 'utf8',
      timeout: 5000,
    });
    // pino logs may go to stdout (silent in tests) or stderr depending on
    // transport; combine both sources before matching.
    const combined = (result.stdout || '') + (result.stderr || '');
    expect(combined).toMatch(/production/i);
  });

  test('seed/index.js refusal is fast (< 5s) — proves the block runs BEFORE prisma.connect', () => {
    const t0 = Date.now();
    const result = spawnSync(process.execPath, [SEED_JS], {
      env: PROD_CHILD_ENV,
      encoding: 'utf8',
      timeout: 5000,
    });
    const elapsed = Date.now() - t0;
    expect(result.status).not.toBe(0);
    // 5s wall-budget — refusal should happen in <500ms; we leave headroom for
    // cold node start. If this asserts at the timeout itself, the refusal block
    // is in the wrong location and the seed is trying to connect to a fake DB.
    expect(elapsed).toBeLessThan(4500);
  });
});
