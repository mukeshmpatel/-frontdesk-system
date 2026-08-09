CREATE TABLE IF NOT EXISTS time_clock_credentials (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  user_email TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  pin_salt TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_by_email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(organization_id, user_email)
);

CREATE TABLE IF NOT EXISTS time_breaks (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  property_id TEXT,
  time_entry_id TEXT NOT NULL,
  user_email TEXT NOT NULL,
  break_type TEXT NOT NULL DEFAULT 'REST',
  started_at TEXT NOT NULL,
  ended_at TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS time_clock_credentials_scope_idx
  ON time_clock_credentials(organization_id, user_email);
CREATE INDEX IF NOT EXISTS time_breaks_entry_idx
  ON time_breaks(organization_id, time_entry_id, started_at);
