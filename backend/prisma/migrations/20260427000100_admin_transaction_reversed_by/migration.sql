-- Phase 4.5 / 04.5-02 / ADMIN-02 - additive Transaction.reversedById.
ALTER TABLE "Transaction" ADD COLUMN "reversedById" TEXT;
CREATE UNIQUE INDEX "Transaction_reversedById_key" ON "Transaction"("reversedById");
ALTER TABLE "Transaction"
  ADD CONSTRAINT "Transaction_reversedById_fkey"
  FOREIGN KEY ("reversedById")
  REFERENCES "Transaction"("id")
  ON DELETE SET NULL
  ON UPDATE NO ACTION;
