/**
 * Phase 2 Wave 0 — Jest globalSetup.
 * Runs ONCE per `npm test` invocation, before any worker boots.
 * Applies the Prisma schema to the docker-compose.test.yml database so
 * supertest integration suites have an up-to-date schema waiting for them.
 *
 * The compose stack is started externally:
 *   - locally: `docker compose -f backend/docker-compose.test.yml up -d`
 *   - CI (Phase 9): GitHub Actions `services:` block
 *
 * Idempotent: `prisma migrate deploy` is a no-op when the schema is current.
 * Cost: ~5s on cold DB, <1s on warm DB. Per threat model T-02-00-03 we accept
 * single-runner serialization; concurrent `npm test` against the same DB is
 * not supported in v1.0.
 */
const { execSync } = require('child_process');
const path = require('path');

module.exports = async function globalSetup() {
  const TEST_DATABASE_URL =
    process.env.DATABASE_URL ||
    'postgresql://mtbank_test:mtbank_test_password@localhost:5433/mtbank_test';

  // Opt-out for unit-only invocations that never touch the DB (e.g. regression-phase1).
  // Set SKIP_PRISMA_MIGRATE=1 to bypass the migrate step.
  if (process.env.SKIP_PRISMA_MIGRATE === '1') return;

  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
};
