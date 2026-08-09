-- AAIQ Module 16: Progressive autonomy and fail-safe escalation.
CREATE TABLE IF NOT EXISTS autonomy_config (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  role_code TEXT NOT NULL,
  task_code TEXT NOT NULL,
  permanent_exclusion INTEGER NOT NULL DEFAULT 0 CHECK(permanent_exclusion IN (0,1)),
  exclusion_reason TEXT,
  authority_ceiling REAL,
  ceiling_unit TEXT,
  confidence_threshold REAL NOT NULL DEFAULT 90 CHECK(confidence_threshold BETWEEN 0 AND 100),
  current_trust_score REAL NOT NULL DEFAULT 0 CHECK(current_trust_score BETWEEN 0 AND 100),
  autonomy_level TEXT NOT NULL DEFAULT 'ASSISTED' CHECK(autonomy_level IN ('NONE','ASSISTED','CEILING_BOUND','FULL')),
  minimum_sample_size INTEGER NOT NULL DEFAULT 50,
  minimum_window_days INTEGER NOT NULL DEFAULT 30,
  last_reviewed_at TEXT,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK((permanent_exclusion=0) OR (autonomy_level='NONE' AND authority_ceiling IS NULL)),
  UNIQUE(organization_id,property_id,role_code,task_code)
);

CREATE TABLE IF NOT EXISTS trust_ledger_entries (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  role_code TEXT NOT NULL,
  task_code TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('EVAL_RUN','SHADOW_AUDIT')),
  source_ref_id TEXT NOT NULL,
  outcome_score REAL NOT NULL CHECK(outcome_score BETWEEN 0 AND 100),
  window_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(organization_id,property_id,source,source_ref_id)
);

CREATE TABLE IF NOT EXISTS escalation_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  role_code TEXT NOT NULL,
  task_code TEXT NOT NULL,
  trigger_reason TEXT NOT NULL CHECK(trigger_reason IN ('CEILING_EXCEEDED','LOW_CONFIDENCE','PERMANENT_EXCLUSION','FIRST_OCCURRENCE','POLICY_REQUIRED')),
  de_proposed_action_json TEXT NOT NULL,
  escalated_to TEXT,
  resolution_json TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','APPROVED','REJECTED','CANCELLED')),
  resolved_by TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS autonomy_promotion_proposals (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  role_code TEXT NOT NULL,
  task_code TEXT NOT NULL,
  from_level TEXT NOT NULL,
  proposed_level TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED','EXPIRED')),
  proposed_at TEXT NOT NULL,
  decided_by TEXT,
  decided_at TEXT,
  UNIQUE(organization_id,property_id,role_code,task_code,status)
);

CREATE INDEX IF NOT EXISTS idx_autonomy_scope ON autonomy_config(organization_id,property_id,role_code,autonomy_level);
CREATE INDEX IF NOT EXISTS idx_trust_window ON trust_ledger_entries(organization_id,property_id,role_code,task_code,window_date);
CREATE INDEX IF NOT EXISTS idx_escalation_queue ON escalation_events(organization_id,property_id,status,created_at);

