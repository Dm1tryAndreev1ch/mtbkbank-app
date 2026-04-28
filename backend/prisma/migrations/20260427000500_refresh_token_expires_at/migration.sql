-- Phase 4 / 04-02 / B-M2 - refresh-token expiration window.
ALTER TABLE "User" ADD COLUMN "refreshTokenExpiresAt" TIMESTAMP(3);
UPDATE "User"
   SET "refreshTokenExpiresAt" = "createdAt" + INTERVAL '30 days'
 WHERE "refreshTokenExpiresAt" IS NULL
   AND "refreshToken" IS NOT NULL;
