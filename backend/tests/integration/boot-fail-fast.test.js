/**
 * Phase 2 — Plan 02-11 — Task 4
 *
 * TEST-02 + SEC-01 + D-18 / D-19 — canonical boot-fail-fast coverage.
 *
 * Phase 1's `backend/tests/regression-phase1.test.js` retains the original
 * single-var (JWT_SECRET) spawnSync block as a baseline regression pin.
 * THIS file owns the broader 5-var contract — every var declared
 * required-in-production by the envalid schema (`backend/src/env.js`) must
 * cause a non-zero exit within 2s when missing.
 *
 * Spawn idiom from Phase-1 plan 02 STATE.md note: pass ONLY the literal
 * env object to the child (PATH for binary lookup; nothing inherited).
 * Inheriting parent process.env (which `tests/setup.js` populates with
 * every required var) would mask "missing-var" exits and the test would
 * falsely pass.
 */

const { spawnSync } = require('child_process');
const path = require('path');

const ENV_JS = path.join(__dirname, '..', '..', 'src', 'env.js');

// Synthetic test secrets — never leak real ones into a test fixture.
const BASE_PROD_ENV = {
  PATH: process.env.PATH,
  NODE_ENV: 'production',
  JWT_SECRET: 'test-jwt-secret',
  JWT_REFRESH_SECRET: 'test-refresh-secret',
  DATABASE_URL: 'postgresql://x:y@z/d',
  REDIS_URL: 'redis://localhost:6379',
  ALLOWED_ORIGINS: 'http://example.com',
  SENTRY_DSN: 'https://example@example.ingest.sentry.io/1',
};

// D-19 + ROADMAP success criterion #4: 5 required-in-production vars.
const REQUIRED_IN_PROD_VARS = [
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'DATABASE_URL',
  'REDIS_URL',
  'ALLOWED_ORIGINS',
];

describe('Backend boot-fail-fast — D-18 / D-19 / SEC-01 (5-var canonical home)', () => {
  REQUIRED_IN_PROD_VARS.forEach((missingVar) => {
    test(`exits non-zero within 2s when ${missingVar} missing in NODE_ENV=production`, () => {
      const childEnv = { ...BASE_PROD_ENV };
      delete childEnv[missingVar];
      const result = spawnSync(
        process.execPath,
        ['-e', `require(${JSON.stringify(ENV_JS)})`],
        { env: childEnv, encoding: 'utf8', timeout: 2000 }
      );
      expect(result.status).not.toBe(0);
      // envalid prints `Invalid/missing environment variables: <NAME>` to stderr;
      // the assertion just requires the missing var name to appear in stderr.
      expect(result.stderr).toMatch(new RegExp(missingVar));
    });
  });

  test('boots OK (env validates) when all 5 required vars present', () => {
    const result = spawnSync(
      process.execPath,
      ['-e', `require(${JSON.stringify(ENV_JS)}); console.log('OK');`],
      { env: BASE_PROD_ENV, encoding: 'utf8', timeout: 2000 }
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/OK/);
  });
});
