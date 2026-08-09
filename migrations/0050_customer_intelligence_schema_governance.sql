-- Customer Intelligence/CDP schema is migration-owned; request handlers never create storage.
CREATE TABLE IF NOT EXISTS cdp_source_registry (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, property_id TEXT NOT NULL,
  source_key TEXT NOT NULL, source_type TEXT NOT NULL, label TEXT NOT NULL, status TEXT NOT NULL,
  data_freshness TEXT, last_error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(organization_id, property_id, source_key)
);
CREATE TABLE IF NOT EXISTS cdp_customer_profiles (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, property_id TEXT NOT NULL,
  customer_ref TEXT NOT NULL, email_hash TEXT, phone_hash TEXT,
  total_hotel_spend REAL NOT NULL DEFAULT 0, total_restaurant_spend REAL NOT NULL DEFAULT 0,
  hotel_nights INTEGER NOT NULL DEFAULT 0, restaurant_visits INTEGER NOT NULL DEFAULT 0,
  cohort_tags_json TEXT NOT NULL, marketing_consent INTEGER NOT NULL DEFAULT 0,
  personalization_consent INTEGER NOT NULL DEFAULT 0, suppressed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(organization_id, property_id, customer_ref)
);
CREATE TABLE IF NOT EXISTS cdp_tracking_events (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, property_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL, event_name TEXT NOT NULL, anonymous_id TEXT NOT NULL,
  customer_id TEXT, source TEXT NOT NULL, properties_json TEXT NOT NULL,
  occurred_at TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE(organization_id, property_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS cdp_transactions (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, property_id TEXT NOT NULL,
  external_transaction_id TEXT NOT NULL, customer_id TEXT NOT NULL, amount_spent REAL NOT NULL,
  department TEXT NOT NULL, items_json TEXT NOT NULL, business_date TEXT NOT NULL,
  source TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE(organization_id, property_id, external_transaction_id)
);
CREATE TABLE IF NOT EXISTS cdp_activation_requests (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, property_id TEXT NOT NULL,
  customer_id TEXT NOT NULL, channel TEXT NOT NULL, action TEXT NOT NULL, payload_json TEXT NOT NULL,
  status TEXT NOT NULL, risk_level TEXT NOT NULL, approval_reason TEXT, approved_by TEXT,
  approved_at TEXT, last_error TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cdp_geo_audiences (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, property_id TEXT NOT NULL,
  name TEXT NOT NULL, geo_type TEXT NOT NULL, city TEXT, state TEXT,
  postal_codes_json TEXT NOT NULL, radius_miles REAL, purpose TEXT NOT NULL, status TEXT NOT NULL,
  created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(organization_id, property_id, name)
);
CREATE TABLE IF NOT EXISTS cdp_audit_events (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, property_id TEXT NOT NULL,
  actor_email TEXT NOT NULL, event_type TEXT NOT NULL, entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL, detail_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS cdp_events_scope_idx ON cdp_tracking_events(organization_id, property_id, occurred_at);
CREATE INDEX IF NOT EXISTS cdp_tx_scope_idx ON cdp_transactions(organization_id, property_id, business_date);
CREATE INDEX IF NOT EXISTS cdp_activation_scope_idx ON cdp_activation_requests(organization_id, property_id, status, created_at);
CREATE INDEX IF NOT EXISTS cdp_geo_scope_idx ON cdp_geo_audiences(organization_id, property_id, status);
