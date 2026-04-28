-- prisma-disable-transaction
-- Phase 4 / 04-02 / B-M4 - index supporting user notifications most-recent-first.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Notification_userId_createdAt_idx"
  ON "Notification" ("userId", "createdAt" DESC);
