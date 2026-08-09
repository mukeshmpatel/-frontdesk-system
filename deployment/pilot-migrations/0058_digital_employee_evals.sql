-- AAIQ Module 15: Digital Employee task verification.
-- Additive, property-scoped, and forward-only.
CREATE TABLE IF NOT EXISTS eval_cases (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  role_code TEXT NOT NULL,
  task_code TEXT NOT NULL,
  eval_type TEXT NOT NULL CHECK(eval_type IN ('DETERMINISTIC','JUDGED','HYBRID')),
  input_fixture_json TEXT NOT NULL,
  expected_outcome_json TEXT,
  judge_rubric TEXT,
  severity TEXT NOT NULL DEFAULT 'MAJOR' CHECK(severity IN ('CRITICAL','MAJOR','MINOR')),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(organization_id,property_id,role_code,task_code,id)
);

CREATE TABLE IF NOT EXISTS eval_runs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  eval_case_id TEXT NOT NULL,
  run_batch_id TEXT NOT NULL,
  de_output_json TEXT NOT NULL,
  passed INTEGER NOT NULL CHECK(passed IN (0,1)),
  score REAL,
  judge_reasoning TEXT,
  latency_ms INTEGER,
  model_version TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  executed_at TEXT NOT NULL,
  FOREIGN KEY(eval_case_id) REFERENCES eval_cases(id)
);

CREATE TABLE IF NOT EXISTS shadow_audits (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  role_code TEXT NOT NULL,
  task_code TEXT NOT NULL,
  live_action_ref TEXT NOT NULL,
  flagged INTEGER NOT NULL DEFAULT 0 CHECK(flagged IN (0,1)),
  flag_reason TEXT,
  reviewer_email TEXT,
  review_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(review_status IN ('PENDING','CONFIRMED','CLEARED')),
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(organization_id,property_id,live_action_ref)
);

CREATE INDEX IF NOT EXISTS idx_eval_cases_scope ON eval_cases(organization_id,property_id,role_code,active);
CREATE INDEX IF NOT EXISTS idx_eval_runs_batch ON eval_runs(organization_id,property_id,run_batch_id,executed_at);
CREATE INDEX IF NOT EXISTS idx_shadow_audits_queue ON shadow_audits(organization_id,property_id,review_status,flagged,created_at);

