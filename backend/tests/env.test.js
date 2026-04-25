/**
 * Env validation tests.
 * Uses spawnSync to exercise envalid's process.exit(1) behaviour
 * in a fresh Node process (envalid kills the test runner if called inline).
 */
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.join(__dirname, '..', '..');
const ENV_JS = path.join(REPO_ROOT, 'backend', 'src', 'env.js');

/**
 * Spawn a child node that requires env.js with a SPECIFIC env (does NOT inherit).
 * Returns { status, stderr }.
 */
function spawnEnv(env) {
  const result = spawnSync(
    process.execPath,
    ['-e', `require(${JSON.stringify(ENV_JS)});`],
    { env, encoding: 'utf8', timeout: 8000 }
  );
  return { status: result.status, stderr: result.stderr || '' };
}

const MIN_REQUIRED = {
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  JWT_SECRET: 'test-jwt-secret',
  JWT_REFRESH_SECRET: 'test-jwt-refresh-secret',
};

describe('env.js fail-fast contract', () => {
  test('dev permissive: boots OK with only the three required vars (devDefault covers Redis/CORS/Sentry)', () => {
    const r = spawnEnv({ ...MIN_REQUIRED, NODE_ENV: 'development', PATH: process.env.PATH });
    expect(r.status).toBe(0);
  });

  test('production strict: missing JWT_SECRET → non-zero exit', () => {
    const env = { ...MIN_REQUIRED, NODE_ENV: 'production', PATH: process.env.PATH };
    delete env.JWT_SECRET;
    // production requires REDIS_URL/ALLOWED_ORIGINS/SENTRY_DSN too — provide them so we isolate JWT_SECRET as the failing var
    env.REDIS_URL = 'redis://localhost:6379';
    env.ALLOWED_ORIGINS = 'http://example.com';
    env.SENTRY_DSN = 'https://example@example.ingest.sentry.io/1';
    const r = spawnEnv(env);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/JWT_SECRET/);
  });

  test('production strict: missing DATABASE_URL → non-zero exit', () => {
    const env = { ...MIN_REQUIRED, NODE_ENV: 'production', PATH: process.env.PATH };
    delete env.DATABASE_URL;
    env.REDIS_URL = 'redis://localhost:6379';
    env.ALLOWED_ORIGINS = 'http://example.com';
    env.SENTRY_DSN = 'https://example@example.ingest.sentry.io/1';
    const r = spawnEnv(env);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/DATABASE_URL/);
  });

  test('production strict: missing JWT_REFRESH_SECRET → non-zero exit', () => {
    const env = { ...MIN_REQUIRED, NODE_ENV: 'production', PATH: process.env.PATH };
    delete env.JWT_REFRESH_SECRET;
    env.REDIS_URL = 'redis://localhost:6379';
    env.ALLOWED_ORIGINS = 'http://example.com';
    env.SENTRY_DSN = 'https://example@example.ingest.sentry.io/1';
    const r = spawnEnv(env);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/JWT_REFRESH_SECRET/);
  });

  test('production strict: missing REDIS_URL → non-zero exit', () => {
    const env = { ...MIN_REQUIRED, NODE_ENV: 'production', PATH: process.env.PATH };
    env.ALLOWED_ORIGINS = 'http://example.com';
    env.SENTRY_DSN = 'https://example@example.ingest.sentry.io/1';
    // REDIS_URL deliberately omitted
    const r = spawnEnv(env);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/REDIS_URL/);
  });

  test('exports a fully-populated env object under test setup', () => {
    // setup.js already pre-seeded process.env; require directly
    const { env } = require('../src/env');
    expect(env.NODE_ENV).toBe('test');
    expect(env.PORT).toBe(3000);
    expect(env.JWT_SECRET).toBeTruthy();
    expect(env.LOG_LEVEL).toBeDefined();
  });
});
