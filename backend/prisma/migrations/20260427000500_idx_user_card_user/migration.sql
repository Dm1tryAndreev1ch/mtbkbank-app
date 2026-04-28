-- Phase 4 / 04-02 / B-M4 — index supporting per-user UserCard inventory queries.
-- The (userId, collectionCardId) UNIQUE already covers userId-prefix lookups, but
-- we ship the explicit index to satisfy Phase-8 DEPLOY-04 contract and `prisma diff`.
CREATE INDEX IF NOT EXISTS "UserCard_userId_idx"
  ON "UserCard" ("userId");
