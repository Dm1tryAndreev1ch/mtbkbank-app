/**
 * Phase 3 — Plan 03-13 — REL-10.
 *
 * cron HP-tick leader-election lock via redis SET NX PX.
 *
 * Contract:
 *   - acquireHpTickLeader(tickMs) returns true on first call (NX wins).
 *   - Concurrent second call returns false (NX held by first).
 *   - Lock TTL = tickMs * 2 — after expiry, next call re-elects (returns true).
 *   - Redis unavailable → returns true (single-replica v1.0 fail-open).
 */

const { truncateAll, getPrisma } = require('../setup');
const Redis = require('redis');

let prisma;
let redis;

beforeAll(async () => {
  jest.resetModules();
  prisma = getPrisma();
  redis = Redis.createClient({ url: process.env.REDIS_URL || 'redis://localhost:6380' });
  redis.on('error', () => { /* swallow — best-effort */ });
  try { await redis.connect(); } catch (_e) { /* tests will skip Redis-dependent assertions */ }
});

afterAll(async () => {
  if (prisma) await prisma.$disconnect();
  try { if (redis?.isReady) await redis.quit(); } catch (_e) { /* ignore */ }
});

beforeEach(async () => {
  await truncateAll();
  try { if (redis?.isReady) await redis.del('lock:hp-tick'); } catch (_e) { /* ignore */ }
});

describe('cron HP-tick leader lock (REL-10)', () => {
  it('acquireHpTickLeader returns true on first call (lock acquired)', async () => {
    const { acquireHpTickLeader } = require('../../src/services/cardEngine');
    const ok = await acquireHpTickLeader(1000);
    expect(ok).toBe(true);
  });

  it('second concurrent call returns false (NX lock held by first)', async () => {
    const { acquireHpTickLeader } = require('../../src/services/cardEngine');
    const a = await acquireHpTickLeader(2000);
    const b = await acquireHpTickLeader(2000);
    expect(a).toBe(true);
    expect(b).toBe(false);
  });

  it('lock TTL = tickMs * 2; after expiry next call re-elects', async () => {
    const { acquireHpTickLeader } = require('../../src/services/cardEngine');
    const first = await acquireHpTickLeader(200); // PX 400ms
    expect(first).toBe(true);
    const blocked = await acquireHpTickLeader(200);
    expect(blocked).toBe(false);
    await new Promise((r) => setTimeout(r, 500)); // wait for PX expiry
    const reacquired = await acquireHpTickLeader(200);
    expect(reacquired).toBe(true);
  });
});
