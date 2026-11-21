-- DRAFT - not applied. Prisma cannot express these. Move into a Prisma migration only after schema review approval.
--
-- This file is NOT a migration. It is not referenced by any config and must not
-- be copied into prisma/migrations until the schema review is approved.
-- Table and column names below are the @@map / @map values from
-- prisma/schema.prisma.

-- ===========================================================================
-- Section 1: CHECK constraints
-- ===========================================================================
-- Invoice total vs payments and payment-vs-outstanding limits cannot be CHECKs (they span rows); they are enforced transactionally in the service.
-- Not added: businesses.opening_balance sign (negative opening cash may be valid).
-- Not added: payment_reversals has no amount column, so no amount CHECK applies.

-- businesses
ALTER TABLE businesses
  ADD CONSTRAINT chk_businesses_currency_format
  CHECK (currency ~ '^[A-Z]{3}$');

ALTER TABLE businesses
  ADD CONSTRAINT chk_businesses_timezone_not_empty
  CHECK (length(btrim(timezone)) > 0);

-- invoices
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

ALTER TABLE invoices
  ADD CONSTRAINT chk_invoices_due_after_issue
  CHECK (due_date >= issue_date);

-- invoice_items
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

-- payments
ALTER TABLE payments
  ADD CONSTRAINT chk_payments_amount_pos
  CHECK (amount > 0);

-- expenses
ALTER TABLE expenses
  ADD CONSTRAINT chk_expenses_amount_pos
  CHECK (amount > 0);

ALTER TABLE expenses
  ADD CONSTRAINT chk_expenses_paid_requires_payment_date
  CHECK (status <> 'PAID' OR payment_date IS NOT NULL);

-- alerts (is_read and read_at both exist in the schema)
ALTER TABLE alerts
  ADD CONSTRAINT chk_alerts_read_at_matches_is_read
  CHECK ((is_read = false OR read_at IS NOT NULL) AND (is_read = true OR read_at IS NULL));

-- ===========================================================================
-- Section 2: Partial unique index for active alert dedupe
-- ===========================================================================
CREATE UNIQUE INDEX alerts_active_dedupe_key
  ON alerts (business_id, dedupe_key)
  WHERE resolved_at IS NULL AND dedupe_key IS NOT NULL;

-- ===========================================================================
-- Section 3: Currency-snapshot immutability (DRAFT, commented out for review)
-- ===========================================================================
-- The block below is intentionally commented out. Uncommenting it is a review
-- decision, not part of this draft.
--
-- CREATE OR REPLACE FUNCTION invoices_currency_immutable()
-- RETURNS trigger
-- LANGUAGE plpgsql
-- AS $$
-- BEGIN
--   IF OLD.currency IS DISTINCT FROM NEW.currency THEN
--     RAISE EXCEPTION 'invoices.currency is a snapshot and cannot be changed (invoice %)', OLD.id
--       USING ERRCODE = 'check_violation';
--   END IF;
--   RETURN NEW;
-- END;
-- $$;
--
-- CREATE TRIGGER trg_invoices_currency_immutable
--   BEFORE UPDATE OF currency ON invoices
--   FOR EACH ROW
--   EXECUTE FUNCTION invoices_currency_immutable();
