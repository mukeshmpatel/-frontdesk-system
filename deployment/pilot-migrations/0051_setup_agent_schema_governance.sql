-- Setup Agent plans are durable and deployment-owned; requests never create their own table.
CREATE TABLE IF NOT EXISTS ai_setup_sessions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  input_mode TEXT NOT NULL,
  instruction TEXT NOT NULL,
  setup_type TEXT NOT NULL,
  status TEXT NOT NULL,
  plan_json TEXT NOT NULL,
  questions_json TEXT NOT NULL,
  assumptions_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  approved_at TEXT,
  executed_at TEXT
);
CREATE INDEX IF NOT EXISTS ai_setup_sessions_scope_idx
  ON ai_setup_sessions(organization_id, actor_email, status, created_at);
