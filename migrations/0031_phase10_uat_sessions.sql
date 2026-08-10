CREATE TABLE IF NOT EXISTS uat_role_sessions(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,property_id TEXT NOT NULL,user_email TEXT NOT NULL,role_key TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,issued_at TEXT NOT NULL,expires_at TEXT NOT NULL,revoked_at TEXT);
CREATE INDEX IF NOT EXISTS uat_role_session_scope_idx ON uat_role_sessions(organization_id,property_id,user_email,expires_at);
