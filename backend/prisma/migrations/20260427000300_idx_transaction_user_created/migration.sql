-- prisma-disable-transaction
-- Phase 4 / 04-02 / B-M4 - index supporting user transactions most-recent-first.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Transaction_userId_createdAt_idx"
  ON "Transaction" ("userId", "createdAt" DESC);
