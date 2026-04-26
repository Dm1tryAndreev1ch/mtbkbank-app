/**
 * Phase 3 — Plan 03-00 Wave 0 — SEC-14, D-01..D-04 scaffold.
 *
 * AuditLog write-path contract: writeAudit must commit in the same
 * prisma.$transaction as the mutation it audits, scrub forbidden keys,
 * store JSONB before/after payloads, and remain append-only.
 *
 * All `it.todo` until plan 03-12 (or successor) flips them green.
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

describe('AuditLog (SEC-14, D-01..D-04)', () => {
  it.todo('writeAudit row commits in same prisma.$transaction as mutation (D-03)');
  it.todo('writeAudit throwing rolls back the mutation (Phase-4.5 dependency, D-03)');
  it.todo('AuditLog.payload is JSONB and stores scrubbed before/after (D-01, D-02)');
  it.todo('forbidden keys (pin, password, cardNumber, Authorization, refreshToken, cookie) are [REDACTED] (D-02)');
  it.todo('AuditLog rows are append-only — no DELETE endpoint exposed (D-04)');
});

// supertest unused in scaffold — referenced to keep the boilerplate consistent
void supertest;
void app;
