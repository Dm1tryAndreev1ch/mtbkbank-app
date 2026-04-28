-- prisma-disable-transaction
-- Phase 4 / 04-02 / B-M4 — index supporting "user transactions, most-recent-first".
-- CONCURRENT so we do not take an ACCESS EXCLUSIVE lock on the Transaction table
-- during deploy. Required by future Phase-8 production load (DEPLOY-04).
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Transaction_userId_createdAt_idx"
  ON "Transaction" ("userId", "createdAt" DESC);
