/*
  Duplicate-submission protection for financial create operations.

  The client generates a random request key for each create form. A retry of
  the same submission (double click, lost response, network retry) reuses that
  key, so the unique index makes the second insert impossible and the service
  returns the row created by the first request.

  Both columns are nullable: existing rows and requests that do not supply a
  key keep working. PostgreSQL unique indexes allow multiple NULL values, so
  the keys are scoped per business without affecting legacy rows.
*/

ALTER TABLE "invoices" ADD COLUMN "idempotency_key" TEXT;
ALTER TABLE "payments" ADD COLUMN "idempotency_key" TEXT;

CREATE UNIQUE INDEX "invoices_business_id_idempotency_key_key"
  ON "invoices" ("business_id", "idempotency_key");

CREATE UNIQUE INDEX "payments_business_id_idempotency_key_key"
  ON "payments" ("business_id", "idempotency_key");
