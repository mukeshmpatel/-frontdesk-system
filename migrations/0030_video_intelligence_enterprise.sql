CREATE TABLE IF NOT EXISTS video_edge_nodes(
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, property_id TEXT NOT NULL, name TEXT NOT NULL,
  location_label TEXT NOT NULL, status TEXT NOT NULL, software_version TEXT, capabilities_json TEXT NOT NULL,
  last_heartbeat_at TEXT, last_error TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS video_inventory_observations(
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, property_id TEXT NOT NULL, audit_id TEXT,
  location_label TEXT NOT NULL, item_sku TEXT NOT NULL, item_name TEXT NOT NULL, observation_type TEXT NOT NULL,
  observed_quantity REAL NOT NULL, unit TEXT NOT NULL, calibration_method TEXT, uncertainty REAL NOT NULL,
  duplicate_key TEXT NOT NULL, status TEXT NOT NULL, ledger_quantity REAL, variance REAL, human_decision TEXT,
  human_note TEXT, reviewed_by TEXT, reviewed_at TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS video_evidence_objects(
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, property_id TEXT NOT NULL, audit_id TEXT NOT NULL,
  object_key TEXT NOT NULL, sha256 TEXT, media_type TEXT NOT NULL, privacy_derivative_key TEXT,
  faces_blurred INTEGER NOT NULL, plates_blurred INTEGER NOT NULL, audio_removed INTEGER NOT NULL,
  retention_class TEXT NOT NULL, retention_until TEXT NOT NULL, legal_hold INTEGER NOT NULL DEFAULT 0,
  custody_status TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS video_review_events(
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, property_id TEXT NOT NULL, entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL, decision TEXT NOT NULL, reason TEXT NOT NULL, actor_id TEXT NOT NULL, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS identity_verification_cases(
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, property_id TEXT NOT NULL, subject_type TEXT NOT NULL,
  subject_reference TEXT NOT NULL, purpose TEXT NOT NULL, status TEXT NOT NULL, consent_status TEXT NOT NULL,
  verification_method TEXT NOT NULL, liveness_status TEXT NOT NULL, match_mode TEXT NOT NULL,
  confidence REAL, alternative_method TEXT NOT NULL, template_storage TEXT NOT NULL, expires_at TEXT,
  human_note TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS express_checkin_steps(
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, property_id TEXT NOT NULL, session_id TEXT NOT NULL,
  step_code TEXT NOT NULL, step_order INTEGER NOT NULL, status TEXT NOT NULL, idempotency_key TEXT NOT NULL,
  provider_type TEXT, detail TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, last_attempt_at TEXT,
  completed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(organization_id,property_id,session_id,step_code)
);

CREATE TABLE IF NOT EXISTS video_model_metrics(
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, property_id TEXT NOT NULL, capability TEXT NOT NULL,
  model_version TEXT NOT NULL, sample_count INTEGER NOT NULL, precision_score REAL, recall_score REAL,
  false_positive_rate REAL, drift_status TEXT NOT NULL, evaluation_period TEXT NOT NULL,
  approved_for_advisory INTEGER NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS video_inventory_scope_idx ON video_inventory_observations(organization_id,property_id,status,created_at);
CREATE UNIQUE INDEX IF NOT EXISTS video_inventory_duplicate_idx ON video_inventory_observations(organization_id,property_id,duplicate_key);
CREATE INDEX IF NOT EXISTS identity_verification_scope_idx ON identity_verification_cases(organization_id,property_id,status,created_at);
CREATE INDEX IF NOT EXISTS video_evidence_scope_idx ON video_evidence_objects(organization_id,property_id,audit_id,created_at);
