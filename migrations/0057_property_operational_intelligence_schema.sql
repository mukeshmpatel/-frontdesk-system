CREATE TABLE IF NOT EXISTS amenity_access_events (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, confirmation_number TEXT NOT NULL,
  room_number TEXT NOT NULL, facility TEXT NOT NULL, decision TEXT NOT NULL,
  reason TEXT NOT NULL, occurred_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS amenity_access_event_scope_idx
  ON amenity_access_events(organization_id, occurred_at);

CREATE TABLE IF NOT EXISTS cleaning_velocity_events (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, housekeeper TEXT NOT NULL,
  room_number TEXT NOT NULL, started_at TEXT NOT NULL, completed_at TEXT NOT NULL,
  minutes INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS cleaning_velocity_scope_idx
  ON cleaning_velocity_events(organization_id, completed_at);

CREATE TABLE IF NOT EXISTS supply_order_drafts (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, sku TEXT NOT NULL,
  quantity INTEGER NOT NULL, total_cost_cents INTEGER NOT NULL, reason TEXT NOT NULL,
  status TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS supply_order_draft_scope_idx
  ON supply_order_drafts(organization_id, status, created_at);
