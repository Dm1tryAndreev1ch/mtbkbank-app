/**
 * Phase 4 / 04-02 / B-M4 — pin existence of the 3 CONCURRENT indexes shipped by
 * 20260427_idx_* migrations and the User.refreshTokenExpiresAt column shipped by
 * 20260427_refresh_token_expires_at.
 *
 * This is a smoke test: it queries pg_indexes / information_schema directly via
 * Prisma's $queryRawUnsafe so the assertions hold regardless of any later
 * migrations renaming or repointing the underlying schema. If a future change
 * accidentally drops one of these structures the test trips loudly.
 */

const { truncateAll, getPrisma } = require('../setup');

let prisma;

beforeAll(() => {
  prisma = getPrisma();
});

afterAll(async () => {
  if (prisma) await prisma.$disconnect();
});

beforeEach(async () => {
  await truncateAll();
});

describe('B-M4 — concurrent indexes + refreshTokenExpiresAt smoke', () => {
  test('Transaction_userId_createdAt_idx exists', async () => {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'Transaction' AND indexname = 'Transaction_userId_createdAt_idx'`,
    );
    expect(rows).toHaveLength(1);
  });

  test('Notification_userId_createdAt_idx exists', async () => {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'Notification' AND indexname = 'Notification_userId_createdAt_idx'`,
    );
    expect(rows).toHaveLength(1);
  });

  test('UserCard_userId_idx exists', async () => {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'UserCard' AND indexname = 'UserCard_userId_idx'`,
    );
    expect(rows).toHaveLength(1);
  });

  test('User.refreshTokenExpiresAt column exists (timestamp, nullable)', async () => {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
        WHERE table_name = 'User' AND column_name = 'refreshTokenExpiresAt'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].data_type).toMatch(/timestamp/i);
    expect(rows[0].is_nullable).toBe('YES');
  });
});
