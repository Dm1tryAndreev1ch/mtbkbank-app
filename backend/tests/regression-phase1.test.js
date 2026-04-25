/**
 * Phase-1 regression guard (Jest).
 * Pins the four already-fixed Phase-1 anti-patterns AND staging-pins the
 * Phase-2 fixes that are still in the codebase today (intentionally RED via
 * `test.failing` — they flip GREEN automatically when Phase 2 lands without any
 * test edit).
 *
 * Companion to scripts/regression-guard.sh (eight bash git-grep checks).
 *
 * NOTE on `git grep` flags: We use `git grep -P` (PCRE) so `\s` and `\b` work
 * portably on macOS git (POSIX ERE in macOS git grep does not support these
 * escapes). The companion script `scripts/regression-guard.sh` does the same.
 *
 * NOTE on Phase-1 RED/GREEN status (verified at write time, 2026-04-25):
 *   - admin/src/App.jsx already has NO `let TOKEN` → assertion is a regular
 *     already-fixed pin (will RED if regressed).
 *   - mobile/services/api.ts has NO `.catch(() => {})` (already removed) but
 *     DOES have `catch {}` blocks → we pin both, the latter is `.failing`.
 *   - mobile/stores/useStore.ts has multiple `catch {}` blocks → `.failing`.
 *   - backend/src has `console.*` calls → `.failing` until plan 01-01 lands.
 *   - JWT fallback_secret literal: not present today → already-fixed pin.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const supertest = require('supertest');

// Pre-seed env vars BEFORE requiring the app — supertest tests boot the full chain
// (envalid, pino-http, healthRoutes, errorNormalizer) by requiring backend/src/index.js.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-jwt-refresh';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
process.env.ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:8081';
process.env.SENTRY_DSN = process.env.SENTRY_DSN || '';

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const REPO_ROOT = path.join(__dirname, '..', '..');

function readRepoFile(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

describe('Phase-1 regression guard — static pins (already fixed)', () => {
  test('no JWT fallback_secret literal anywhere in backend/src/', () => {
    const out = execSync(
      'git grep -lP "fallback_secret" -- backend/src/ || true',
      { cwd: REPO_ROOT, encoding: 'utf8' }
    ).trim();
    expect(out).toBe('');
  });

  test('no `JWT_SECRET || ...` fallback expression in backend/src/', () => {
    const out = execSync(
      'git grep -lP "JWT_SECRET\\s*\\|\\|\\s*[\\"\\\']" -- backend/src/ || true',
      { cwd: REPO_ROOT, encoding: 'utf8' }
    ).trim();
    expect(out).toBe('');
  });

  test('admin/src/App.jsx has no module-scope `let TOKEN` (Phase-1 SEC-06 already fixed)', () => {
    const file = readRepoFile('admin/src/App.jsx');
    expect(file).not.toMatch(/^let\s+TOKEN\b/m);
  });

  test('mobile/services/api.ts has no empty `.catch(() => {})` (Phase-1 already fixed)', () => {
    const file = readRepoFile('mobile/services/api.ts');
    expect(file).not.toMatch(/\.catch\s*\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/);
  });

  test('regression-guard.sh exists and is executable', () => {
    const stat = fs.statSync(path.join(REPO_ROOT, 'scripts/regression-guard.sh'));
    // Owner-execute bit must be set
    expect(stat.mode & 0o100).toBeTruthy();
  });

  test('regression-guard.sh contains all six guard categories', () => {
    const sh = readRepoFile('scripts/regression-guard.sh');
    expect(sh).toMatch(/CORS origin: true/);
    expect(sh).toMatch(/CORS wildcard origin/);
    expect(sh).toMatch(/JWT fallback_secret literal/);
    expect(sh).toMatch(/Admin module-scope let TOKEN/);
    expect(sh).toMatch(/Empty \.catch/);
    expect(sh).toMatch(/console\.\* in backend\/src/);
  });
});

describe('Phase-1 regression guard — staging pins (RED today, GREEN after Phase 2)', () => {
  // .failing => Jest expects this assertion to FAIL today; when Phase-2 REL-04 removes
  // the empty `catch {}` blocks, these tests start passing, which Jest then reports as
  // FAILING because .failing inverted the expectation. Flip .failing → standard `test(...)`
  // in Phase 2 (REL-04) to keep them green.

  test.failing('mobile/services/api.ts has no empty `catch {}` (Phase-2 REL-04 fixes this)', () => {
    const file = readRepoFile('mobile/services/api.ts');
    expect(file).not.toMatch(/catch\s*(\([^)]*\))?\s*\{\s*\}/);
  });

  test.failing('mobile/stores/useStore.ts has no empty `catch {}` (Phase-2 REL-04 fixes this)', () => {
    const file = readRepoFile('mobile/stores/useStore.ts');
    expect(file).not.toMatch(/catch\s*(\([^)]*\))?\s*\{\s*\}/);
  });
});

describe('Phase-1 regression guard — console.log migration (plan 01-01 complete)', () => {
  test('no console.log/error/warn/info in backend/src/ (plan 01-01 migrated them)', () => {
    const out = execSync(
      'git grep -lP "\\bconsole\\.(log|error|warn|info)\\b" -- backend/src/ || true',
      { cwd: REPO_ROOT, encoding: 'utf8' }
    ).trim();
    expect(out).toBe('');
  });
});

describe('Phase-1 regression guard — dynamic CORS / boot / middleware (plan 01-99 complete)', () => {
  let app;

  beforeAll(() => {
    jest.resetModules();
    app = require('../src/index');
  });

  // ----- CORS -----

  test('CORS rejects unknown origin (no Access-Control-Allow-Origin in response)', async () => {
    const res = await supertest(app)
      .get('/healthz')
      .set('Origin', 'https://attacker.example');
    // Express CORS sets the header ONLY when the origin is allowed.
    // The request itself succeeds (200) because the route handler runs regardless of CORS;
    // CORS is enforced by the BROWSER reading (or not reading) the ACAO header.
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('CORS accepts allow-listed origin (Access-Control-Allow-Origin echoed)', async () => {
    const res = await supertest(app)
      .get('/healthz')
      .set('Origin', 'http://localhost:5173');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  // ----- Boot fail-fast (envalid) -----

  test('Backend boot fails non-zero when JWT_SECRET missing in NODE_ENV=production (spawnSync)', () => {
    const { spawnSync } = require('child_process');
    const ENV_JS = path.join(__dirname, '..', 'src', 'env.js');

    // Build a CLEAN env (NOT inherited from the test process) — production-strict but JWT_SECRET omitted.
    const childEnv = {
      PATH: process.env.PATH,
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://x:y@z/d',
      JWT_REFRESH_SECRET: 'test-refresh',
      REDIS_URL: 'redis://localhost:6379',
      ALLOWED_ORIGINS: 'http://example.com',
      SENTRY_DSN: 'https://example@example.ingest.sentry.io/1',
    };

    const result = spawnSync(
      process.execPath,
      ['-e', `require(${JSON.stringify(ENV_JS)})`],
      { env: childEnv, encoding: 'utf8', timeout: 8000 }
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/JWT_SECRET/);
  });

  // ----- pino-http genReqId -----

  test('X-Request-Id echoed on every response (UUID v4 shape)', async () => {
    const res = await supertest(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.headers['x-request-id']).toMatch(UUID_V4_RE);
  });

  test('inbound X-Request-Id is honoured (pino-http passes it through unchanged)', async () => {
    const incoming = '11111111-2222-4333-8444-555555555555';
    const res = await supertest(app).get('/healthz').set('X-Request-Id', incoming);
    expect(res.headers['x-request-id']).toBe(incoming);
  });

  // ----- 404 / notFoundHandler -----

  test('404 unmounted path returns {error:"NOT_FOUND", message:"Ресурс не найден", requestId:<uuid>}', async () => {
    const res = await supertest(app).get('/this-path-does-not-exist-anywhere');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
    expect(res.body.message).toBe('Ресурс не найден');
    expect(typeof res.body.requestId).toBe('string');
    expect(res.body.requestId).toMatch(UUID_V4_RE);
    expect(res.body.requestId).toBe(res.headers['x-request-id']);
  });

  // ----- AppError through the full chain -----

  test('AppError from /__test__/sentry-error returns {error:"INTERNAL_ERROR", message:"Phase-1 test error", requestId:<uuid>}', async () => {
    const res = await supertest(app).get('/__test__/sentry-error');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('INTERNAL_ERROR');
    expect(res.body.message).toBe('Phase-1 test error');
    expect(typeof res.body.requestId).toBe('string');
    expect(res.body.requestId).toMatch(UUID_V4_RE);
    // Stack trace must NOT leak into the response body
    const json = JSON.stringify(res.body);
    expect(json).not.toMatch(/at\s+.*\.js:\d+:\d+/);
    expect(res.body.stack).toBeUndefined();
  });
});
