CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'DELIVERED', 'CANCELLED', 'FAILED');
CREATE TYPE "InventoryUnit" AS ENUM ('EACH', 'PACK', 'CASE', 'GALLON', 'POUND');
CREATE TYPE "BiometricVerificationStatus" AS ENUM ('NOT_ENROLLED', 'PENDING', 'VERIFIED', 'FAILED', 'MANUAL_REVIEW');
CREATE TYPE "FolioAuditStatus" AS ENUM ('PASSED', 'EXCEPTION', 'APPROVED');

ALTER TABLE "properties"
  ADD COLUMN "latitude" DECIMAL(9,6),
  ADD COLUMN "longitude" DECIMAL(9,6),
  ADD COLUMN "geofence_meters" INTEGER NOT NULL DEFAULT 500;

ALTER TABLE "rooms"
  ADD COLUMN "floor" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "users"
  ADD COLUMN "current_latitude" DECIMAL(9,6),
  ADD COLUMN "current_longitude" DECIMAL(9,6),
  ADD COLUMN "last_location_at" TIMESTAMPTZ(6);

ALTER TABLE "bookings"
  ADD COLUMN "guest_profile_id" UUID,
  ADD COLUMN "flight_carrier" VARCHAR(10),
  ADD COLUMN "flight_number" VARCHAR(10),
  ADD COLUMN "estimated_arrival_at" TIMESTAMPTZ(6),
  ADD COLUMN "flight_status" VARCHAR(30);

ALTER TABLE "folio_charges"
  ADD COLUMN "tax_rate" DECIMAL(7,6),
  ADD COLUMN "external_ref" VARCHAR(120);

CREATE TABLE "guest_profiles" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "email_hash" TEXT NOT NULL,
  "phone_number_encrypted" TEXT NOT NULL,
  "facial_vector_hash" TEXT,
  "biometric_consent_at" TIMESTAMPTZ(6),
  "biometric_retention_expires_at" TIMESTAMPTZ(6),
  "biometric_status" "BiometricVerificationStatus" NOT NULL DEFAULT 'NOT_ENROLLED',
  "is_identity_verified" BOOLEAN NOT NULL DEFAULT false,
  "identity_verified_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "guest_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "guest_profiles_property_id_email_hash_key"
  ON "guest_profiles"("property_id", "email_hash");
CREATE INDEX "guest_profiles_tenant_id_property_id_biometric_status_idx"
  ON "guest_profiles"("tenant_id", "property_id", "biometric_status");

ALTER TABLE "guest_profiles"
  ADD CONSTRAINT "guest_profiles_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guest_profiles"
  ADD CONSTRAINT "guest_profiles_property_id_fkey"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_guest_profile_id_fkey"
  FOREIGN KEY ("guest_profile_id") REFERENCES "guest_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "bookings_property_id_status_estimated_arrival_at_idx"
  ON "bookings"("property_id", "status", "estimated_arrival_at");
CREATE INDEX "bookings_guest_profile_id_check_in_at_idx"
  ON "bookings"("guest_profile_id", "check_in_at" DESC);

CREATE TABLE "door_access_credentials" (
  "id" UUID NOT NULL,
  "booking_id" UUID NOT NULL,
  "correlation_id" UUID NOT NULL,
  "token_hash" TEXT NOT NULL,
  "lock_provider_id" VARCHAR(120) NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "revoked_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "door_access_credentials_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "door_access_credentials_token_hash_key" ON "door_access_credentials"("token_hash");
CREATE INDEX "door_access_credentials_booking_id_expires_at_idx"
  ON "door_access_credentials"("booking_id", "expires_at");
ALTER TABLE "door_access_credentials"
  ADD CONSTRAINT "door_access_credentials_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "guest_access_sessions" (
  "id" UUID NOT NULL,
  "booking_id" UUID NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "revoked_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "guest_access_sessions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "guest_access_sessions_token_hash_key" ON "guest_access_sessions"("token_hash");
CREATE INDEX "guest_access_sessions_booking_id_expires_at_idx"
  ON "guest_access_sessions"("booking_id", "expires_at");
ALTER TABLE "guest_access_sessions"
  ADD CONSTRAINT "guest_access_sessions_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "hotel_inventory_items" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "sku" VARCHAR(50) NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "category" VARCHAR(50) NOT NULL,
  "unit" "InventoryUnit" NOT NULL DEFAULT 'EACH',
  "current_quantity" INTEGER NOT NULL,
  "reorder_threshold" INTEGER NOT NULL,
  "target_quantity" INTEGER NOT NULL,
  "unit_cost" DECIMAL(12,2) NOT NULL,
  "vendor_sku" VARCHAR(80),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "hotel_inventory_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "hotel_inventory_items_quantity_check"
    CHECK ("current_quantity" >= 0 AND "reorder_threshold" >= 0 AND "target_quantity" > "reorder_threshold")
);
CREATE UNIQUE INDEX "hotel_inventory_items_property_id_sku_key"
  ON "hotel_inventory_items"("property_id", "sku");
CREATE INDEX "hotel_inventory_items_tenant_id_property_id_category_active_idx"
  ON "hotel_inventory_items"("tenant_id", "property_id", "category", "active");
CREATE INDEX "hotel_inventory_items_property_id_current_quantity_reorder_threshold_idx"
  ON "hotel_inventory_items"("property_id", "current_quantity", "reorder_threshold");
ALTER TABLE "hotel_inventory_items"
  ADD CONSTRAINT "hotel_inventory_items_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hotel_inventory_items"
  ADD CONSTRAINT "hotel_inventory_items_property_id_fkey"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "inventory_usage_ledger" (
  "id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "inventory_item_id" UUID NOT NULL,
  "task_id" UUID,
  "room_id" UUID,
  "correlation_id" UUID NOT NULL,
  "quantity_delta" INTEGER NOT NULL,
  "balance_after" INTEGER NOT NULL,
  "reason" VARCHAR(160) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_usage_ledger_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_usage_ledger_balance_check" CHECK ("balance_after" >= 0)
);
CREATE UNIQUE INDEX "inventory_usage_ledger_task_id_inventory_item_id_key"
  ON "inventory_usage_ledger"("task_id", "inventory_item_id");
CREATE INDEX "inventory_usage_ledger_property_id_created_at_correlation_id_idx"
  ON "inventory_usage_ledger"("property_id", "created_at" DESC, "correlation_id");
ALTER TABLE "inventory_usage_ledger"
  ADD CONSTRAINT "inventory_usage_ledger_property_id_fkey"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_usage_ledger"
  ADD CONSTRAINT "inventory_usage_ledger_inventory_item_id_fkey"
  FOREIGN KEY ("inventory_item_id") REFERENCES "hotel_inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_usage_ledger"
  ADD CONSTRAINT "inventory_usage_ledger_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "internal_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventory_usage_ledger"
  ADD CONSTRAINT "inventory_usage_ledger_room_id_fkey"
  FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "vendor_purchase_orders" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "inventory_item_id" UUID NOT NULL,
  "correlation_id" UUID NOT NULL,
  "sku" VARCHAR(50) NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unit_cost" DECIMAL(12,2) NOT NULL,
  "total_cost" DECIMAL(12,2) NOT NULL,
  "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "vendor_draft_id" VARCHAR(120),
  "failure_reason" VARCHAR(500),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submitted_at" TIMESTAMPTZ(6),
  "delivered_at" TIMESTAMPTZ(6),
  CONSTRAINT "vendor_purchase_orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "vendor_purchase_orders_quantity_check" CHECK ("quantity" > 0 AND "unit_cost" >= 0 AND "total_cost" >= 0)
);
CREATE INDEX "vendor_purchase_orders_property_id_status_created_at_idx"
  ON "vendor_purchase_orders"("property_id", "status", "created_at" DESC);
CREATE INDEX "vendor_purchase_orders_property_id_sku_status_idx"
  ON "vendor_purchase_orders"("property_id", "sku", "status");
CREATE INDEX "vendor_purchase_orders_property_id_created_at_correlation_id_idx"
  ON "vendor_purchase_orders"("property_id", "created_at" DESC, "correlation_id");
CREATE UNIQUE INDEX "vendor_purchase_orders_one_open_per_item"
  ON "vendor_purchase_orders"("property_id", "inventory_item_id")
  WHERE "status" IN ('DRAFT', 'SUBMITTED', 'APPROVED');
ALTER TABLE "vendor_purchase_orders"
  ADD CONSTRAINT "vendor_purchase_orders_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vendor_purchase_orders"
  ADD CONSTRAINT "vendor_purchase_orders_property_id_fkey"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vendor_purchase_orders"
  ADD CONSTRAINT "vendor_purchase_orders_inventory_item_id_fkey"
  FOREIGN KEY ("inventory_item_id") REFERENCES "hotel_inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "folio_audits" (
  "id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "booking_id" UUID NOT NULL,
  "correlation_id" UUID NOT NULL,
  "status" "FolioAuditStatus" NOT NULL,
  "base_amount" DECIMAL(12,2) NOT NULL,
  "expected_tax" DECIMAL(12,2) NOT NULL,
  "posted_tax" DECIMAL(12,2) NOT NULL,
  "variance_amount" DECIMAL(12,2) NOT NULL,
  "exception_details" JSONB NOT NULL,
  "generated_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "folio_audits_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "folio_audits_property_id_created_at_correlation_id_idx"
  ON "folio_audits"("property_id", "created_at" DESC, "correlation_id");
CREATE INDEX "folio_audits_booking_id_created_at_idx"
  ON "folio_audits"("booking_id", "created_at" DESC);
ALTER TABLE "folio_audits"
  ADD CONSTRAINT "folio_audits_property_id_fkey"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "folio_audits"
  ADD CONSTRAINT "folio_audits_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
