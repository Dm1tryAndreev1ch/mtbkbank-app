/**
 * Phase 3 — Plan 03-00 Wave 0 — REL-07 scaffold.
 *
 * BankAccount.balance CHECK (>= 0) constraint + 50-parallel-transfer load
 * + errorNormalizer mapping for Postgres 23514 → BALANCE_INSUFFICIENT.
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

describe('BankAccount balance CHECK constraint (REL-07)', () => {
  it.todo('50 parallel transfers from balance-1000 account never produce negative balance');
  it.todo('failing concurrent transfers receive AppError BALANCE_INSUFFICIENT (not DB_ERROR)');
  it.todo('errorNormalizer maps Postgres 23514 + BankAccount_balance_nonneg_check name → BALANCE_INSUFFICIENT (Pitfall 9)');
});

void supertest;
void app;
