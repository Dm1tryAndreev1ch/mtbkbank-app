-- prisma-disable-transaction
ALTER TABLE "BankAccount"
  ADD CONSTRAINT "BankAccount_balance_nonneg_check"
  CHECK ("balance" >= 0) NOT VALID;

ALTER TABLE "BankAccount" VALIDATE CONSTRAINT "BankAccount_balance_nonneg_check";
