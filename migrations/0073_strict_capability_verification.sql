-- Batch 3 corrective baseline: truthful capability status and durable workflow proof.
-- This migration is additive and forward-only. It does not certify any capability.
CREATE TABLE IF NOT EXISTS capability_ledger (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  item_key TEXT NOT NULL,
  item_name TEXT NOT NULL,
  item_type TEXT NOT NULL CHECK(item_type IN ('module','button','digital_employee_duty','integration','report')),
  owning_module TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('working_verified','working_incomplete','simulated','ui_shell','broken','blocked_credentials')),
  last_verified_at TEXT,
  evidence_artifact_path TEXT,
  known_gap_description TEXT,
  reviewed_by TEXT,
  source_path TEXT,
  baseline_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(organization_id,item_key),
  CHECK(status!='working_verified' OR (
    reviewed_by IS NOT NULL AND length(trim(reviewed_by))>0 AND
    last_verified_at IS NOT NULL AND
    evidence_artifact_path IS NOT NULL AND length(trim(evidence_artifact_path))>0
  ))
);

CREATE TABLE IF NOT EXISTS workflow_verification_runs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  property_id TEXT,
  workflow_key TEXT NOT NULL,
  trigger_description TEXT NOT NULL,
  source_data_snapshot_json TEXT NOT NULL,
  decision_output TEXT NOT NULL,
  action_taken TEXT NOT NULL,
  before_state_json TEXT NOT NULL,
  after_state_json TEXT NOT NULL,
  verification_method TEXT NOT NULL,
  verification_result TEXT NOT NULL CHECK(verification_result IN ('pass','fail')),
  failure_case_tested INTEGER NOT NULL DEFAULT 0 CHECK(failure_case_tested IN (0,1)),
  failure_behavior_observed TEXT,
  audit_evidence_url TEXT NOT NULL,
  run_at TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  CHECK(failure_case_tested=0 OR (failure_behavior_observed IS NOT NULL AND length(trim(failure_behavior_observed))>0))
);

-- The existing digital_employee_authority_definitions table remains the policy catalog.
-- This table is the executable runtime contract and never competes with that catalog.
CREATE TABLE IF NOT EXISTS digital_employee_duties (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  authority_definition_id TEXT,
  role_key TEXT NOT NULL,
  duty_key TEXT NOT NULL,
  duty_name TEXT NOT NULL,
  trigger_type TEXT NOT NULL CHECK(trigger_type IN ('event','schedule','manual')),
  trigger_definition TEXT NOT NULL,
  data_sources_json TEXT NOT NULL,
  decision_logic_description TEXT NOT NULL,
  tool_or_action_used TEXT NOT NULL,
  verification_method TEXT NOT NULL,
  confidence_threshold REAL CHECK(confidence_threshold IS NULL OR (confidence_threshold>=0 AND confidence_threshold<=1)),
  retry_policy TEXT NOT NULL,
  escalation_condition TEXT NOT NULL,
  escalation_target TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ui_shell' CHECK(status IN ('working_verified','working_incomplete','simulated','ui_shell','broken','blocked_credentials')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(organization_id,role_key,duty_key),
  FOREIGN KEY(authority_definition_id) REFERENCES digital_employee_authority_definitions(id)
);

CREATE TABLE IF NOT EXISTS digital_employee_work_queue (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  property_id TEXT,
  duty_id TEXT NOT NULL,
  item_reference TEXT NOT NULL,
  trigger_snapshot_json TEXT NOT NULL,
  decision_output TEXT,
  action_output_json TEXT,
  verification_output_json TEXT,
  audit_evidence_url TEXT,
  queued_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  outcome TEXT CHECK(outcome IS NULL OR outcome IN ('completed','failed','escalated','retrying')),
  retry_count INTEGER NOT NULL DEFAULT 0 CHECK(retry_count>=0),
  confidence_score REAL CHECK(confidence_score IS NULL OR (confidence_score>=0 AND confidence_score<=1)),
  FOREIGN KEY(duty_id) REFERENCES digital_employee_duties(id)
);

CREATE INDEX IF NOT EXISTS idx_capability_ledger_status ON capability_ledger(organization_id,item_type,status,owning_module);
CREATE INDEX IF NOT EXISTS idx_workflow_verification_scope ON workflow_verification_runs(organization_id,workflow_key,run_at);
CREATE INDEX IF NOT EXISTS idx_digital_employee_duty_role ON digital_employee_duties(organization_id,role_key,status);
CREATE INDEX IF NOT EXISTS idx_digital_employee_work_queue_scope ON digital_employee_work_queue(organization_id,property_id,outcome,queued_at);
