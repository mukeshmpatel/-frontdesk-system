CREATE TABLE IF NOT EXISTS communication_delivery_attempts (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, property_id TEXT NOT NULL,
  thread_id TEXT NOT NULL, draft_id TEXT NOT NULL,
  requested_source_key TEXT NOT NULL, requested_source_account TEXT NOT NULL,
  original_source_key TEXT NOT NULL, original_source_account TEXT NOT NULL,
  override_reason TEXT, status TEXT NOT NULL, external_delivery_id TEXT,
  error_message TEXT, attempted_by TEXT NOT NULL, attempted_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS communication_delivery_thread_idx
  ON communication_delivery_attempts(organization_id,property_id,thread_id,attempted_at);

CREATE TABLE IF NOT EXISTS digital_employee_policies (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, agent_key TEXT NOT NULL,
  autonomy_budget_limit REAL NOT NULL, hitl_threshold_usd REAL NOT NULL,
  tool_permissions_json TEXT NOT NULL, status TEXT NOT NULL, updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(organization_id,agent_key)
);

CREATE TABLE IF NOT EXISTS ai_agent_action_log (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, property_id TEXT NOT NULL,
  agent_id TEXT NOT NULL, context_trigger TEXT NOT NULL, tool_called TEXT NOT NULL,
  params_json TEXT NOT NULL, result_json TEXT NOT NULL, risk_level TEXT NOT NULL,
  amount_usd REAL NOT NULL, status TEXT NOT NULL, created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_agent_action_scope_idx
  ON ai_agent_action_log(organization_id,property_id,created_at);

CREATE TABLE IF NOT EXISTS digital_system_capabilities (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, property_id TEXT NOT NULL,
  system_type TEXT NOT NULL, system_name TEXT NOT NULL, capability_key TEXT NOT NULL,
  workflow_json TEXT NOT NULL, required_fields_json TEXT NOT NULL,
  physical_handoffs_json TEXT NOT NULL, risk_level TEXT NOT NULL, status TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1, created_by TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(organization_id,property_id,system_name,capability_key)
);

CREATE TABLE IF NOT EXISTS digital_employee_handoffs (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, property_id TEXT NOT NULL,
  agent_key TEXT NOT NULL, capability_key TEXT NOT NULL, title TEXT NOT NULL,
  instructions TEXT NOT NULL, assigned_role TEXT NOT NULL, status TEXT NOT NULL,
  source_run_id TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL, completed_at TEXT
);
