/**
 * Phase 3 — Plan 03-00 Wave 0 — SEC-04, D-13..D-15 scaffold.
 *
 * rate-limit-redis store: per-IP login/register caps, per-user refresh cap,
 * Redis-backed counters surviving backend restart. Real Redis from
 * docker-compose.test.yml; child_process.spawn pattern from
 * backend/tests/graceful-shutdown.test.js for the restart-survival case.
 */

const supertest = require('supertest');
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

describe('rate-limit-redis restart survival (SEC-04, D-13..D-15)', () => {
  it.todo('11x /auth/login from same IP returns 429 with Retry-After header');
  it.todo('restart container, 12th attempt still 429 (Redis store survives restart)');
  it.todo('/auth/register 4th attempt within 1h returns 429 (3/h cap, per-IP)');
  it.todo('/auth/refresh keyed on userId (decoded), per-user limit 60/min');
});

void supertest;
void app;
