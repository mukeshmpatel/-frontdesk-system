-- Protected Sample Lab storage is deployment-owned and immutable templates are seeded by the service.
CREATE TABLE IF NOT EXISTS sample_environment_templates (
  id TEXT PRIMARY KEY, version INTEGER NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL,
  snapshot_json TEXT NOT NULL, is_locked INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, CHECK(is_locked=1)
);
CREATE TABLE IF NOT EXISTS sample_environment_clones (
  id TEXT PRIMARY KEY, template_id TEXT NOT NULL, template_version INTEGER NOT NULL,
  organization_id TEXT NOT NULL, property_id TEXT NOT NULL, property_code TEXT NOT NULL,
  name TEXT NOT NULL, status TEXT NOT NULL, clone_summary_json TEXT NOT NULL,
  created_by TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sample_environment_audit (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, template_id TEXT NOT NULL,
  clone_id TEXT, event_type TEXT NOT NULL, actor_email TEXT NOT NULL,
  detail_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_agent_registry (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, property_id TEXT NOT NULL,
  agent_key TEXT NOT NULL, name TEXT NOT NULL, department TEXT NOT NULL, purpose TEXT NOT NULL,
  risk_level TEXT NOT NULL, status TEXT NOT NULL, tools_json TEXT NOT NULL,
  data_sources_json TEXT NOT NULL, approval_policy_json TEXT NOT NULL, template_source TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(organization_id, property_id, agent_key)
);
CREATE TABLE IF NOT EXISTS sample_social_accounts (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, property_id TEXT NOT NULL,
  platform TEXT NOT NULL, account_label TEXT NOT NULL, status TEXT NOT NULL,
  is_sandbox INTEGER NOT NULL DEFAULT 1, permissions_json TEXT NOT NULL,
  last_sync_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sample_report_facts (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, property_id TEXT NOT NULL,
  fact_type TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
  department TEXT, value REAL NOT NULL, unit TEXT NOT NULL, dimensions_json TEXT NOT NULL,
  occurred_at TEXT NOT NULL, source_link TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sample_environment_clone_scope_idx
  ON sample_environment_clones(organization_id, property_id, created_at);
CREATE INDEX IF NOT EXISTS sample_environment_audit_scope_idx
  ON sample_environment_audit(organization_id, clone_id, created_at);
CREATE INDEX IF NOT EXISTS ai_agent_registry_scope_idx
  ON ai_agent_registry(organization_id, property_id, department, status);
CREATE INDEX IF NOT EXISTS sample_social_scope_idx
  ON sample_social_accounts(organization_id, property_id, platform);
CREATE INDEX IF NOT EXISTS sample_report_fact_scope_idx
  ON sample_report_facts(organization_id, property_id, fact_type, occurred_at);
