-- Autonomous QA evidence is migration-owned and retained across deployments.
CREATE TABLE IF NOT EXISTS autonomous_qa_runs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  status TEXT NOT NULL,
  score INTEGER NOT NULL,
  summary_json TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS autonomous_qa_checks (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  suite TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  severity TEXT NOT NULL,
  evidence TEXT NOT NULL,
  recommendation TEXT,
  route TEXT,
  latency_ms INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS autonomous_qa_runs_scope_idx
  ON autonomous_qa_runs(organization_id, property_id, completed_at);
CREATE INDEX IF NOT EXISTS autonomous_qa_checks_run_idx
  ON autonomous_qa_checks(run_id, status);
