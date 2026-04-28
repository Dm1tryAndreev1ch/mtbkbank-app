-- Phase 4 / 04-02 / B-M2 — refresh-token expiration window.
-- Adds nullable expiry stamp on User.refreshTokenExpiresAt and backfills
-- historical rows to (createdAt + 30 days) so previously-issued tokens do not
-- retain unbounded validity. Future issuances populate the column at signing
-- time (auth.js login/register/refresh).
--
-- ALTER TABLE ADD COLUMN + UPDATE is small and safe inside a transaction;
-- no `-- prisma-disable-transaction` directive is needed for this migration.

ALTER TABLE "User" ADD COLUMN "refreshTokenExpiresAt" TIMESTAMP(3);

UPDATE "User"
   SET "refreshTokenExpiresAt" = "createdAt" + INTERVAL '30 days'
 WHERE "refreshTokenExpiresAt" IS NULL
   AND "refreshToken" IS NOT NULL;
