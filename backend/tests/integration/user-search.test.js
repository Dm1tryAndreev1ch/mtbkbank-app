/**
 * Phase 3 — Plan 03-00 Wave 0 — SEC-09 scaffold.
 *
 * /api/users/search: q.length >= 10, no phone field in response, paginated.
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

describe('user-search validation (SEC-09)', () => {
  it.todo('GET /api/users/search?q=short returns 400 VALIDATION_FAILED (q.length < 10)');
  it.todo('response payload contains no phone field for any matched user');
  it.todo('paginated via ?page=&limit=; default limit ≤ 50');
});

void supertest;
void app;
