-- Fix: columns present in schema.prisma but missing from all prior migrations.
-- Each ADD COLUMN is nullable or has a DEFAULT → safe inside a transaction,
-- no `-- prisma-disable-transaction` directive needed.

-- CollectionCard.dropRate — card drop probability used by transaction handler
ALTER TABLE "CollectionCard" ADD COLUMN IF NOT EXISTS "dropRate" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CollectionCard.mbPrice — optional shop price; falls back to rarity default if NULL
ALTER TABLE "CollectionCard" ADD COLUMN IF NOT EXISTS "mbPrice" INTEGER;

-- CollectionCard.brandLogo — optional URL for brand logo image
ALTER TABLE "CollectionCard" ADD COLUMN IF NOT EXISTS "brandLogo" TEXT;

-- UserCard.lastWarningAt — tracks last low-HP push notification (REL-11)
ALTER TABLE "UserCard" ADD COLUMN IF NOT EXISTS "lastWarningAt" TIMESTAMP(3);

-- Subscription.category — UI grouping label, defaults to 'Другое'
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'Другое';

-- CardSource enum: add SHOP value if not already present
-- (ALTER TYPE ADD VALUE is idempotent-safe via DO block)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'SHOP'
      AND enumtypid = 'CardSource'::regtype
  ) THEN
    ALTER TYPE "CardSource" ADD VALUE 'SHOP';
  END IF;
END $$;

-- UserCard unique index on (userId, collectionCardId) — present in schema but
-- absent from init migration
CREATE UNIQUE INDEX IF NOT EXISTS "UserCard_userId_collectionCardId_key"
  ON "UserCard" ("userId", "collectionCardId");

-- Transaction.reversedById unique index + self-FK — added in a later migration
-- but guard here in case that migration was skipped
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "reversedById" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Transaction_reversedById_key"
  ON "Transaction" ("reversedById") WHERE "reversedById" IS NOT NULL;
