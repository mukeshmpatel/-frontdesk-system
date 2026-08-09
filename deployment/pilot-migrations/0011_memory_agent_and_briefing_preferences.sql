CREATE TABLE IF NOT EXISTS briefing_preferences (
  organization_id TEXT NOT NULL,
  user_email TEXT NOT NULL,
  timing_mode TEXT NOT NULL DEFAULT 'SHIFT_OFFSET',
  shift_offset_minutes INTEGER NOT NULL DEFAULT 15,
  fixed_time TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/Chicago',
  summary_only INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  UNIQUE(organization_id,user_email)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agent_memories (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_account TEXT NOT NULL DEFAULT '',
  source_record_id TEXT,
  occurred_at TEXT NOT NULL,
  retention_until TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS agent_memories_recall_idx ON agent_memories(organization_id,owner_email,occurred_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS agent_memories_source_idx ON agent_memories(organization_id,source_type,source_account);
