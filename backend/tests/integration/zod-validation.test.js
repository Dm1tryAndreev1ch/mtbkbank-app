/**
 * Phase 3 — Plan 03-00 Wave 0 — SEC-09, SEC-10, D-09..D-11 scaffold.
 *
 * Zod-driven request validation: VALIDATION_FAILED contract with issues[],
 * shared phone/PIN/Luhn refines, user-search q-min-length.
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

describe('Zod validation (SEC-09, SEC-10, D-09..D-11)', () => {
  it.todo('VALIDATION_FAILED returns { error, message: Russian, issues: [{path, code, message}], requestId } (D-10)');
  it.todo('register rejects card number failing Luhn refine with issues[0].path === [cardNumber] (D-11)');
  it.todo('transfer rejects negative amount with issues path === [amount] (D-11)');
  it.todo('phone regex requires +\\d{11,15} format (D-11)');
  it.todo('PIN regex requires exactly 4 digits (D-11)');
  it.todo('user-search query rejects q.length < 10 (D-11, SEC-09)');
});

void supertest;
void app;
