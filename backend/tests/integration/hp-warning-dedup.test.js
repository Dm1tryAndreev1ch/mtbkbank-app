/**
 * Phase 3 — Plan 03-00 Wave 0 — REL-11 scaffold.
 *
 * HP-warning dedup: UserCard.lastWarningAt 24h gate.
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

describe('HP warning dedup (REL-11)', () => {
  it.todo('first low-HP tick writes notification + sets UserCard.lastWarningAt');
  it.todo('second tick within 24h emits zero notifications + zero push sends');
  it.todo('tick after 24h elapsed emits one notification + bumps lastWarningAt');
});

void supertest;
void app;
