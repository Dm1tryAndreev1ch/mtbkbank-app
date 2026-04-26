/**
 * Phase 3 — Plan 03-00 Wave 0 — REL-10 scaffold.
 *
 * cron HP-tick leader-election lock via redis SET NX PX.
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

describe('cron HP-tick leader lock (REL-10)', () => {
  it.todo('tickActiveDeckCardHealth wraps in redis.set lock:hp-tick INSTANCE_ID NX PX (tickMs * 2)');
  it.todo('two concurrent processes — only the leader runs tick body; other logs hp-tick-skipped');
  it.todo('lock TTL = tickMs * 2 — next tick re-elects on lossy renewal');
});

void supertest;
void app;
