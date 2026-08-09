CREATE TYPE "DeliveryStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'FAILED');
CREATE TYPE "LateCheckoutState" AS ENUM ('DETECTED', 'SMS_SENT', 'SLACK_ESCALATED', 'RESOLVED');

ALTER TABLE "users"
  ADD COLUMN "password_hash" TEXT;

-- Existing users must complete a password reset before password authentication is enabled.
UPDATE "users"
SET "password_hash" = '$2b$12$C6UzMDM.H6dfI/f/IKcEe.yrpGN9J2S2lN4T5nF6f7MeWZMYm3Dxu'
WHERE "password_hash" IS NULL;

ALTER TABLE "users"
  ALTER COLUMN "password_hash" SET NOT NULL;

ALTER TABLE "guest_profiles"
  ADD COLUMN "email_encrypted" TEXT;

ALTER TABLE "bookings"
  ADD COLUMN "wifi_access_code_hash" VARCHAR(64),
  ADD COLUMN "wifi_access_code_encrypted" TEXT,
  ADD COLUMN "wifi_bandwidth_tier" VARCHAR(20) NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN "wifi_profile_active" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "wifi_provisioned_at" TIMESTAMPTZ(6),
  ADD COLUMN "wifi_revoked_at" TIMESTAMPTZ(6),
  ADD COLUMN "folio_balance" DECIMAL(12,2) NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "bookings_wifi_access_code_hash_key"
  ON "bookings"("wifi_access_code_hash");

CREATE TABLE "folio_receipt_deliveries" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "booking_id" UUID NOT NULL,
  "folio_audit_id" UUID NOT NULL,
  "correlation_id" UUID NOT NULL,
  "recipient_hash" VARCHAR(64),
  "status" "DeliveryStatus" NOT NULL DEFAULT 'QUEUED',
  "provider_message_id" VARCHAR(160),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_error" VARCHAR(500),
  "queued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sent_at" TIMESTAMPTZ(6),
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "folio_receipt_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "folio_receipt_deliveries_folio_audit_id_key"
  ON "folio_receipt_deliveries"("folio_audit_id");
CREATE INDEX "folio_receipt_deliveries_property_id_status_queued_at_idx"
  ON "folio_receipt_deliveries"("property_id", "status", "queued_at");
CREATE INDEX "folio_receipt_deliveries_property_id_queued_at_correlation_id_idx"
  ON "folio_receipt_deliveries"("property_id", "queued_at" DESC, "correlation_id");

ALTER TABLE "folio_receipt_deliveries"
  ADD CONSTRAINT "folio_receipt_deliveries_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "folio_receipt_deliveries"
  ADD CONSTRAINT "folio_receipt_deliveries_folio_audit_id_fkey"
  FOREIGN KEY ("folio_audit_id") REFERENCES "folio_audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "late_checkout_incidents" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "booking_id" UUID NOT NULL,
  "correlation_id" UUID NOT NULL,
  "state" "LateCheckoutState" NOT NULL DEFAULT 'DETECTED',
  "checkout_at" TIMESTAMPTZ(6) NOT NULL,
  "first_detected_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reminder_claimed_at" TIMESTAMPTZ(6),
  "reminder_sent_at" TIMESTAMPTZ(6),
  "reminder_message_sid" VARCHAR(80),
  "extension_token_hash" VARCHAR(64),
  "slack_claimed_at" TIMESTAMPTZ(6),
  "slack_escalated_at" TIMESTAMPTZ(6),
  "slack_provider_message_id" VARCHAR(160),
  "resolved_at" TIMESTAMPTZ(6),
  "last_error" VARCHAR(500),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "late_checkout_incidents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "late_checkout_incidents_booking_id_key"
  ON "late_checkout_incidents"("booking_id");
CREATE UNIQUE INDEX "late_checkout_incidents_correlation_id_key"
  ON "late_checkout_incidents"("correlation_id");
CREATE UNIQUE INDEX "late_checkout_incidents_extension_token_hash_key"
  ON "late_checkout_incidents"("extension_token_hash");
CREATE INDEX "late_checkout_incidents_property_id_state_first_detected_at_idx"
  ON "late_checkout_incidents"("property_id", "state", "first_detected_at");
CREATE INDEX "late_checkout_incidents_property_id_created_at_correlation_id_idx"
  ON "late_checkout_incidents"("property_id", "created_at" DESC, "correlation_id");

ALTER TABLE "late_checkout_incidents"
  ADD CONSTRAINT "late_checkout_incidents_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
