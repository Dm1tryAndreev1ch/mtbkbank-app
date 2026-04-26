/**
 * Phase 3 — Plan 03-00 Wave 0 — SEC-08, D-05..D-08 scaffold.
 *
 * requireFreshAdmin middleware: verifies JWT isAdmin claim against fresh DB
 * findUnique on every admin request, with a 5-minute LRU cache, structured
 * warn on mismatch, and an explicit invalidate(userId) hook.
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

describe('requireFreshAdmin (SEC-08, D-05..D-08)', () => {
  it.todo('first admin request triggers DB findUnique; second within 5min hits LRU cache (D-05)');
  it.todo('JWT claim isAdmin:true + DB isAdmin:false → 401 ADMIN_FLAG_REVOKED (D-06)');
  it.todo('401 path emits structured warn { event: admin_flag_demoted, userId, requestId } and Sentry breadcrumb (D-06)');
  it.todo('requireFreshAdmin.invalidate(userId) drops cache entry; next request hits DB (D-07)');
});

void supertest;
void app;
