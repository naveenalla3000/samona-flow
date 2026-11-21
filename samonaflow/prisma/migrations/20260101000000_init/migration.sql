-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "business_role" AS ENUM ('OWNER', 'STAFF');

-- CreateEnum
CREATE TYPE "invoice_status" AS ENUM ('DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID');

-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('UPI', 'BANK_TRANSFER', 'CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "expense_category" AS ENUM ('RENT', 'INTERNET', 'SOFTWARE_SUBSCRIPTIONS', 'SALARIES', 'EQUIPMENT', 'MARKETING', 'TRAVEL', 'UTILITIES', 'OTHER');

-- CreateEnum
CREATE TYPE "expense_status" AS ENUM ('UPCOMING', 'OVERDUE', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "reminder_type" AS ENUM ('UPCOMING_PAYMENT', 'DUE_TODAY', 'OVERDUE_PAYMENT', 'FINAL_FOLLOW_UP');

-- CreateEnum
CREATE TYPE "reminder_status" AS ENUM ('DRAFTED', 'WHATSAPP_OPENED', 'MARKED_SENT');

-- CreateEnum
CREATE TYPE "alert_type" AS ENUM ('OVERDUE_PAYMENT', 'PAYMENT_APPROACHING', 'POTENTIAL_SHORTAGE', 'UPCOMING_EXPENSE', 'PARTIAL_PAYMENT_DUE', 'CUSTOMER_CONCENTRATION');

-- CreateEnum
CREATE TYPE "alert_severity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateTable
CREATE TABLE "user_profiles" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "full_name" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "businesses" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "owner_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "business_type" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "opening_balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "opening_balance_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_memberships" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "role" "business_role" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "company_name" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "issue_date" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "expected_payment_date" DATE,
    "status" "invoice_status" NOT NULL DEFAULT 'DRAFT',
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "notes" TEXT,
    "public_token_hash" TEXT,
    "public_token_revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "line_total" DECIMAL(12,2) NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "payment_date" DATE NOT NULL,
    "method" "payment_method" NOT NULL,
    "transaction_reference" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_reversals" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "reversed_by_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "reversed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_reversals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "category" "expense_category" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "due_date" DATE NOT NULL,
    "payment_date" DATE,
    "status" "expense_status" NOT NULL DEFAULT 'UPCOMING',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminders" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "reminder_type" "reminder_type" NOT NULL,
    "status" "reminder_status" NOT NULL DEFAULT 'DRAFTED',
    "message" TEXT NOT NULL,
    "follow_up_date" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "alert_type" "alert_type" NOT NULL,
    "severity" "alert_severity" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" UUID,
    "dedupe_key" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMPTZ(6),
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_email_key" ON "user_profiles"("email");

-- CreateIndex
CREATE INDEX "businesses_owner_id_idx" ON "businesses"("owner_id");

-- CreateIndex
CREATE INDEX "business_memberships_business_id_idx" ON "business_memberships"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "business_memberships_user_id_business_id_key" ON "business_memberships"("user_id", "business_id");

-- CreateIndex
CREATE INDEX "customers_business_id_archived_at_idx" ON "customers"("business_id", "archived_at");

-- CreateIndex
CREATE INDEX "customers_business_id_name_idx" ON "customers"("business_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "customers_id_business_id_key" ON "customers"("id", "business_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_public_token_hash_key" ON "invoices"("public_token_hash");

-- CreateIndex
CREATE INDEX "invoices_business_id_status_idx" ON "invoices"("business_id", "status");

-- CreateIndex
CREATE INDEX "invoices_business_id_due_date_idx" ON "invoices"("business_id", "due_date");

-- CreateIndex
CREATE INDEX "invoices_customer_id_idx" ON "invoices"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_business_id_invoice_number_key" ON "invoices"("business_id", "invoice_number");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_id_business_id_key" ON "invoices"("id", "business_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_id_customer_id_business_id_key" ON "invoices"("id", "customer_id", "business_id");

-- CreateIndex
CREATE INDEX "invoice_items_invoice_id_idx" ON "invoice_items"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_items_invoice_id_position_key" ON "invoice_items"("invoice_id", "position");

-- CreateIndex
CREATE INDEX "payments_invoice_id_idx" ON "payments"("invoice_id");

-- CreateIndex
CREATE INDEX "payments_business_id_payment_date_idx" ON "payments"("business_id", "payment_date");

-- CreateIndex
CREATE UNIQUE INDEX "payments_id_business_id_key" ON "payments"("id", "business_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_reversals_payment_id_key" ON "payment_reversals"("payment_id");

-- CreateIndex
CREATE INDEX "expenses_business_id_status_due_date_idx" ON "expenses"("business_id", "status", "due_date");

-- CreateIndex
CREATE INDEX "reminders_invoice_id_idx" ON "reminders"("invoice_id");

-- CreateIndex
CREATE INDEX "reminders_customer_id_idx" ON "reminders"("customer_id");

-- CreateIndex
CREATE INDEX "reminders_business_id_follow_up_date_idx" ON "reminders"("business_id", "follow_up_date");

-- CreateIndex
CREATE INDEX "alerts_business_id_resolved_at_idx" ON "alerts"("business_id", "resolved_at");

-- CreateIndex
CREATE INDEX "alerts_business_id_dedupe_key_idx" ON "alerts"("business_id", "dedupe_key");

-- AddForeignKey
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_memberships" ADD CONSTRAINT "business_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_memberships" ADD CONSTRAINT "business_memberships_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_business_id_fkey" FOREIGN KEY ("customer_id", "business_id") REFERENCES "customers"("id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_business_id_fkey" FOREIGN KEY ("invoice_id", "business_id") REFERENCES "invoices"("id", "business_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_business_id_fkey" FOREIGN KEY ("invoice_id", "business_id") REFERENCES "invoices"("id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_reversals" ADD CONSTRAINT "payment_reversals_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_reversals" ADD CONSTRAINT "payment_reversals_payment_id_business_id_fkey" FOREIGN KEY ("payment_id", "business_id") REFERENCES "payments"("id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_reversals" ADD CONSTRAINT "payment_reversals_reversed_by_id_fkey" FOREIGN KEY ("reversed_by_id") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_customer_id_business_id_fkey" FOREIGN KEY ("customer_id", "business_id") REFERENCES "customers"("id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_invoice_id_customer_id_business_id_fkey" FOREIGN KEY ("invoice_id", "customer_id", "business_id") REFERENCES "invoices"("id", "customer_id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Custom CHECK constraints (docs/database/pending-constraints.sql, Section 1).
-- chk_invoices_due_after_issue is intentionally omitted.
ALTER TABLE businesses
  ADD CONSTRAINT chk_businesses_currency_format
  CHECK (currency ~ '^[A-Z]{3}$');

ALTER TABLE businesses
  ADD CONSTRAINT chk_businesses_timezone_not_empty
  CHECK (length(btrim(timezone)) > 0);

ALTER TABLE invoices
  ADD CONSTRAINT chk_invoices_currency_format
  CHECK (currency ~ '^[A-Z]{3}$');

ALTER TABLE invoices
  ADD CONSTRAINT chk_invoices_subtotal_nonneg
  CHECK (subtotal >= 0);

ALTER TABLE invoices
  ADD CONSTRAINT chk_invoices_discount_nonneg
  CHECK (discount >= 0);

ALTER TABLE invoices
  ADD CONSTRAINT chk_invoices_tax_nonneg
  CHECK (tax >= 0);

ALTER TABLE invoices
  ADD CONSTRAINT chk_invoices_total_nonneg
  CHECK (total_amount >= 0);

ALTER TABLE invoices
  ADD CONSTRAINT chk_invoices_discount_lte_subtotal
  CHECK (discount <= subtotal);

ALTER TABLE invoices
  ADD CONSTRAINT chk_invoices_total_formula
  CHECK (total_amount = subtotal - discount + tax);

ALTER TABLE invoice_items
  ADD CONSTRAINT chk_invoice_items_quantity_pos
  CHECK (quantity > 0);

ALTER TABLE invoice_items
  ADD CONSTRAINT chk_invoice_items_unit_price_nonneg
  CHECK (unit_price >= 0);

ALTER TABLE invoice_items
  ADD CONSTRAINT chk_invoice_items_line_total_nonneg
  CHECK (line_total >= 0);

ALTER TABLE invoice_items
  ADD CONSTRAINT chk_invoice_items_line_total_formula
  CHECK (line_total = ROUND(quantity * unit_price, 2));

ALTER TABLE invoice_items
  ADD CONSTRAINT chk_invoice_items_position_pos
  CHECK ("position" >= 1);

ALTER TABLE payments
  ADD CONSTRAINT chk_payments_amount_pos
  CHECK (amount > 0);

ALTER TABLE expenses
  ADD CONSTRAINT chk_expenses_amount_pos
  CHECK (amount > 0);

ALTER TABLE expenses
  ADD CONSTRAINT chk_expenses_paid_requires_payment_date
  CHECK (status <> 'PAID' OR payment_date IS NOT NULL);

ALTER TABLE alerts
  ADD CONSTRAINT chk_alerts_read_at_matches_is_read
  CHECK ((is_read = false OR read_at IS NOT NULL) AND (is_read = true OR read_at IS NULL));

-- Partial unique index for active alert dedupe (pending-constraints.sql, Section 2).
CREATE UNIQUE INDEX alerts_active_dedupe_key
  ON alerts (business_id, dedupe_key)
  WHERE resolved_at IS NULL AND dedupe_key IS NOT NULL;

