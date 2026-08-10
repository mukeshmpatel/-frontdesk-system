-- Batch 3 Workflow 5: connect Module 15 definitions to durable batch and shadow-review operations.
CREATE TABLE IF NOT EXISTS eval_batches (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  role_code TEXT NOT NULL,
  source_catalog_version TEXT NOT NULL,
  model_version TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  baseline_batch_id TEXT,
  status TEXT NOT NULL CHECK(status IN ('RUNNING','PASSED','REVIEW_REQUIRED','BLOCKED','FAILED')),
  deployment_gate TEXT NOT NULL CHECK(deployment_gate IN ('PENDING','PASS','REVIEW_REQUIRED','BLOCKED')),
  review_decision TEXT NOT NULL DEFAULT 'PENDING' CHECK(review_decision IN ('PENDING','APPROVED','REJECTED')),
  total_cases INTEGER NOT NULL DEFAULT 0 CHECK(total_cases>=0),
  passed_cases INTEGER NOT NULL DEFAULT 0 CHECK(passed_cases>=0),
  failed_cases INTEGER NOT NULL DEFAULT 0 CHECK(failed_cases>=0),
  critical_failures INTEGER NOT NULL DEFAULT 0 CHECK(critical_failures>=0),
  major_failures INTEGER NOT NULL DEFAULT 0 CHECK(major_failures>=0),
  regressions INTEGER NOT NULL DEFAULT 0 CHECK(regressions>=0),
  summary_json TEXT NOT NULL DEFAULT '{}',
  correlation_id TEXT NOT NULL,
  started_by TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_reason TEXT,
  FOREIGN KEY(baseline_batch_id) REFERENCES eval_batches(id),
  CHECK(review_decision!='APPROVED' OR reviewed_by IS NOT NULL),
  CHECK(deployment_gate!='BLOCKED' OR review_decision!='APPROVED')
);

CREATE TABLE IF NOT EXISTS quality_shadow_classifications (
  shadow_audit_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  severity TEXT NOT NULL CHECK(severity IN ('CRITICAL','MAJOR','MINOR','INFO')),
  source_outcome TEXT,
  missing_verification INTEGER NOT NULL DEFAULT 0 CHECK(missing_verification IN (0,1)),
  missing_audit_evidence INTEGER NOT NULL DEFAULT 0 CHECK(missing_audit_evidence IN (0,1)),
  low_confidence INTEGER NOT NULL DEFAULT 0 CHECK(low_confidence IN (0,1)),
  classification_json TEXT NOT NULL,
  sampled_at TEXT NOT NULL,
  FOREIGN KEY(shadow_audit_id) REFERENCES shadow_audits(id)
);

CREATE TABLE IF NOT EXISTS quality_shadow_reviews (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  shadow_audit_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN ('CONFIRMED','CLEARED')),
  reason TEXT NOT NULL CHECK(length(trim(reason))>=10),
  reviewer_email TEXT NOT NULL,
  reviewed_at TEXT NOT NULL,
  FOREIGN KEY(shadow_audit_id) REFERENCES shadow_audits(id),
  UNIQUE(organization_id,property_id,shadow_audit_id)
);

CREATE TABLE IF NOT EXISTS quality_monitor_runs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('COMPLETED','FAILED')),
  sampled_count INTEGER NOT NULL DEFAULT 0 CHECK(sampled_count>=0),
  flagged_count INTEGER NOT NULL DEFAULT 0 CHECK(flagged_count>=0),
  error_message TEXT,
  correlation_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_eval_batches_scope
  ON eval_batches(organization_id,property_id,role_code,started_at);
CREATE INDEX IF NOT EXISTS idx_eval_batches_gate
  ON eval_batches(organization_id,property_id,deployment_gate,review_decision);
CREATE INDEX IF NOT EXISTS idx_quality_shadow_scope
  ON quality_shadow_classifications(organization_id,property_id,severity,sampled_at);
CREATE INDEX IF NOT EXISTS idx_quality_monitor_scope
  ON quality_monitor_runs(organization_id,property_id,completed_at);
