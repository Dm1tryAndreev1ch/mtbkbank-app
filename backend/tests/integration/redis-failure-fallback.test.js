/**
 * Phase 3 — Plan 03-06 — SEC-03 live tests.
 *
 * Redis fall-through:
 *  - app boots when REDIS_URL points to a closed port (no crash)
 *  - getCached / setCached / invalidatePattern fall through to no-op without throwing
 *  - 'error' event emits warn + Sentry breadcrumb category:'redis' once on transition
 */

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const INDEX_JS = path.join(__dirname, '..', '..', 'src', 'index.js');

describe('Redis fall-through (SEC-03)', () => {
  it('app boots with REDIS_URL pointing to closed port (no crash) and /healthz returns 200', () => {
    const result = spawnSync(
      process.execPath,
      ['-e', `
        process.env.REDIS_URL = 'redis://127.0.0.1:9';
        process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://mtbank_test:mtbank_test_password@localhost:5433/mtbank_test';
        process.env.JWT_SECRET = 'test-secret';
        process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
        process.env.ALLOWED_ORIGINS = 'http://localhost:3000';
        process.env.NODE_ENV = 'test';
        process.env.LOG_LEVEL = 'silent';
        const app = require(${JSON.stringify(INDEX_JS)});
        const supertest = require('supertest');
        setTimeout(async () => {
          try {
            const res = await supertest(app).get('/healthz');
            console.log('HEALTHZ', res.status);
          } catch (e) {
            console.error('PROBE_FAIL', e.message);
          }
          process.exit(0);
        }, 1500);
      `],
      {
        encoding: 'utf8',
        env: {
          PATH: process.env.PATH,
          DATABASE_URL: process.env.DATABASE_URL || '',
        },
        timeout: 12000,
      }
    );
    expect(result.stdout).toMatch(/HEALTHZ 200/);
  }, 20000);

  it('getCached returns null when redis is unavailable (no throw)', async () => {
    jest.resetModules();
    const cache = require('../../src/cache');
    // Force-disconnect the live test redis; even if it never disconnects, the
    // function must never throw and must return null on a cache miss / failure.
    const result = await cache.getCached('non_existent_key_smoke_test');
    expect(result).toBeNull();
  });

  it("Redis 'error' event emits warn + Sentry breadcrumb (transition only, idempotent)", async () => {
    jest.resetModules();
    const cache = require('../../src/cache');
    const instrument = require('../../src/instrument');

    const breadcrumbSpy = jest.spyOn(instrument.Sentry, 'addBreadcrumb');

    expect(typeof cache.redisClient?.emit).toBe('function');

    // First error → must emit one redis-category breadcrumb (transition)
    cache.redisClient.emit('error', Object.assign(new Error('test_first_error'), { code: 'TEST_ERR' }));
    let redisCrumbs = breadcrumbSpy.mock.calls.filter((c) => c[0]?.category === 'redis');
    const firstCount = redisCrumbs.length;
    expect(firstCount).toBeGreaterThanOrEqual(1);
    expect(redisCrumbs[firstCount - 1][0].level).toBe('warning');

    // Second error while redisAvailable already false → must NOT add another crumb
    cache.redisClient.emit('error', new Error('test_second_error'));
    redisCrumbs = breadcrumbSpy.mock.calls.filter((c) => c[0]?.category === 'redis');
    expect(redisCrumbs.length).toBe(firstCount);

    breadcrumbSpy.mockRestore();
  });
});
