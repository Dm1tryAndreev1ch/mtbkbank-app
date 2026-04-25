const { cleanEnv, str, port, url, num } = require('envalid');

/**
 * Centralized env validation for the backend.
 *
 * Required everywhere (no devDefault):
 *   DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET
 *
 * Required in NODE_ENV=production (devDefault provided for dev/test):
 *   REDIS_URL, ALLOWED_ORIGINS, SENTRY_DSN
 *
 * Optional with sensible defaults:
 *   NODE_ENV, PORT, LOG_LEVEL, BUILD_SHA, npm_package_version,
 *   ACTIVE_DECK_HP_TICK_MS, ACTIVE_DECK_HP_LOSS_PER_TICK, ACTIVE_DECK_LOW_HP_THRESHOLD
 *
 * envalid calls process.exit(1) with a colored stderr report when a required var is missing.
 * That exit happens before any application code loads, so it is the fail-fast boot contract.
 */
const env = cleanEnv(process.env, {
  NODE_ENV: str({ choices: ['development', 'test', 'production'], default: 'development' }),
  PORT: port({ default: 3000 }),

  // Required everywhere — no devDefault to prevent fallback secrets
  DATABASE_URL: url({ desc: 'PostgreSQL connection string' }),
  JWT_SECRET: str({ desc: 'HMAC secret for access tokens' }),
  JWT_REFRESH_SECRET: str({ desc: 'HMAC secret for refresh tokens' }),

  // Required in production; devDefault keeps dev/test boots permissive
  REDIS_URL: url({ desc: 'Redis connection string', devDefault: 'redis://localhost:6379' }),
  ALLOWED_ORIGINS: str({
    desc: 'Comma-separated CORS origins',
    devDefault: 'http://localhost:5173,http://localhost:8081',
  }),
  SENTRY_DSN: str({ desc: 'Sentry DSN for backend project (D-02)', devDefault: '' }),

  // Logging
  LOG_LEVEL: str({
    choices: ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'],
    default: 'info',
  }),

  // Build metadata for /version endpoint (consumed in plan 08)
  BUILD_SHA: str({ default: 'dev', desc: 'Git short SHA at build time' }),
  npm_package_version: str({ default: '1.0.0' }),

  // Cron + game tuning (existing)
  ACTIVE_DECK_HP_TICK_MS: num({ default: 60000 }),
  ACTIVE_DECK_HP_LOSS_PER_TICK: num({ default: 1 }),
  ACTIVE_DECK_LOW_HP_THRESHOLD: num({ default: 30 }),
});

module.exports = { env };
