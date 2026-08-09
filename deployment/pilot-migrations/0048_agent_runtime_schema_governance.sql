-- Agent Studio schema is deployment-owned. Runtime requests must never create it.
CREATE TABLE IF NOT EXISTS ai_runtime_agent_registry (
 id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,agent_key TEXT NOT NULL,name TEXT NOT NULL,
 purpose TEXT NOT NULL,department TEXT NOT NULL,risk_level TEXT NOT NULL,permitted_tools_json TEXT NOT NULL,
 prohibited_actions_json TEXT NOT NULL,model TEXT NOT NULL,prompt_version TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,
 status TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(organization_id,agent_key));

CREATE TABLE IF NOT EXISTS ai_agent_runs (
 id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,property_id TEXT NOT NULL,agent_id TEXT NOT NULL,
 initiated_by TEXT NOT NULL,intent TEXT NOT NULL,status TEXT NOT NULL,risk_level TEXT NOT NULL,confidence REAL,
 sources_json TEXT NOT NULL,evidence_json TEXT NOT NULL,plan_json TEXT NOT NULL,output_json TEXT,
 missing_information_json TEXT NOT NULL,approval_status TEXT NOT NULL,model TEXT NOT NULL,prompt_version TEXT NOT NULL,
 cost_micros INTEGER NOT NULL DEFAULT 0,latency_ms INTEGER NOT NULL DEFAULT 0,error_message TEXT,
 created_at TEXT NOT NULL,completed_at TEXT);

CREATE TABLE IF NOT EXISTS ai_agent_tool_calls (
 id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,property_id TEXT NOT NULL,run_id TEXT NOT NULL,
 tool_name TEXT NOT NULL,input_json TEXT NOT NULL,output_json TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS ai_approval_cases (
 id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,property_id TEXT NOT NULL,run_id TEXT NOT NULL,
 action_type TEXT NOT NULL,risk_level TEXT NOT NULL,status TEXT NOT NULL,requested_by TEXT NOT NULL,
 assigned_role TEXT NOT NULL,reason TEXT NOT NULL,decision_by TEXT,decision_reason TEXT,created_at TEXT NOT NULL,decided_at TEXT);

CREATE TABLE IF NOT EXISTS ai_manual_fallback_cases (
 id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,property_id TEXT NOT NULL,run_id TEXT NOT NULL,
 exception_state TEXT NOT NULL,severity TEXT NOT NULL,owner_role TEXT NOT NULL,original_request TEXT NOT NULL,
 extracted_data_json TEXT NOT NULL,missing_fields_json TEXT NOT NULL,recommended_action TEXT NOT NULL,
 status TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS digital_employee_policies (
 id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,agent_key TEXT NOT NULL,autonomy_budget_limit REAL NOT NULL,
 hitl_threshold_usd REAL NOT NULL,tool_permissions_json TEXT NOT NULL,status TEXT NOT NULL,updated_by TEXT NOT NULL,
 created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(organization_id,agent_key));

CREATE TABLE IF NOT EXISTS ai_agent_action_log (
 id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,property_id TEXT NOT NULL,agent_id TEXT NOT NULL,
 context_trigger TEXT NOT NULL,tool_called TEXT NOT NULL,params_json TEXT NOT NULL,result_json TEXT NOT NULL,
 risk_level TEXT NOT NULL,amount_usd REAL NOT NULL,status TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS digital_system_capabilities (
 id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,property_id TEXT NOT NULL,system_type TEXT NOT NULL,
 system_name TEXT NOT NULL,capability_key TEXT NOT NULL,workflow_json TEXT NOT NULL,required_fields_json TEXT NOT NULL,
 physical_handoffs_json TEXT NOT NULL,risk_level TEXT NOT NULL,status TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,
 created_by TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
 UNIQUE(organization_id,property_id,system_name,capability_key));

CREATE TABLE IF NOT EXISTS digital_employee_handoffs (
 id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,property_id TEXT NOT NULL,agent_key TEXT NOT NULL,
 capability_key TEXT NOT NULL,title TEXT NOT NULL,instructions TEXT NOT NULL,assigned_role TEXT NOT NULL,
 status TEXT NOT NULL,source_run_id TEXT,created_by TEXT NOT NULL,created_at TEXT NOT NULL,completed_at TEXT);

CREATE INDEX IF NOT EXISTS ai_agent_run_scope_idx ON ai_agent_runs(organization_id,property_id,created_at);
CREATE INDEX IF NOT EXISTS ai_agent_exception_scope_idx ON ai_manual_fallback_cases(organization_id,property_id,status,created_at);
CREATE INDEX IF NOT EXISTS ai_agent_action_scope_idx ON ai_agent_action_log(organization_id,property_id,created_at);
