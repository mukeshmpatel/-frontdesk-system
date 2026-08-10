CREATE TABLE IF NOT EXISTS property_contexts (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, code TEXT NOT NULL, name TEXT NOT NULL,
 address TEXT NOT NULL, timezone TEXT NOT NULL, database_mode TEXT NOT NULL, database_binding TEXT,
 status TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(organization_id,code)
);
CREATE TABLE IF NOT EXISTS property_assignments (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, property_id TEXT NOT NULL, user_email TEXT NOT NULL,
 department TEXT NOT NULL, role_label TEXT NOT NULL, is_default INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(organization_id,property_id,user_email)
);
CREATE TABLE IF NOT EXISTS front_desk_operational_records (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, property_id TEXT NOT NULL, correlation_id TEXT NOT NULL,
 record_type TEXT NOT NULL, category TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL,
 room_number TEXT, guest_reference TEXT, reservation_reference TEXT, priority TEXT NOT NULL, status TEXT NOT NULL,
 assigned_department TEXT, assigned_to TEXT, quantity INTEGER, unit_cost_cents INTEGER, fee_cents INTEGER,
 due_at TEXT, acknowledged_at TEXT, started_at TEXT, completed_at TEXT, verified_at TEXT, closed_at TEXT,
 source_type TEXT NOT NULL, source_reference TEXT, details_json TEXT NOT NULL, ai_status TEXT NOT NULL,
 ai_confidence REAL, ai_explanation TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(organization_id,correlation_id)
);
CREATE INDEX IF NOT EXISTS front_desk_record_queue_idx ON front_desk_operational_records(organization_id,property_id,record_type,status,due_at);
CREATE TABLE IF NOT EXISTS operational_status_history (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, property_id TEXT NOT NULL, entity_type TEXT NOT NULL,
 entity_id TEXT NOT NULL, from_status TEXT, to_status TEXT NOT NULL, reason_code TEXT, note TEXT NOT NULL,
 actor_email TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS operational_status_history_idx ON operational_status_history(organization_id,entity_type,entity_id,created_at);
CREATE TABLE IF NOT EXISTS domain_outbox_events (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, property_id TEXT NOT NULL, event_type TEXT NOT NULL,
 entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, payload_json TEXT NOT NULL,
 status TEXT NOT NULL, occurred_at TEXT NOT NULL, processed_at TEXT, UNIQUE(organization_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS domain_outbox_delivery_idx ON domain_outbox_events(organization_id,status,occurred_at);
CREATE TABLE IF NOT EXISTS automation_exceptions (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, property_id TEXT NOT NULL, source_type TEXT NOT NULL,
 source_id TEXT, exception_state TEXT NOT NULL, severity TEXT NOT NULL, title TEXT NOT NULL, detail TEXT NOT NULL,
 extracted_json TEXT NOT NULL, missing_fields_json TEXT NOT NULL, recommended_action TEXT NOT NULL,
 owner_email TEXT, status TEXT NOT NULL, retry_count INTEGER NOT NULL DEFAULT 0, next_retry_at TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS automation_exception_queue_idx ON automation_exceptions(organization_id,property_id,status,severity,created_at);
ALTER TABLE supply_inventory ADD COLUMN property_id TEXT NOT NULL DEFAULT '';
ALTER TABLE supply_inventory ADD COLUMN location_id TEXT;
ALTER TABLE supply_inventory ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE supply_inventory ADD COLUMN base_unit TEXT NOT NULL DEFAULT 'EACH';
ALTER TABLE supply_inventory ADD COLUMN purchase_unit TEXT NOT NULL DEFAULT 'CASE';
ALTER TABLE supply_inventory ADD COLUMN issue_unit TEXT NOT NULL DEFAULT 'EACH';
ALTER TABLE supply_inventory ADD COLUMN pack_size INTEGER NOT NULL DEFAULT 1;
ALTER TABLE supply_inventory ADD COLUMN par_quantity INTEGER NOT NULL DEFAULT 0;
ALTER TABLE supply_inventory ADD COLUMN safety_stock INTEGER NOT NULL DEFAULT 0;
ALTER TABLE supply_inventory ADD COLUMN committed_quantity INTEGER NOT NULL DEFAULT 0;
ALTER TABLE supply_inventory ADD COLUMN on_order_quantity INTEGER NOT NULL DEFAULT 0;
ALTER TABLE supply_inventory ADD COLUMN barcode TEXT;
ALTER TABLE supply_inventory ADD COLUMN preferred_vendor_id TEXT;
ALTER TABLE supply_inventory ADD COLUMN lead_time_days INTEGER NOT NULL DEFAULT 5;
ALTER TABLE supply_inventory ADD COLUMN expiration_tracked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE supply_inventory ADD COLUMN hazardous INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS inventory_locations (
 id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,property_id TEXT NOT NULL,code TEXT NOT NULL,name TEXT NOT NULL,
 department TEXT NOT NULL,location_type TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,
 UNIQUE(organization_id,property_id,code)
);
CREATE TABLE IF NOT EXISTS inventory_purchase_orders (
 id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,property_id TEXT NOT NULL,po_number TEXT NOT NULL,vendor_id TEXT NOT NULL,
 status TEXT NOT NULL,subtotal_cents INTEGER NOT NULL,tax_cents INTEGER NOT NULL,freight_cents INTEGER NOT NULL,total_cents INTEGER NOT NULL,
 expected_at TEXT,submitted_at TEXT,received_at TEXT,created_by TEXT NOT NULL,approved_by TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
 UNIQUE(organization_id,po_number)
);
CREATE INDEX IF NOT EXISTS inventory_po_queue_idx ON inventory_purchase_orders(organization_id,property_id,status,created_at);
CREATE TABLE IF NOT EXISTS inventory_purchase_order_lines (
 id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,purchase_order_id TEXT NOT NULL,sku TEXT NOT NULL,
 ordered_quantity INTEGER NOT NULL,received_quantity INTEGER NOT NULL,unit_cost_cents INTEGER NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS inventory_po_line_idx ON inventory_purchase_order_lines(organization_id,purchase_order_id,sku);
