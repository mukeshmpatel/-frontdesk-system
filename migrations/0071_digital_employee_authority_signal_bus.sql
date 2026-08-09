-- Release 125: one governed Digital Employee authority catalog and shared external signal bus.
CREATE TABLE IF NOT EXISTS digital_employee_authority_definitions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  role_key TEXT NOT NULL,
  capability_key TEXT NOT NULL,
  description TEXT NOT NULL,
  autonomy_level TEXT NOT NULL CHECK(autonomy_level IN ('AUTONOMOUS','PROPOSE_ONLY','HUMAN_REQUIRED')),
  reversible INTEGER NOT NULL DEFAULT 1 CHECK(reversible IN (0,1)),
  required_signal_topics_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','PAUSED','RETIRED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(NOT(reversible=0 AND autonomy_level='AUTONOMOUS')),
  UNIQUE(organization_id,role_key,capability_key)
);

CREATE TABLE IF NOT EXISTS digital_employee_authority_actions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  authority_definition_id TEXT NOT NULL,
  digital_employee_key TEXT NOT NULL,
  action_summary TEXT NOT NULL,
  autonomy_level_applied TEXT NOT NULL CHECK(autonomy_level_applied IN ('AUTONOMOUS','PROPOSE_ONLY','HUMAN_REQUIRED')),
  outcome TEXT NOT NULL CHECK(outcome IN ('COMPLETED','PENDING_APPROVAL','REJECTED','ESCALATED','FAILED')),
  approved_by TEXT,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY(authority_definition_id) REFERENCES digital_employee_authority_definitions(id)
);

CREATE TABLE IF NOT EXISTS external_signal_topics (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  topic_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  source_connector TEXT NOT NULL,
  refresh_cadence_minutes INTEGER NOT NULL DEFAULT 60 CHECK(refresh_cadence_minutes>=1),
  freshness_limit_minutes INTEGER NOT NULL DEFAULT 180 CHECK(freshness_limit_minutes>=1),
  status TEXT NOT NULL DEFAULT 'CONFIGURATION_REQUIRED' CHECK(status IN ('LIVE','DEGRADED','CONFIGURATION_REQUIRED','PAUSED')),
  last_published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(organization_id,topic_key)
);

CREATE TABLE IF NOT EXISTS external_signal_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  topic_id TEXT NOT NULL,
  effective_at TEXT NOT NULL,
  expires_at TEXT,
  payload_json TEXT NOT NULL,
  source_reference TEXT NOT NULL,
  confidence REAL CHECK(confidence IS NULL OR (confidence>=0 AND confidence<=1)),
  synthetic INTEGER NOT NULL DEFAULT 0 CHECK(synthetic IN (0,1)),
  published_at TEXT NOT NULL,
  FOREIGN KEY(topic_id) REFERENCES external_signal_topics(id)
);

CREATE TABLE IF NOT EXISTS external_signal_subscriptions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  role_key TEXT NOT NULL,
  topic_id TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  subscribed_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(topic_id) REFERENCES external_signal_topics(id),
  UNIQUE(organization_id,role_key,topic_id)
);

CREATE INDEX IF NOT EXISTS idx_authority_role ON digital_employee_authority_definitions(organization_id,role_key,autonomy_level,status);
CREATE INDEX IF NOT EXISTS idx_authority_actions_scope ON digital_employee_authority_actions(organization_id,property_id,digital_employee_key,created_at);
CREATE INDEX IF NOT EXISTS idx_signal_events_scope ON external_signal_events(organization_id,property_id,topic_id,effective_at);
CREATE INDEX IF NOT EXISTS idx_signal_subscriptions_role ON external_signal_subscriptions(organization_id,role_key,active);

