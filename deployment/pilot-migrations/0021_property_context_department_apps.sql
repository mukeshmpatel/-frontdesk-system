CREATE TABLE IF NOT EXISTS user_context_preferences (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  user_email TEXT NOT NULL,
  active_property_id TEXT NOT NULL,
  active_location_type TEXT,
  active_location_id TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE(organization_id,user_email)
);
CREATE INDEX IF NOT EXISTS user_context_property_idx
  ON user_context_preferences(organization_id,active_property_id,updated_at);
