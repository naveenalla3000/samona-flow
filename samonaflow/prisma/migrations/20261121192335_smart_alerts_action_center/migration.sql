/*
  Smart Alerts and Action Center lifecycle fields.

  The alerts table already existed in the initial migration. This migration
  keeps its rows and renames the polymorphic reference columns, adds the
  lifecycle status and recommended action, and adds the indexes used by the
  alert list and dashboard. The active-alert partial unique index from the
  initial migration is unchanged and continues to prevent duplicate alerts for
  the same business and dedupe key while resolved_at is null.
*/

-- CreateEnum
CREATE TYPE "alert_status" AS ENUM ('ACTIVE', 'RESOLVED', 'DISMISSED');

-- Rename the existing polymorphic reference columns without losing data.
ALTER TABLE "alerts" RENAME COLUMN "entity_type" TO "related_entity_type";
ALTER TABLE "alerts" RENAME COLUMN "entity_id" TO "related_entity_id";

-- Add recommended_action with a safe backfill for any existing rows.
ALTER TABLE "alerts" ADD COLUMN "recommended_action" TEXT;
UPDATE "alerts" SET "recommended_action" = 'Review this alert.' WHERE "recommended_action" IS NULL;
ALTER TABLE "alerts" ALTER COLUMN "recommended_action" SET NOT NULL;

-- Add updated_at with a safe backfill for any existing rows.
ALTER TABLE "alerts" ADD COLUMN "updated_at" TIMESTAMPTZ(6);
UPDATE "alerts" SET "updated_at" = "created_at" WHERE "updated_at" IS NULL;
ALTER TABLE "alerts" ALTER COLUMN "updated_at" SET NOT NULL;

-- Add status. Existing unresolved rows become ACTIVE; resolved rows stay
-- RESOLVED so they never reappear as current warnings.
ALTER TABLE "alerts" ADD COLUMN "status" "alert_status" NOT NULL DEFAULT 'ACTIVE';
UPDATE "alerts" SET "status" = 'RESOLVED' WHERE "resolved_at" IS NOT NULL;

-- A resolved alert must have a resolved_at timestamp, and an active or
-- dismissed alert must not.
ALTER TABLE "alerts"
  ADD CONSTRAINT chk_alerts_resolved_at_matches_status
  CHECK ((status = 'RESOLVED') = (resolved_at IS NOT NULL));

-- CreateIndex
CREATE INDEX "alerts_business_id_alert_type_idx" ON "alerts"("business_id", "alert_type");

-- CreateIndex
CREATE INDEX "alerts_business_id_severity_idx" ON "alerts"("business_id", "severity");

-- CreateIndex
CREATE INDEX "alerts_business_id_status_idx" ON "alerts"("business_id", "status");

-- CreateIndex
CREATE INDEX "alerts_business_id_is_read_idx" ON "alerts"("business_id", "is_read");

-- CreateIndex
CREATE INDEX "alerts_business_id_created_at_idx" ON "alerts"("business_id", "created_at");

-- CreateIndex
CREATE INDEX "alerts_business_id_related_entity_id_idx" ON "alerts"("business_id", "related_entity_id");
