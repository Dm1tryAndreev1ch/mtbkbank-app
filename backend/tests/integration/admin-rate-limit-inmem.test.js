/**
 * Phase 3 — Plan 03-00 Wave 0 — D-13..D-15 scaffold.
 *
 * Admin destructive-route in-memory limiter (per-actorId, write methods only).
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

describe('admin in-memory destructive rate-limit (D-13..D-15)', () => {
  it.todo('POST /api/admin/users 61st request within 1min returns 429 (per-actorId, in-memory)');
  it.todo('GET /api/admin/users is exempt (read methods skipped)');
  it.todo('in-memory counter resets on backend restart (acceptable per D-14)');
});

void supertest;
void app;
