/**
 * Phase 3 — Plan 03-06 — SEC-02 live tests.
 *
 * CORS allowlist: callback(null, false) on unallowed Origin; production guard;
 * wildcard refusal at boot.
 *
 * Spawn-pattern idiom borrowed from boot-fail-fast.test.js — pass only the
 * literal env object to the child to avoid inheriting tests/setup.js seeds.
 */

const supertest = require('supertest');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { truncateAll, getPrisma } = require('../setup');

let app;
let prisma;

beforeAll(() => {
  jest.resetModules();
  app = require('../../src/index');
  prisma = getPrisma();
});

afterAll(async () => {
  if (prisma) await prisma.$disconnect();
});

beforeEach(async () => {
  await truncateAll();
});

const INDEX_JS = path.join(__dirname, '..', '..', 'src', 'index.js');

describe('CORS allowlist (SEC-02)', () => {
  it('unallowed Origin header → 403 (callback(null, false))', async () => {
    const res = await supertest(app)
      .get('/healthz')
      .set('Origin', 'http://attacker.example');
    expect(res.status).toBe(403);
  });

  it('Origin missing (mobile / curl) → allowed', async () => {
    const res = await supertest(app).get('/healthz');
    expect(res.status).toBeLessThan(400);
  });

  it('listed Origin → request succeeds', async () => {
    const res = await supertest(app)
      .get('/healthz')
      .set('Origin', 'http://localhost:5173');
    expect(res.status).toBeLessThan(400);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('NODE_ENV=production rejects Origin: http://localhost:5173 even if listed (production guard)', () => {
    // NODE_ENV cannot be flipped mid-process safely (envalid froze env at boot);
    // spawn a child that boots with NODE_ENV=production + listed localhost origin
    // and probe via supertest within the child.
    const result = spawnSync(
      process.execPath,
      ['-e', `
        process.env.NODE_ENV = 'production';
        process.env.ALLOWED_ORIGINS = 'http://localhost:5173';
        process.env.DATABASE_URL = 'postgresql://x:y@z/d';
        process.env.REDIS_URL = 'redis://localhost:6379';
        process.env.JWT_SECRET = 'test-secret';
        process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
        process.env.SENTRY_DSN = 'https://example@example.ingest.sentry.io/1';
        process.env.LOG_LEVEL = 'silent';
        const app = require(${JSON.stringify(INDEX_JS)});
        const supertest = require('supertest');
        supertest(app).get('/healthz').set('Origin', 'http://localhost:5173').then(r => {
          console.log('STATUS', r.status);
          process.exit(0);
        }).catch(e => { console.error('ERR', e.message); process.exit(1); });
      `],
      { encoding: 'utf8', env: { PATH: process.env.PATH }, timeout: 15000 }
    );
    expect(result.stdout).toMatch(/STATUS 403/);
  }, 20000);

  it('wildcard * in env.ALLOWED_ORIGINS refuses to boot', () => {
    const result = spawnSync(
      process.execPath,
      ['-e', `
        process.env.ALLOWED_ORIGINS = '*';
        process.env.DATABASE_URL = 'postgresql://x:y@z/d';
        process.env.REDIS_URL = 'redis://localhost:6379';
        process.env.JWT_SECRET = 'test-secret';
        process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
        process.env.LOG_LEVEL = 'silent';
        try {
          require(${JSON.stringify(INDEX_JS)});
          console.log('UNEXPECTED_BOOT_OK');
          process.exit(0);
        } catch (e) {
          console.error('BOOT_FAIL', e.message);
          process.exit(1);
        }
      `],
      { encoding: 'utf8', env: { PATH: process.env.PATH }, timeout: 10000 }
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr + result.stdout).toMatch(/(must not contain|wildcard|BOOT_FAIL)/i);
  }, 15000);
});
