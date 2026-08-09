-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "IntakeIntent" AS ENUM ('CREATE_REMINDER', 'SCHEDULE_CALENDAR_BLOCK', 'DISPATCH_TASK', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "Urgency" AS ENUM ('LOW', 'MEDIUM', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AssignedRole" AS ENUM ('MAINTENANCE', 'HOUSEKEEPING', 'FRONT_DESK', 'MANAGEMENT');

-- CreateEnum
CREATE TYPE "WorkStatus" AS ENUM ('PENDING', 'DISPATCHED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'COMPLETED', 'ESCALATED', 'CANCELLED');

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "properties" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Chicago',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "twilio_phone_routes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "twilio_phone_number" TEXT NOT NULL,
    "default_submitter_user_id" UUID NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "twilio_phone_routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_messages" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "message_sid" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "from_phone_hash" TEXT NOT NULL,
    "to_phone_hash" TEXT NOT NULL,
    "redacted_body" TEXT NOT NULL,
    "body_checksum" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "intake_id" UUID,
    "provider_status" TEXT,
    "error_code" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sms_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "role" "AssignedRole" NOT NULL,
    "mobile_number" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_intakes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "submitted_by_user_id" UUID NOT NULL,
    "source_type" TEXT NOT NULL,
    "redacted_input" JSONB NOT NULL,
    "raw_input_checksum" TEXT NOT NULL,
    "intent" "IntakeIntent" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "target_time" TIMESTAMPTZ(6) NOT NULL,
    "assigned_to_role" "AssignedRole" NOT NULL,
    "associated_room_id" UUID,
    "urgency" "Urgency" NOT NULL,
    "confidence" DECIMAL(5,4) NOT NULL,
    "model" TEXT NOT NULL,
    "executed_entity_type" TEXT,
    "executed_entity_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "communication_intakes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminders" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "intake_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "target_time" TIMESTAMPTZ(6) NOT NULL,
    "urgency" "Urgency" NOT NULL,
    "status" "WorkStatus" NOT NULL DEFAULT 'PENDING',
    "acknowledged_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_blocks" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "room_id" UUID,
    "intake_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "urgency" "Urgency" NOT NULL,
    "status" "WorkStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "internal_tasks" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "room_id" UUID,
    "intake_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "assigned_role" "AssignedRole" NOT NULL,
    "assigned_user_id" UUID,
    "urgency" "Urgency" NOT NULL,
    "status" "WorkStatus" NOT NULL DEFAULT 'PENDING',
    "due_at" TIMESTAMPTZ(6) NOT NULL,
    "acknowledged_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "internal_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_drilldown_tokens" (
    "token" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "metric_type" TEXT NOT NULL,
    "record_ids" UUID[],
    "from_at" TIMESTAMPTZ(6) NOT NULL,
    "to_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_drilldown_tokens_pkey" PRIMARY KEY ("token")
);

-- CreateTable
CREATE TABLE "system_audit_trail" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "author_type" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "correlation_id" UUID NOT NULL,
    "redacted_raw_input" JSONB,
    "raw_input_checksum" TEXT,
    "llm_confidence" DECIMAL(5,4),
    "modified_tables" TEXT[],
    "delta" JSONB NOT NULL,
    "previous_audit_hash" TEXT,
    "audit_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_audit_trail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "properties_tenant_id_idx" ON "properties"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "twilio_phone_routes_twilio_phone_number_key" ON "twilio_phone_routes"("twilio_phone_number");

-- CreateIndex
CREATE INDEX "twilio_phone_routes_tenant_id_property_id_active_idx" ON "twilio_phone_routes"("tenant_id", "property_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "sms_messages_message_sid_key" ON "sms_messages"("message_sid");

-- CreateIndex
CREATE INDEX "sms_messages_tenant_id_property_id_created_at_idx" ON "sms_messages"("tenant_id", "property_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "sms_messages_tenant_id_status_created_at_idx" ON "sms_messages"("tenant_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "users_tenant_id_role_active_idx" ON "users"("tenant_id", "role", "active");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenant_id_email_key" ON "users"("tenant_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_property_id_number_key" ON "rooms"("property_id", "number");

-- CreateIndex
CREATE INDEX "communication_intakes_tenant_id_property_id_created_at_idx" ON "communication_intakes"("tenant_id", "property_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "communication_intakes_tenant_id_intent_created_at_idx" ON "communication_intakes"("tenant_id", "intent", "created_at" DESC);

-- CreateIndex
CREATE INDEX "reminders_property_id_status_target_time_idx" ON "reminders"("property_id", "status", "target_time");

-- CreateIndex
CREATE INDEX "calendar_blocks_property_id_room_id_starts_at_ends_at_idx" ON "calendar_blocks"("property_id", "room_id", "starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "internal_tasks_property_id_assigned_role_status_due_at_idx" ON "internal_tasks"("property_id", "assigned_role", "status", "due_at");

-- CreateIndex
CREATE INDEX "internal_tasks_assigned_user_id_status_idx" ON "internal_tasks"("assigned_user_id", "status");

-- CreateIndex
CREATE INDEX "report_drilldown_tokens_tenant_id_user_id_expires_at_idx" ON "report_drilldown_tokens"("tenant_id", "user_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "system_audit_trail_audit_hash_key" ON "system_audit_trail"("audit_hash");

-- CreateIndex
CREATE INDEX "system_audit_trail_tenant_id_property_id_created_at_idx" ON "system_audit_trail"("tenant_id", "property_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "system_audit_trail_tenant_id_event_type_created_at_idx" ON "system_audit_trail"("tenant_id", "event_type", "created_at" DESC);

-- Audit records remain append-only even if application credentials are compromised.
CREATE OR REPLACE FUNCTION prevent_system_audit_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'system_audit_trail is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER system_audit_trail_immutable
BEFORE UPDATE OR DELETE ON "system_audit_trail"
FOR EACH ROW EXECUTE FUNCTION prevent_system_audit_mutation();

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "twilio_phone_routes" ADD CONSTRAINT "twilio_phone_routes_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_intakes" ADD CONSTRAINT "communication_intakes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_blocks" ADD CONSTRAINT "calendar_blocks_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_blocks" ADD CONSTRAINT "calendar_blocks_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_tasks" ADD CONSTRAINT "internal_tasks_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_tasks" ADD CONSTRAINT "internal_tasks_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_tasks" ADD CONSTRAINT "internal_tasks_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_audit_trail" ADD CONSTRAINT "system_audit_trail_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
