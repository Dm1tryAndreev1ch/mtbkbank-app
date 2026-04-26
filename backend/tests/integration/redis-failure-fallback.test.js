/**
 * Phase 3 — Plan 03-00 Wave 0 — SEC-03 scaffold.
 *
 * Redis fall-through: app boots when REDIS_URL points to a closed port,
 * cache-dependent endpoints fall through to DB with a warn breadcrumb.
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

describe('Redis fall-through (SEC-03)', () => {
  it.todo('REDIS_URL pointing to closed port → app boots, no crash');
  it.todo('cache-dependent endpoint serves correct DB-backed result with logger.warn(redis_unavailable)');
  it.todo('Sentry.addBreadcrumb category:redis level:warning fires once on connection lost');
});

void supertest;
void app;
