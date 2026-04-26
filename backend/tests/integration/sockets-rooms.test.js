/**
 * Phase 3 — Plan 03-00 Wave 0 — REL-09 scaffold.
 *
 * Socket.IO rooms refactor: replace connectedUsers Map with io.to(user:{id}).
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

describe('Socket.IO rooms refactor (REL-09)', () => {
  it.todo('on connect socket joins room user:{userId}');
  it.todo('broadcastToUser emits via io.to(user:{id}).emit() (no connectedUsers Map)');
  it.todo('connectedUsers Map reference is gone from backend/src/websocket/index.js (regression-guard pin)');
  it.todo('reconnect produces single broadcast event on receiver (no double-emit, Pitfall 5)');
});

void supertest;
void app;
