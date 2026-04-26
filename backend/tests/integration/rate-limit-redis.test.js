/**
 * Phase 3 — Plan 03-07 — SEC-04, D-13..D-15.
 *
 * rate-limit-redis store: per-IP login/register caps, per-user refresh cap,
 * Redis-backed counters surviving backend restart. Real Redis from
 * docker-compose.test.yml (port 6380); child_process.spawn pattern lifted from
 * backend/tests/graceful-shutdown.test.js for the restart-survival assertion.
 *
 * Cap divergence note: Phase-1's success-criterion phrased "11× login → 429" against
 * the OLD cap of 10/15min. Phase-3 D-13 lowered the login cap to 5/15min. The
 * in-process test asserts the NEW cap (6th call → 429); the restart-survival test
 * fills the bucket in a child process, then a SECOND fresh process probes the same
 * Redis key and STILL gets 429. The contract — "counters outlive a backend restart" —
 * is the actual requirement; the exact request count is incidental.
 */

const supertest = require('supertest');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const Redis = require('redis');
const { truncateAll, getPrisma, clearRateLimitKeys } = require('../setup');

let app;
let prisma;
let redis;

beforeAll(async () => {
  jest.resetModules();
  app = require('../../src/index');
  prisma = getPrisma();
  redis = Redis.createClient({ url: process.env.REDIS_URL });
  redis.on('error', () => { /* swallow */ });
  await redis.connect();
});

afterAll(async () => {
  if (prisma) await prisma.$disconnect();
  if (redis?.isReady) await redis.quit();
});

beforeEach(async () => {
  await truncateAll(); // also flushes rl:* keys (see tests/setup.js)
});

describe('rate-limit-redis restart survival (SEC-04, D-13..D-15)', () => {
  test('6th /auth/login from same IP returns 429 with Retry-After/RateLimit-Reset header', async () => {
    let lastStatus;
    let lastHeaders;
    // Cap is 5/15min per D-13. The 6th identical request must trip the limiter.
    for (let i = 0; i < 6; i++) {
      const res = await supertest(app)
        .post('/api/auth/login')
        .send({ phone: '+79991111111', pin: '0000' });
      lastStatus = res.status;
      lastHeaders = res.headers;
    }
    expect(lastStatus).toBe(429);
    // express-rate-limit emits standardHeaders → both `ratelimit-*` and `retry-after`
    // appear once the cap is hit. Either is acceptable proof of the limiter contract.
    expect(lastHeaders['retry-after'] || lastHeaders['ratelimit-reset']).toBeTruthy();
  });

  test('restart container, next attempt still 429 (Redis store survives restart)', async () => {
    // Start from a clean rate-limit keyspace so the in-process test above does not
    // pre-fill this case's bucket.
    await clearRateLimitKeys();

    const SPAWN_ENV = {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: process.env.DATABASE_URL,
      REDIS_URL: process.env.REDIS_URL,
      JWT_SECRET: process.env.JWT_SECRET || 'test-jwt-secret-do-not-use-in-prod',
      JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'test-jwt-refresh-secret',
      ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || 'http://localhost:5173',
      LOG_LEVEL: 'silent',
    };

    const indexPath = path.resolve(__dirname, '../../src/index.js');

    // 1) First child: load app, hit /auth/login 6 times to fill+trip the bucket, exit.
    //    This simulates the "before restart" state — counters now persist in Redis.
    const fillScript = `
      const supertest = require('supertest');
      const app = require(${JSON.stringify(indexPath)});
      (async () => {
        let last;
        for (let i = 0; i < 6; i++) {
          const r = await supertest(app).post('/api/auth/login').send({ phone: '+79992222222', pin: '0000' });
          last = r.status;
        }
        console.log('FILL_LAST', last);
        process.exit(0);
      })().catch(e => { console.error(e); process.exit(1); });
    `;
    const fill = spawnSync(process.execPath, ['-e', fillScript], {
      env: SPAWN_ENV,
      encoding: 'utf8',
      timeout: 30000,
    });
    expect(fill.status).toBe(0);
    expect(fill.stdout).toMatch(/FILL_LAST 429/);

    // 2) Second child: simulates a fresh container — re-requires src/index.js,
    //    hits /auth/login ONCE. Must still 429 because Redis bucket survives.
    const probeScript = `
      const supertest = require('supertest');
      const app = require(${JSON.stringify(indexPath)});
      (async () => {
        const r = await supertest(app).post('/api/auth/login').send({ phone: '+79992222222', pin: '0000' });
        console.log('PROBE_STATUS', r.status);
        process.exit(0);
      })().catch(e => { console.error(e); process.exit(1); });
    `;
    const probe = spawnSync(process.execPath, ['-e', probeScript], {
      env: SPAWN_ENV,
      encoding: 'utf8',
      timeout: 30000,
    });
    expect(probe.status).toBe(0);
    expect(probe.stdout).toMatch(/PROBE_STATUS 429/);
  }, 90000);

  test('/auth/register 4th attempt within 1h returns 429 (3/h cap, per-IP)', async () => {
    let lastStatus;
    for (let i = 0; i < 4; i++) {
      const res = await supertest(app)
        .post('/api/auth/register')
        .send({
          firstName: 'Test',
          lastName: 'User',
          phone: `+7999333${String(1000 + i).padStart(4, '0')}`,
          pin: '1234',
          cardNumber: '4111111111111111',
        });
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
