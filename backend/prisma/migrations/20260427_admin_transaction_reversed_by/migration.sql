-- Phase 4.5 / 04.5-02 / ADMIN-02 — Migration B: additive Transaction.reversedById.
--
-- Adds the nullable self-FK column + UNIQUE index + FK constraint that admin
-- TRANSACTION_REVERSE uses for idempotency. A second reverse attempt against
-- the same original transaction collides on P2002 (UNIQUE violation), which
-- the route handler translates to 409 TRANSACTION_ALREADY_REVERSED.
--
-- Additive nullable column — safe to apply online; default Prisma transaction
-- semantics are fine (no `-- prisma-disable-transaction` needed because we
-- are NOT using CREATE INDEX CONCURRENTLY here; the unique index lock is
-- acceptable for the small Transaction backfill window).

ALTER TABLE "Transaction" ADD COLUMN "reversedById" TEXT;

CREATE UNIQUE INDEX "Transaction_reversedById_key" ON "Transaction"("reversedById");

ALTER TABLE "Transaction"
  ADD CONSTRAINT "Transaction_reversedById_fkey"
  FOREIGN KEY ("reversedById")
  REFERENCES "Transaction"("id")
  ON DELETE SET NULL
  ON UPDATE NO ACTION;
