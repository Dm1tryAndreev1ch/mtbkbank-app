-- Phase 4.5 / 04.5-02 / ADMIN-02 — Migration B: additive Transaction.reversedById.
--
-- Idempotent version: every DDL statement is guarded with IF NOT EXISTS so the
-- migration is safe to apply on a database that already has these objects
-- (e.g. applied via the previous short-name dir 20260427_admin_transaction_reversed_by).
-- Prisma P3009 is resolved because the statements no longer fail on duplicate objects.

-- 1. Add column only if it does not already exist.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'Transaction' AND column_name = 'reversedById'
  ) THEN
    ALTER TABLE "Transaction" ADD COLUMN "reversedById" TEXT;
  END IF;
END $$;

-- 2. Create unique index only if it does not already exist.
CREATE UNIQUE INDEX IF NOT EXISTS "Transaction_reversedById_key"
  ON "Transaction"("reversedById");

-- 3. Add FK constraint only if it does not already exist.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE constraint_name = 'Transaction_reversedById_fkey'
       AND table_name = 'Transaction'
  ) THEN
    ALTER TABLE "Transaction"
      ADD CONSTRAINT "Transaction_reversedById_fkey"
      FOREIGN KEY ("reversedById")
      REFERENCES "Transaction"("id")
      ON DELETE SET NULL
      ON UPDATE NO ACTION;
  END IF;
END $$;
