-- prisma-disable-transaction
-- Phase 4 / 04-02 / B-M4 - index supporting per-user UserCard inventory queries.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "UserCard_userId_idx"
  ON "UserCard" ("userId");
