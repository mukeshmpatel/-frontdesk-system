CREATE TYPE "GuestSentiment" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE', 'ANGRY');
CREATE TYPE "FeedbackReplyState" AS ENUM ('NOT_REQUIRED', 'QUEUED', 'SENT', 'FAILED', 'MANUAL_REVIEW');
CREATE TYPE "SettlementStatus" AS ENUM ('DRAFT', 'READY', 'SETTLED', 'FAILED', 'VOIDED');

ALTER TABLE "properties"
  ADD COLUMN "branch_code" VARCHAR(20);
CREATE UNIQUE INDEX "properties_branch_code_key" ON "properties"("branch_code");

ALTER TABLE "rooms"
  ADD COLUMN "state_updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "guest_feedback_logs" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "booking_id" UUID NOT NULL,
  "correlation_id" UUID NOT NULL,
  "channel" VARCHAR(30) NOT NULL,
  "rating" INTEGER,
  "encrypted_raw_text" TEXT NOT NULL,
  "redacted_context" TEXT NOT NULL,
  "raw_text_checksum" TEXT NOT NULL,
  "sentiment_result" "GuestSentiment" NOT NULL,
  "sentiment_score" DECIMAL(6,5) NOT NULL,
  "anger_score" DECIMAL(6,5) NOT NULL,
  "urgency_score" DECIMAL(6,5) NOT NULL,
  "confidence_score" DECIMAL(6,5) NOT NULL,
  "context_summary" VARCHAR(1000) NOT NULL,
  "reply_state" "FeedbackReplyState" NOT NULL DEFAULT 'NOT_REQUIRED',
  "encrypted_reply_text" TEXT,
  "response_message_sid" VARCHAR(80),
  "recovery_task_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "guest_feedback_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "guest_feedback_logs_rating_check" CHECK ("rating" IS NULL OR "rating" BETWEEN 1 AND 5),
  CONSTRAINT "guest_feedback_logs_scores_check" CHECK (
    "sentiment_score" BETWEEN -1 AND 1
    AND "anger_score" BETWEEN 0 AND 1
    AND "urgency_score" BETWEEN 0 AND 1
    AND "confidence_score" BETWEEN 0 AND 1
  )
);
CREATE UNIQUE INDEX "guest_feedback_logs_recovery_task_id_key"
  ON "guest_feedback_logs"("recovery_task_id");
CREATE INDEX "guest_feedback_logs_property_id_sentiment_result_created_at_idx"
  ON "guest_feedback_logs"("property_id", "sentiment_result", "created_at" DESC);
CREATE INDEX "guest_feedback_logs_property_id_created_at_correlation_id_idx"
  ON "guest_feedback_logs"("property_id", "created_at" DESC, "correlation_id");
ALTER TABLE "guest_feedback_logs"
  ADD CONSTRAINT "guest_feedback_logs_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guest_feedback_logs"
  ADD CONSTRAINT "guest_feedback_logs_property_id_fkey"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guest_feedback_logs"
  ADD CONSTRAINT "guest_feedback_logs_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guest_feedback_logs"
  ADD CONSTRAINT "guest_feedback_logs_recovery_task_id_fkey"
  FOREIGN KEY ("recovery_task_id") REFERENCES "internal_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "feedback_intake_tokens" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "booking_id" UUID NOT NULL,
  "correlation_id" UUID NOT NULL,
  "idempotency_key" VARCHAR(160) NOT NULL,
  "encrypted_payload" TEXT NOT NULL,
  "status" VARCHAR(30) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "error_code" VARCHAR(80),
  "queued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ(6),
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "feedback_intake_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "feedback_intake_tokens_correlation_id_key"
  ON "feedback_intake_tokens"("correlation_id");
CREATE UNIQUE INDEX "feedback_intake_tokens_idempotency_key_key"
  ON "feedback_intake_tokens"("idempotency_key");
CREATE INDEX "feedback_intake_tokens_property_id_status_queued_at_idx"
  ON "feedback_intake_tokens"("property_id", "status", "queued_at");
ALTER TABLE "feedback_intake_tokens"
  ADD CONSTRAINT "feedback_intake_tokens_property_id_fkey"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "feedback_intake_tokens"
  ADD CONSTRAINT "feedback_intake_tokens_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "franchise_agreements" (
  "id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "royalty_percentage" DECIMAL(7,6) NOT NULL,
  "marketing_fund_pct" DECIMAL(7,6) NOT NULL,
  "effective_from" TIMESTAMPTZ(6) NOT NULL,
  "effective_to" TIMESTAMPTZ(6),
  "agreement_version" VARCHAR(50) NOT NULL,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "franchise_agreements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "franchise_agreements_rates_check" CHECK (
    "royalty_percentage" >= 0
    AND "marketing_fund_pct" >= 0
    AND "royalty_percentage" + "marketing_fund_pct" <= 1
  ),
  CONSTRAINT "franchise_agreements_dates_check" CHECK (
    "effective_to" IS NULL OR "effective_to" > "effective_from"
  )
);
CREATE UNIQUE INDEX "franchise_agreements_property_id_key"
  ON "franchise_agreements"("property_id");
ALTER TABLE "franchise_agreements"
  ADD CONSTRAINT "franchise_agreements_property_id_fkey"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "franchise_settle_ledgers" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "agreement_id" UUID NOT NULL,
  "folio_audit_id" UUID NOT NULL,
  "booking_id" UUID NOT NULL,
  "correlation_id" UUID NOT NULL,
  "gross_folio_amount" DECIMAL(12,2) NOT NULL,
  "royalty_rate" DECIMAL(7,6) NOT NULL,
  "marketing_rate" DECIMAL(7,6) NOT NULL,
  "corporate_cut" DECIMAL(12,2) NOT NULL,
  "marketing_cut" DECIMAL(12,2) NOT NULL,
  "franchisee_net" DECIMAL(12,2) NOT NULL,
  "status" "SettlementStatus" NOT NULL DEFAULT 'DRAFT',
  "settled_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "franchise_settle_ledgers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "franchise_settle_ledgers_amounts_check" CHECK (
    "gross_folio_amount" >= 0
    AND "corporate_cut" >= 0
    AND "marketing_cut" >= 0
    AND "franchisee_net" >= 0
  )
);
CREATE UNIQUE INDEX "franchise_settle_ledgers_folio_audit_id_key"
  ON "franchise_settle_ledgers"("folio_audit_id");
CREATE INDEX "franchise_settle_ledgers_tenant_id_status_created_at_idx"
  ON "franchise_settle_ledgers"("tenant_id", "status", "created_at" DESC);
CREATE INDEX "franchise_settle_ledgers_property_id_created_at_correlation_id_idx"
  ON "franchise_settle_ledgers"("property_id", "created_at" DESC, "correlation_id");
ALTER TABLE "franchise_settle_ledgers"
  ADD CONSTRAINT "franchise_settle_ledgers_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "franchise_settle_ledgers"
  ADD CONSTRAINT "franchise_settle_ledgers_property_id_fkey"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "franchise_settle_ledgers"
  ADD CONSTRAINT "franchise_settle_ledgers_agreement_id_fkey"
  FOREIGN KEY ("agreement_id") REFERENCES "franchise_agreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "franchise_settle_ledgers"
  ADD CONSTRAINT "franchise_settle_ledgers_folio_audit_id_fkey"
  FOREIGN KEY ("folio_audit_id") REFERENCES "folio_audits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "franchise_settle_ledgers"
  ADD CONSTRAINT "franchise_settle_ledgers_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "edge_sync_receipts" (
  "id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "edge_node_id" VARCHAR(100) NOT NULL,
  "edge_event_id" UUID NOT NULL,
  "correlation_id" UUID NOT NULL,
  "event_type" VARCHAR(80) NOT NULL,
  "payload_checksum" TEXT NOT NULL,
  "processed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "edge_sync_receipts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "edge_sync_receipts_edge_node_id_edge_event_id_key"
  ON "edge_sync_receipts"("edge_node_id", "edge_event_id");
CREATE INDEX "edge_sync_receipts_property_id_processed_at_correlation_id_idx"
  ON "edge_sync_receipts"("property_id", "processed_at" DESC, "correlation_id");
ALTER TABLE "edge_sync_receipts"
  ADD CONSTRAINT "edge_sync_receipts_property_id_fkey"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
