/**
 * Phase 3 — Plan 03-00 Wave 0 — SEC-11 scaffold.
 *
 * WebSocket handshake JWT verification, shared with HTTP auth (env.JWT_SECRET).
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

describe('WS handshake JWT (SEC-11)', () => {
  it.todo('connect with no auth.token → handshake error AUTH_TOKEN_INVALID + log ws_handshake_no_token');
  it.todo('connect with malformed JWT → handshake error AUTH_TOKEN_INVALID + log ws_handshake_invalid_token (reason captured)');
  it.todo('verifier shared with HTTP auth (uses env.JWT_SECRET, not process.env.JWT_SECRET)');
});

void supertest;
void app;
