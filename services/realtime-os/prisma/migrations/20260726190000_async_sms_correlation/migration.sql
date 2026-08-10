CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE "communication_intakes" ADD COLUMN "correlation_id" UUID;
UPDATE "communication_intakes" SET "correlation_id" = gen_random_uuid() WHERE "correlation_id" IS NULL;
ALTER TABLE "communication_intakes" ALTER COLUMN "correlation_id" SET NOT NULL;

ALTER TABLE "internal_tasks" ADD COLUMN "correlation_id" UUID;
UPDATE "internal_tasks" SET "correlation_id" = gen_random_uuid() WHERE "correlation_id" IS NULL;
ALTER TABLE "internal_tasks" ALTER COLUMN "correlation_id" SET NOT NULL;

CREATE TABLE "intake_tokens" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "correlation_id" UUID NOT NULL,
  "provider_message_sid" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "payload" JSONB NOT NULL,
  "error_code" TEXT,
  "queued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processing_started_at" TIMESTAMPTZ(6),
  "completed_at" TIMESTAMPTZ(6),
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "intake_tokens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bookings" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "correlation_id" UUID NOT NULL,
  "confirmation_number" TEXT NOT NULL,
  "guest_reference_hash" TEXT NOT NULL,
  "room_id" UUID,
  "check_in_at" TIMESTAMPTZ(6) NOT NULL,
  "check_out_at" TIMESTAMPTZ(6) NOT NULL,
  "status" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "folio_charges" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "correlation_id" UUID NOT NULL,
  "booking_id" UUID,
  "charge_code" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
  "posted_at" TIMESTAMPTZ(6) NOT NULL,
  "status" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "folio_charges_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "intake_tokens_correlation_id_key" ON "intake_tokens"("correlation_id");
CREATE UNIQUE INDEX "intake_tokens_provider_message_sid_key" ON "intake_tokens"("provider_message_sid");
CREATE INDEX "intake_tokens_property_id_status_queued_at_idx" ON "intake_tokens"("property_id", "status", "queued_at");
CREATE INDEX "intake_tokens_property_id_queued_at_correlation_id_idx" ON "intake_tokens"("property_id", "queued_at" DESC, "correlation_id");
CREATE UNIQUE INDEX "bookings_property_id_confirmation_number_key" ON "bookings"("property_id", "confirmation_number");
CREATE INDEX "bookings_property_id_created_at_correlation_id_idx" ON "bookings"("property_id", "created_at" DESC, "correlation_id");
CREATE INDEX "bookings_property_id_room_id_check_in_at_check_out_at_idx" ON "bookings"("property_id", "room_id", "check_in_at", "check_out_at");
CREATE INDEX "folio_charges_property_id_created_at_correlation_id_idx" ON "folio_charges"("property_id", "created_at" DESC, "correlation_id");
CREATE INDEX "folio_charges_booking_id_posted_at_idx" ON "folio_charges"("booking_id", "posted_at" DESC);
CREATE INDEX "communication_intakes_property_id_created_at_correlation_id_idx" ON "communication_intakes"("property_id", "created_at" DESC, "correlation_id");
CREATE INDEX "internal_tasks_property_id_created_at_correlation_id_idx" ON "internal_tasks"("property_id", "created_at" DESC, "correlation_id");
CREATE INDEX "system_audit_trail_property_id_created_at_correlation_id_idx" ON "system_audit_trail"("property_id", "created_at" DESC, "correlation_id");

ALTER TABLE "intake_tokens" ADD CONSTRAINT "intake_tokens_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "intake_tokens" ADD CONSTRAINT "intake_tokens_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "folio_charges" ADD CONSTRAINT "folio_charges_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "folio_charges" ADD CONSTRAINT "folio_charges_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "folio_charges" ADD CONSTRAINT "folio_charges_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
