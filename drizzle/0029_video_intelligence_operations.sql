-- AAIQ Video Intelligence operational depth.
-- Additive and property-scoped; existing audit, camera and check-in records remain unchanged.
CREATE TABLE IF NOT EXISTS video_job_events (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, property_id TEXT NOT NULL, audit_id TEXT NOT NULL,
  from_status TEXT, to_status TEXT NOT NULL, event_type TEXT NOT NULL, detail TEXT NOT NULL,
  actor_type TEXT NOT NULL, actor_id TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS video_job_event_scope_idx
  ON video_job_events(organization_id,property_id,audit_id,created_at);

CREATE TABLE IF NOT EXISTS video_evidence_checks (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, property_id TEXT NOT NULL, audit_id TEXT NOT NULL,
  check_type TEXT NOT NULL, zone_code TEXT NOT NULL, result TEXT NOT NULL, confidence REAL NOT NULL,
  explanation TEXT NOT NULL, remediation TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS video_evidence_check_scope_idx
  ON video_evidence_checks(organization_id,property_id,audit_id,created_at);

CREATE TABLE IF NOT EXISTS video_action_proposals (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, property_id TEXT NOT NULL, audit_id TEXT NOT NULL,
  finding_id TEXT, action_type TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL,
  priority TEXT NOT NULL, target_department TEXT NOT NULL, status TEXT NOT NULL, risk_level TEXT NOT NULL,
  approval_reason TEXT NOT NULL, operational_record_id TEXT, created_by TEXT NOT NULL, approved_by TEXT,
  approved_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS video_action_proposal_queue_idx
  ON video_action_proposals(organization_id,property_id,status,priority,created_at);

CREATE TABLE IF NOT EXISTS video_analysis_rules (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, property_id TEXT NOT NULL, audit_type TEXT NOT NULL,
  name TEXT NOT NULL, required_zones_json TEXT NOT NULL, minimum_confidence REAL NOT NULL,
  auto_action_policy TEXT NOT NULL, status TEXT NOT NULL, version INTEGER NOT NULL, created_by TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(organization_id,property_id,audit_type)
);
