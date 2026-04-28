-- Phase 4.5 / 04.5-01 / Migration A - admin console v2 cascade.
--
-- Scope (CONTEXT D-06 + RESEARCH ADMIN-12 + Pitfalls 3/4/A10/A11):
--   1. New columns: User.deletedAt, BankAccount.frozen
--   2. FK action RESTRICT -> CASCADE on all userId FKs
--   3. CardTrade.fromUserId / toUserId nullable + SET NULL
--   4. AuditLog.actorId nullable + SET NULL

-- 1. New columns
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "BankAccount" ADD COLUMN "frozen" BOOLEAN NOT NULL DEFAULT false;

-- 2. CardTrade peer FKs become nullable
ALTER TABLE "CardTrade" ALTER COLUMN "fromUserId" DROP NOT NULL;

-- 3. AuditLog.actorId nullable
ALTER TABLE "AuditLog" ALTER COLUMN "actorId" DROP NOT NULL;

-- 4. Drop existing FK constraints
ALTER TABLE "BankAccount"   DROP CONSTRAINT IF EXISTS "BankAccount_userId_fkey";
ALTER TABLE "BankCard"      DROP CONSTRAINT IF EXISTS "BankCard_userId_fkey";
ALTER TABLE "BankCard"      DROP CONSTRAINT IF EXISTS "BankCard_accountId_fkey";
ALTER TABLE "UserCard"      DROP CONSTRAINT IF EXISTS "UserCard_userId_fkey";
ALTER TABLE "Deck"          DROP CONSTRAINT IF EXISTS "Deck_userId_fkey";
ALTER TABLE "Transaction"   DROP CONSTRAINT IF EXISTS "Transaction_userId_fkey";
ALTER TABLE "Notification"  DROP CONSTRAINT IF EXISTS "Notification_userId_fkey";
ALTER TABLE "UserQuest"     DROP CONSTRAINT IF EXISTS "UserQuest_userId_fkey";
ALTER TABLE "Subscription"  DROP CONSTRAINT IF EXISTS "Subscription_userId_fkey";
ALTER TABLE "SpendingLimit" DROP CONSTRAINT IF EXISTS "SpendingLimit_userId_fkey";
ALTER TABLE "CardTrade"     DROP CONSTRAINT IF EXISTS "CardTrade_fromUserId_fkey";
ALTER TABLE "CardTrade"     DROP CONSTRAINT IF EXISTS "CardTrade_toUserId_fkey";
ALTER TABLE "AuditLog"      DROP CONSTRAINT IF EXISTS "AuditLog_actorId_fkey";

-- 5. Re-add with ON DELETE CASCADE / SET NULL
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BankCard" ADD CONSTRAINT "BankCard_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BankCard" ADD CONSTRAINT "BankCard_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "BankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserCard" ADD CONSTRAINT "UserCard_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Deck" ADD CONSTRAINT "Deck_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserQuest" ADD CONSTRAINT "UserQuest_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SpendingLimit" ADD CONSTRAINT "SpendingLimit_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CardTrade" ADD CONSTRAINT "CardTrade_fromUserId_fkey"
  FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CardTrade" ADD CONSTRAINT "CardTrade_toUserId_fkey"
  FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
