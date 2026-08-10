CREATE TYPE "StaffWorkState" AS ENUM ('AVAILABLE', 'AWAY', 'STALLED');
CREATE TYPE "RoomStatus" AS ENUM ('VACANT', 'CLEAN', 'DIRTY', 'OCCUPIED', 'OUT_OF_ORDER');
CREATE TYPE "ClimateProfile" AS ENUM ('COMFORT', 'ECO_MODE');

ALTER TABLE "users"
  ADD COLUMN "work_state" "StaffWorkState" NOT NULL DEFAULT 'AVAILABLE';

ALTER TABLE "rooms"
  ADD COLUMN "room_status" "RoomStatus" NOT NULL DEFAULT 'VACANT',
  ADD COLUMN "thermostat_id" VARCHAR(80),
  ADD COLUMN "current_temp" DECIMAL(4,1),
  ADD COLUMN "climate_profile" "ClimateProfile" NOT NULL DEFAULT 'COMFORT';

ALTER TABLE "internal_tasks"
  ADD COLUMN "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "last_activity_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "reroute_count" INTEGER NOT NULL DEFAULT 0;

UPDATE "internal_tasks"
SET "assigned_at" = "created_at", "last_activity_at" = COALESCE("acknowledged_at", "created_at");

ALTER TABLE "bookings"
  ADD COLUMN "nfc_key_expires_at" TIMESTAMPTZ(6);

CREATE TABLE "task_escalation_logs" (
  "id" UUID NOT NULL,
  "task_id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "correlation_id" UUID NOT NULL,
  "previous_staff_id" UUID,
  "new_staff_id" UUID,
  "attempt_number" INTEGER NOT NULL,
  "sla_minutes" INTEGER NOT NULL,
  "reason" VARCHAR(255) NOT NULL,
  "breached_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "rerouted_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_escalation_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "room_telemetry_events" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "room_id" UUID NOT NULL,
  "correlation_id" UUID NOT NULL,
  "provider_event_id" TEXT NOT NULL,
  "event_type" VARCHAR(50) NOT NULL,
  "payload_checksum" TEXT NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL,
  "processed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "room_telemetry_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rooms_thermostat_id_key" ON "rooms"("thermostat_id");
CREATE INDEX "internal_tasks_property_id_status_urgency_last_activity_at_idx"
  ON "internal_tasks"("property_id", "status", "urgency", "last_activity_at");
CREATE INDEX "task_escalation_logs_task_id_created_at_idx"
  ON "task_escalation_logs"("task_id", "created_at" DESC);
CREATE INDEX "task_escalation_logs_property_id_breached_at_correlation_id_idx"
  ON "task_escalation_logs"("property_id", "breached_at" DESC, "correlation_id");
CREATE UNIQUE INDEX "room_telemetry_events_provider_event_id_key"
  ON "room_telemetry_events"("provider_event_id");
CREATE INDEX "room_telemetry_events_property_id_occurred_at_idx"
  ON "room_telemetry_events"("property_id", "occurred_at" DESC);
CREATE INDEX "room_telemetry_events_room_id_occurred_at_idx"
  ON "room_telemetry_events"("room_id", "occurred_at" DESC);
CREATE INDEX "room_telemetry_events_property_id_processed_at_correlation_id_idx"
  ON "room_telemetry_events"("property_id", "processed_at" DESC, "correlation_id");

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_room_id_fkey"
  FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "task_escalation_logs"
  ADD CONSTRAINT "task_escalation_logs_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "internal_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_escalation_logs"
  ADD CONSTRAINT "task_escalation_logs_previous_staff_id_fkey"
  FOREIGN KEY ("previous_staff_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "task_escalation_logs"
  ADD CONSTRAINT "task_escalation_logs_new_staff_id_fkey"
  FOREIGN KEY ("new_staff_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "room_telemetry_events"
  ADD CONSTRAINT "room_telemetry_events_property_id_fkey"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "room_telemetry_events"
  ADD CONSTRAINT "room_telemetry_events_room_id_fkey"
  FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
