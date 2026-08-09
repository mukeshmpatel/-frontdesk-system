-- Batch 4: one canonical property workspace, runnable Digital Employee conversations,
-- and governed media-to-inventory proposals. All changes are additive and forward-only.

CREATE TABLE IF NOT EXISTS canonical_workspace_profiles (
  organization_id TEXT PRIMARY KEY,
  canonical_property_id TEXT NOT NULL,
  workspace_mode TEXT NOT NULL DEFAULT 'SAMPLE' CHECK(workspace_mode IN ('SAMPLE','LIVE')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','SUSPENDED')),
  archived_property_ids_json TEXT NOT NULL DEFAULT '[]',
  activated_by TEXT NOT NULL,
  activated_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS canonical_workspace_property_idx
  ON canonical_workspace_profiles(canonical_property_id,status);

CREATE TABLE IF NOT EXISTS digital_employee_command_sessions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  agent_registry_id TEXT NOT NULL,
  agent_key TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','WAITING_FOR_HUMAN','CLOSED')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS digital_employee_command_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  sender_type TEXT NOT NULL CHECK(sender_type IN ('USER','DIGITAL_EMPLOYEE','SYSTEM')),
  input_mode TEXT NOT NULL DEFAULT 'TEXT' CHECK(input_mode IN ('TEXT','VOICE_TRANSCRIPT','SYSTEM')),
  body TEXT NOT NULL,
  run_id TEXT,
  outcome_type TEXT NOT NULL DEFAULT 'MESSAGE' CHECK(outcome_type IN ('MESSAGE','COMPLETED','APPROVAL_REQUIRED','HUMAN_REQUIRED','FAILED')),
  evidence_json TEXT NOT NULL DEFAULT '[]',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES digital_employee_command_sessions(id)
);
CREATE INDEX IF NOT EXISTS digital_employee_session_scope_idx
  ON digital_employee_command_sessions(organization_id,property_id,agent_key,updated_at);
CREATE INDEX IF NOT EXISTS digital_employee_message_session_idx
  ON digital_employee_command_messages(session_id,created_at);

CREATE TABLE IF NOT EXISTS video_inventory_detection_items (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  audit_id TEXT NOT NULL,
  evidence_object_id TEXT,
  inventory_observation_id TEXT,
  detected_label TEXT NOT NULL,
  proposed_sku TEXT,
  proposed_quantity REAL NOT NULL CHECK(proposed_quantity>=0),
  unit TEXT NOT NULL,
  confidence REAL NOT NULL CHECK(confidence>=0 AND confidence<=1),
  evidence_timestamp_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'NEEDS_REVIEW' CHECK(status IN ('NEEDS_REVIEW','CONFIRMED','REJECTED','RECOUNT_REQUIRED')),
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS video_inventory_detection_scope_idx
  ON video_inventory_detection_items(organization_id,property_id,status,created_at);
CREATE INDEX IF NOT EXISTS video_inventory_detection_audit_idx
  ON video_inventory_detection_items(audit_id,evidence_timestamp_ms);

