/**
 * Phase 3 — Plan 03-00 Wave 0 — SEC-12, D-12 scaffold.
 *
 * Constant-time login: phone-not-found and phone-found-wrong-pin must take
 * comparable wall-clock time (bcrypt-on-DUMMY_HASH).
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

describe('login timing parity (SEC-12, D-12)', () => {
  it.todo('POST /auth/login phone-not-found wall-clock within ±20ms of phone-found-wrong-pin (bcrypt-on-dummy-hash)');
  it.todo('both branches return AppError AUTH_INVALID_CREDENTIALS with Russian «Неверный телефон или ПИН-код»');
  it.todo('precomputed DUMMY_HASH at module load (constant cost target)');
});

void supertest;
void app;
