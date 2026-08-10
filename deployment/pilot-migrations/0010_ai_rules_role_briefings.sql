CREATE TABLE IF NOT EXISTS ai_automation_rules (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  trigger_source TEXT NOT NULL,
  trigger_condition TEXT NOT NULL,
  action_type TEXT NOT NULL,
  target_department TEXT NOT NULL,
  minimum_confidence INTEGER NOT NULL DEFAULT 90,
  approval_mode TEXT NOT NULL DEFAULT 'REQUIRE_APPROVAL',
  urgency TEXT NOT NULL DEFAULT 'MEDIUM',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_by_email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(organization_id, name)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ai_automation_rules_trigger_idx
  ON ai_automation_rules(organization_id, trigger_source, enabled);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS briefing_policies (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  department TEXT NOT NULL,
  role_level TEXT NOT NULL,
  delivery_time TEXT NOT NULL DEFAULT '07:00',
  timezone TEXT NOT NULL DEFAULT 'America/Chicago',
  channels_json TEXT NOT NULL DEFAULT '["IN_APP"]',
  include_sections_json TEXT NOT NULL,
  hierarchy_rollup INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_by_email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS briefing_policies_scope_idx
  ON briefing_policies(organization_id, department, role_level);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS daily_briefings (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  department TEXT NOT NULL,
  role_level TEXT NOT NULL,
  briefing_date TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  sections_json TEXT NOT NULL,
  delivery_status TEXT NOT NULL DEFAULT 'READY',
  generated_at TEXT NOT NULL,
  acknowledged_at TEXT,
  UNIQUE(organization_id, recipient_email, briefing_date)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS daily_briefings_scope_idx
  ON daily_briefings(organization_id, department, briefing_date);
