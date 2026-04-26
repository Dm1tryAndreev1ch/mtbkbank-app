/**
 * Phase 3 — Plan 03-00 Wave 0 — SEC-02 scaffold.
 *
 * CORS allowlist: callback(null, false) on unallowed Origin; production guard;
 * wildcard refusal at boot.
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

describe('CORS allowlist (SEC-02)', () => {
  it.todo('unallowed Origin header → 403 (callback(null, false))');
  it.todo('NODE_ENV=production rejects Origin: http://localhost:5173 even if listed (production guard)');
  it.todo('wildcard * in env.ALLOWED_ORIGINS refuses to boot (envalid validator OR app-level guard)');
});

void supertest;
void app;
