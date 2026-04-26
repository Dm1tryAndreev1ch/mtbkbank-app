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

async function truncateAll() {
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

module.exports = { truncateAll, getPrisma };
