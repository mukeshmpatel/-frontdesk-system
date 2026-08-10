CREATE TABLE IF NOT EXISTS inventory_count_sessions (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, property_id TEXT NOT NULL,
  department TEXT NOT NULL, storage_area TEXT NOT NULL, shift TEXT NOT NULL,
  count_type TEXT NOT NULL, status TEXT NOT NULL,
  completed_by TEXT NOT NULL, supervisor_email TEXT, notes TEXT NOT NULL DEFAULT '',
  attachment_reference TEXT, submitted_at TEXT NOT NULL, reviewed_by TEXT,
  reviewed_at TEXT, review_note TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS inventory_count_lines (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, session_id TEXT NOT NULL,
  sku TEXT NOT NULL, category TEXT NOT NULL, item_name TEXT NOT NULL, unit TEXT NOT NULL,
  full_quantity REAL NOT NULL DEFAULT 0, partial_quantity REAL NOT NULL DEFAULT 0,
  total_on_hand REAL NOT NULL DEFAULT 0, par_level REAL NOT NULL DEFAULT 0,
  needed_quantity REAL NOT NULL DEFAULT 0, order_quantity REAL NOT NULL DEFAULT 0,
  condition TEXT NOT NULL DEFAULT 'Good', storage_location TEXT NOT NULL DEFAULT '',
  expiration_or_inspection_date TEXT, unit_cost_cents INTEGER NOT NULL DEFAULT 0,
  inventory_value_cents INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal',
  comments TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL,
  UNIQUE(session_id, sku)
);
CREATE INDEX IF NOT EXISTS inventory_count_session_scope_idx ON inventory_count_sessions(organization_id,property_id,department,status,submitted_at);
CREATE INDEX IF NOT EXISTS inventory_count_line_session_idx ON inventory_count_lines(organization_id,session_id,priority,condition);
