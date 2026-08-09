CREATE TABLE IF NOT EXISTS pilot_launch_tasks (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  rollout_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  stage_key TEXT NOT NULL,
  task_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'NOT_STARTED' CHECK(status IN('NOT_STARTED','IN_PROGRESS','READY','BLOCKED','WAIVED')),
  owner_email TEXT,
  note TEXT NOT NULL DEFAULT '',
  evidence_json TEXT NOT NULL DEFAULT '{}',
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(organization_id,rollout_id,property_id,task_key)
);
CREATE TABLE IF NOT EXISTS pilot_launch_policies (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  rollout_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  quiet_hours_start TEXT NOT NULL DEFAULT '21:00',
  quiet_hours_end TEXT NOT NULL DEFAULT '08:00',
  escalation_name TEXT NOT NULL DEFAULT '',
  escalation_phone TEXT NOT NULL DEFAULT '',
  retention_days INTEGER NOT NULL DEFAULT 30 CHECK(retention_days BETWEEN 1 AND 3650),
  public_response_approval INTEGER NOT NULL DEFAULT 1 CHECK(public_response_approval IN(0,1)),
  financial_actions_enabled INTEGER NOT NULL DEFAULT 0 CHECK(financial_actions_enabled=0),
  guest_actions_enabled INTEGER NOT NULL DEFAULT 0 CHECK(guest_actions_enabled IN(0,1)),
  approved_by TEXT,
  approved_at TEXT,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(organization_id,rollout_id,property_id)
);
CREATE TABLE IF NOT EXISTS pilot_uat_evidence (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  rollout_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  role_key TEXT NOT NULL,
  scenario_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN('PASS','FAIL','BLOCKED')),
  result_note TEXT NOT NULL,
  tested_by TEXT NOT NULL,
  tested_at TEXT NOT NULL,
  UNIQUE(organization_id,rollout_id,property_id,role_key,scenario_key)
);
CREATE INDEX IF NOT EXISTS pilot_launch_task_scope_idx ON pilot_launch_tasks(organization_id,rollout_id,property_id,stage_key,status);
CREATE INDEX IF NOT EXISTS pilot_uat_evidence_scope_idx ON pilot_uat_evidence(organization_id,rollout_id,property_id,role_key,status);
