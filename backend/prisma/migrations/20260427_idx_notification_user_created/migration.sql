-- prisma-disable-transaction
-- Phase 4 / 04-02 / B-M4 — index supporting "user notifications, most-recent-first".
-- CONCURRENT so we do not take an ACCESS EXCLUSIVE lock on the Notification table
-- during deploy. Required by future Phase-8 production load (DEPLOY-04).
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Notification_userId_createdAt_idx"
  ON "Notification" ("userId", "createdAt" DESC);
