-- Phase 11: Digital Employee Command Center.
-- Additive only. The canonical digital_employee_work_queue, role parity, RBAC,
-- policy, audit, connector, playbook and reporting systems remain authoritative.

CREATE TABLE IF NOT EXISTS digital_employee_shift_sessions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  role_key TEXT NOT NULL,
  agent_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN('OFF_SHIFT','ON_SHIFT','WORKING','IDLE','BLOCKED','AWAITING_APPROVAL','HANDED_TO_HUMAN','PAUSED')),
  current_work_queue_id TEXT,
  duties_total INTEGER NOT NULL DEFAULT 0 CHECK(duties_total>=0),
  duties_completed INTEGER NOT NULL DEFAULT 0 CHECK(duties_completed>=0),
  started_by TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE(organization_id,property_id,role_key,ended_at)
);

CREATE TABLE IF NOT EXISTS digital_employee_work_controls (
  work_queue_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  shift_session_id TEXT NOT NULL,
  role_key TEXT NOT NULL,
  agent_key TEXT NOT NULL,
  task_key TEXT NOT NULL,
  task_name TEXT NOT NULL,
  lifecycle_stage TEXT NOT NULL CHECK(lifecycle_stage IN('PERCEIVE','REASON','ACT','VERIFY','REPORT')),
  stage_index INTEGER NOT NULL DEFAULT 1 CHECK(stage_index BETWEEN 1 AND 5),
  step_number INTEGER NOT NULL DEFAULT 1 CHECK(step_number>=1),
  step_total INTEGER NOT NULL DEFAULT 5 CHECK(step_total>=1),
  state TEXT NOT NULL CHECK(state IN('WORKING','PAUSED','AWAITING_APPROVAL','HANDED_TO_HUMAN','BLOCKED','COMPLETED','FAILED')),
  current_step_text TEXT NOT NULL,
  reason_text TEXT NOT NULL,
  policy_reference TEXT,
  boundary_text TEXT,
  boundary_amount_cents INTEGER,
  boundary_limit_cents INTEGER,
  approval_case_id TEXT,
  checkpoint_json TEXT NOT NULL DEFAULT '{}',
  assigned_human_email TEXT,
  idempotency_key TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(organization_id,property_id,idempotency_key),
  FOREIGN KEY(work_queue_id) REFERENCES digital_employee_work_queue(id),
  FOREIGN KEY(shift_session_id) REFERENCES digital_employee_shift_sessions(id)
);

CREATE TABLE IF NOT EXISTS digital_employee_execution_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  work_queue_id TEXT NOT NULL,
  shift_session_id TEXT NOT NULL,
  role_key TEXT NOT NULL,
  agent_key TEXT NOT NULL,
  event_type TEXT NOT NULL,
  lifecycle_stage TEXT NOT NULL CHECK(lifecycle_stage IN('PERCEIVE','REASON','ACT','VERIFY','REPORT','CONTROL')),
  plain_language_step TEXT NOT NULL,
  reason_text TEXT NOT NULL,
  policy_reference TEXT,
  data_sources_json TEXT NOT NULL DEFAULT '[]',
  evidence_json TEXT NOT NULL DEFAULT '{}',
  boundary_json TEXT NOT NULL DEFAULT '{}',
  actor_type TEXT NOT NULL CHECK(actor_type IN('DIGITAL_EMPLOYEE','HUMAN','SYSTEM')),
  actor_id TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  FOREIGN KEY(work_queue_id) REFERENCES digital_employee_work_queue(id)
);

CREATE TABLE IF NOT EXISTS digital_employee_interventions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  work_queue_id TEXT NOT NULL,
  intervention_type TEXT NOT NULL CHECK(intervention_type IN('PAUSE','RESUME','TAKE_OVER','EDIT_REDIRECT','REASSIGN')),
  before_checkpoint_json TEXT NOT NULL,
  after_checkpoint_json TEXT NOT NULL,
  redirect_json TEXT NOT NULL DEFAULT '{}',
  reassigned_target_type TEXT,
  reassigned_target_id TEXT,
  reason TEXT,
  performed_by TEXT NOT NULL,
  performed_at TEXT NOT NULL,
  FOREIGN KEY(work_queue_id) REFERENCES digital_employee_work_queue(id)
);

CREATE TABLE IF NOT EXISTS digital_employee_role_knowledge (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  role_key TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK(source_type IN('SOP','POLICY','CHECKLIST','HISTORICAL_RECORD')),
  source_reference TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN('ACTIVE','MISSING_DOCUMENTATION','RETIRED')),
  version INTEGER NOT NULL DEFAULT 1,
  approved_by TEXT,
  approved_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(organization_id,property_id,role_key,source_reference,version)
);

CREATE TABLE IF NOT EXISTS digital_employee_correction_signals (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  work_queue_id TEXT NOT NULL,
  role_key TEXT NOT NULL,
  task_key TEXT NOT NULL,
  signal_type TEXT NOT NULL CHECK(signal_type IN('TAKE_OVER','EDIT_REDIRECT','REJECTED','ESCALATED','VERIFICATION_FAILURE')),
  signal_summary TEXT NOT NULL,
  pattern_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN('OPEN','REVIEWED','PROPOSAL_CREATED','INTENTIONAL_EXCEPTION')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reviewed_at TEXT,
  FOREIGN KEY(work_queue_id) REFERENCES digital_employee_work_queue(id)
);

CREATE TABLE IF NOT EXISTS digital_employee_playbook_proposals (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  role_key TEXT NOT NULL,
  task_key TEXT NOT NULL,
  capability_id TEXT,
  source_pattern_key TEXT NOT NULL,
  proposed_change_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN('DRAFT','PENDING_APPROVAL','APPROVED','REJECTED','LIVE')),
  proposed_by TEXT NOT NULL,
  proposed_at TEXT NOT NULL,
  decided_by TEXT,
  decided_at TEXT,
  live_version INTEGER,
  UNIQUE(organization_id,property_id,role_key,task_key,source_pattern_key,status)
);

CREATE TABLE IF NOT EXISTS digital_employee_task_confidence (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  role_key TEXT NOT NULL,
  task_key TEXT NOT NULL,
  successful_verified_runs INTEGER NOT NULL DEFAULT 0,
  corrected_runs INTEGER NOT NULL DEFAULT 0,
  approved_runs INTEGER NOT NULL DEFAULT 0,
  rejected_runs INTEGER NOT NULL DEFAULT 0,
  evaluation_pass_rate REAL NOT NULL DEFAULT 0 CHECK(evaluation_pass_rate BETWEEN 0 AND 1),
  confidence_score REAL NOT NULL DEFAULT 0 CHECK(confidence_score BETWEEN 0 AND 1),
  escalation_threshold REAL NOT NULL DEFAULT 0.75 CHECK(escalation_threshold BETWEEN 0 AND 1),
  auto_escalate INTEGER NOT NULL DEFAULT 1 CHECK(auto_escalate IN(0,1)),
  calculated_at TEXT NOT NULL,
  UNIQUE(organization_id,property_id,role_key,task_key)
);

CREATE INDEX IF NOT EXISTS idx_de_shift_roster ON digital_employee_shift_sessions(organization_id,property_id,state,updated_at);
CREATE INDEX IF NOT EXISTS idx_de_work_control_state ON digital_employee_work_controls(organization_id,property_id,role_key,state,updated_at);
CREATE INDEX IF NOT EXISTS idx_de_execution_stream ON digital_employee_execution_events(organization_id,property_id,work_queue_id,occurred_at);
CREATE INDEX IF NOT EXISTS idx_de_intervention_work ON digital_employee_interventions(organization_id,property_id,work_queue_id,performed_at);
CREATE INDEX IF NOT EXISTS idx_de_correction_review ON digital_employee_correction_signals(organization_id,property_id,role_key,status,created_at);
CREATE INDEX IF NOT EXISTS idx_de_confidence_role ON digital_employee_task_confidence(organization_id,property_id,role_key,confidence_score);
