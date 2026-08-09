CREATE TABLE IF NOT EXISTS property_access_policies (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, property_id TEXT NOT NULL,
  enabled INTEGER NOT NULL, require_geofence INTEGER NOT NULL, require_trusted_ip INTEGER NOT NULL,
  latitude REAL, longitude REAL, radius_meters INTEGER NOT NULL DEFAULT 750,
  trusted_ipv4_cidrs_json TEXT NOT NULL, session_minutes INTEGER NOT NULL DEFAULT 480,
  updated_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(organization_id, property_id)
);
CREATE TABLE IF NOT EXISTS access_boundary_events (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, property_id TEXT, user_email TEXT NOT NULL,
  event_type TEXT NOT NULL, decision TEXT NOT NULL, ip_address TEXT, latitude REAL, longitude REAL,
  distance_meters REAL, reason TEXT NOT NULL, request_path TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS access_boundary_event_idx
  ON access_boundary_events(organization_id, property_id, user_email, created_at);

CREATE TABLE IF NOT EXISTS governed_integrations (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, provider_key TEXT NOT NULL,
  display_name TEXT NOT NULL, capability TEXT NOT NULL, license TEXT NOT NULL,
  endpoint TEXT, credential_reference TEXT, status TEXT NOT NULL, enabled INTEGER NOT NULL,
  approval_mode TEXT NOT NULL, last_health_status TEXT, last_health_message TEXT,
  last_health_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(organization_id, provider_key)
);
CREATE TABLE IF NOT EXISTS integration_credentials (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, provider_key TEXT NOT NULL,
  field_key TEXT NOT NULL, ciphertext TEXT NOT NULL, iv TEXT NOT NULL, last_four TEXT NOT NULL,
  updated_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(organization_id, provider_key, field_key)
);
CREATE TABLE IF NOT EXISTS integration_runs (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, property_id TEXT,
  provider_key TEXT NOT NULL, run_type TEXT NOT NULL, status TEXT NOT NULL,
  initiated_by TEXT NOT NULL, input_json TEXT NOT NULL, output_json TEXT NOT NULL,
  approval_status TEXT NOT NULL, latency_ms INTEGER NOT NULL, error_message TEXT,
  created_at TEXT NOT NULL, completed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS integration_run_scope_idx
  ON integration_runs(organization_id, property_id, provider_key, created_at);

CREATE TABLE IF NOT EXISTS organizational_memory_records (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, property_id TEXT NOT NULL,
  department TEXT, source_type TEXT NOT NULL, source_id TEXT NOT NULL, source_link TEXT,
  source_timestamp TEXT NOT NULL, summary TEXT NOT NULL, facts_json TEXT NOT NULL,
  confidence REAL NOT NULL, sensitivity TEXT NOT NULL, retention_until TEXT,
  legal_hold INTEGER NOT NULL, superseded_by TEXT, contradictions_json TEXT NOT NULL,
  qdrant_point_id TEXT, index_status TEXT NOT NULL, created_by TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(organization_id, property_id, source_type, source_id)
);
CREATE INDEX IF NOT EXISTS memory_scope_idx
  ON organizational_memory_records(organization_id, property_id, source_timestamp);

CREATE TABLE IF NOT EXISTS social_publication_requests (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, property_id TEXT NOT NULL,
  title TEXT NOT NULL, content_json TEXT NOT NULL, channels_json TEXT NOT NULL,
  status TEXT NOT NULL, approval_required INTEGER NOT NULL, approved_by TEXT,
  external_publication_json TEXT, created_by TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
