/**
 * Phase 1 shared test setup.
 * Loaded BEFORE every test via jest.config.js setupFiles.
 * Sets baseline env vars so envalid (plan 02) does not exit during test boot.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://mtbank_test:mtbank_test_password@localhost:5433/mtbank_test';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6380';
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-jwt-secret-do-not-use-in-prod';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || 'test-jwt-refresh-secret';
process.env.ALLOWED_ORIGINS =
  process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:8081';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'silent';
process.env.SENTRY_DSN = process.env.SENTRY_DSN || '';

// ---------------------------------------------------------------------------
// Phase 2 Wave 0 — D-23: programmatic TRUNCATE driven by Prisma DMMF.
// truncateAll() is exported for use in integration suites' beforeEach hooks;
// it is NEVER invoked from this file (setup.js runs in every worker — calling
// truncate here would race across parallel workers).
//
// getPrisma() lazily constructs a singleton PrismaClient so unit tests that
// require('./setup') (or transitively via a route module) do NOT spin up a DB
// connection unless they call getPrisma() / truncateAll() explicitly.
// ---------------------------------------------------------------------------
const { PrismaClient } = require('@prisma/client');

let _prisma;

function getPrisma() {
  if (!_prisma) _prisma = new PrismaClient();
  return _prisma;
}

// Phase 3 / Plan 03-07 / SEC-04 — Redis-backed auth rate limits (rate-limit-redis)
// share counters across test cases through the live Redis instance. Without a
// per-test flush, suites that issue >5 logins in aggregate (e.g. tests/integration/auth.test.js
// hits login multiple times across `describe` blocks) trip the 5/15min cap and
// flake with 429 instead of 200. truncateAll() now flushes the `rl:*` keyspace
// alongside the Postgres truncate so the pre-existing TEST-02 contract holds.
const Redis = require('redis');
let _redisFlush;
async function _getRedisFlush() {
  if (_redisFlush?.isReady) return _redisFlush;
  _redisFlush = Redis.createClient({ url: process.env.REDIS_URL });
  _redisFlush.on('error', () => { /* swallow — flush is best-effort */ });
  try { await _redisFlush.connect(); } catch (_e) { return null; }
  return _redisFlush;
}
async function clearRateLimitKeys() {
  const c = await _getRedisFlush();
  if (!c) return;
  try {
    for (const pattern of ['rl:login:*', 'rl:register:*', 'rl:refresh:*']) {
      const keys = await c.keys(pattern);
      if (keys.length) await c.del(keys);
    }
  } catch (_e) {
    // best-effort — Redis may be down in unit-only test invocations.
  }
}

async function truncateAll() {
  // Always clear rate-limit buckets first; Postgres truncate is the slow step.
  await clearRateLimitKeys();
  const prisma = getPrisma();
  // Plan 02-00 originally read `prisma._dmmf.datamodel.models`, but Prisma 6
  // does not expose `_dmmf` on the runtime client (it lives only on the
  // generator-time DMMF). Two correct alternatives:
  //   1. Read `prisma._runtimeDataModel.models` (private but stable since 4.x).
  //   2. Query information_schema for the public-schema table list (engine-agnostic).
  // We use option (2) — it round-trips the actual database state, doesn't depend
  // on a Prisma private API, and naturally excludes `_prisma_migrations` via the
  // filter clause.
  const rows = await prisma.$queryRawUnsafe(
    `SELECT tablename FROM pg_tables
     WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
  );
  if (!rows || rows.length === 0) return;
  const list = rows.map((r) => `"${r.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`,
  );
}

module.exports = { truncateAll, getPrisma, clearRateLimitKeys };
