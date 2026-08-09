-- Batch 3 Workflow 1: source-backed, independently verified daily cash reconciliation.
-- Additive and forward-only. Existing Release 119/125 custody records are preserved.

ALTER TABLE shift_cash_sessions ADD COLUMN business_date TEXT;
ALTER TABLE shift_cash_sessions ADD COLUMN shift_code TEXT;
ALTER TABLE shift_cash_sessions ADD COLUMN source_batch_id TEXT;

CREATE TABLE IF NOT EXISTS cash_reconciliation_policies (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/Chicago',
  expected_shift_codes_json TEXT NOT NULL DEFAULT '["AM","PM","NIGHT"]',
  discrepancy_threshold_cents INTEGER NOT NULL DEFAULT 1000 CHECK(discrepancy_threshold_cents>=0),
  escalation_window_minutes INTEGER NOT NULL DEFAULT 30 CHECK(escalation_window_minutes>=0),
  scheduled_local_time TEXT NOT NULL DEFAULT '03:30',
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(organization_id,property_id)
);

CREATE TABLE IF NOT EXISTS cash_source_batches (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  business_date TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK(source_type IN ('PMS_LIVE','PMS_EXPORT','EMAIL_REPORT','MANUAL_UPLOAD')),
  source_reference TEXT NOT NULL,
  file_name TEXT,
  content_sha256 TEXT NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0 CHECK(row_count>=0),
  total_cash_cents INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0,1)),
  status TEXT NOT NULL CHECK(status IN ('PARSED','REVIEW_REQUIRED','FAILED')),
  parse_error TEXT,
  imported_by TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  UNIQUE(organization_id,property_id,content_sha256)
);

CREATE TABLE IF NOT EXISTS cash_source_transactions (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  business_date TEXT NOT NULL,
  shift_code TEXT NOT NULL,
  source_row_number INTEGER NOT NULL CHECK(source_row_number>0),
  source_reference TEXT NOT NULL,
  occurred_at TEXT,
  amount_cents INTEGER NOT NULL,
  raw_row_text TEXT NOT NULL,
  FOREIGN KEY(batch_id) REFERENCES cash_source_batches(id),
  UNIQUE(batch_id,source_row_number)
);

CREATE TABLE IF NOT EXISTS daily_cash_reconciliation (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  business_date TEXT NOT NULL,
  expected_total_cents INTEGER,
  counted_total_cents INTEGER NOT NULL DEFAULT 0,
  variance_cents INTEGER,
  shift_breakdown_json TEXT NOT NULL DEFAULT '[]',
  data_sources_used_json TEXT NOT NULL DEFAULT '[]',
  source_status TEXT NOT NULL CHECK(source_status IN ('AVAILABLE','UNAVAILABLE','INVALID')),
  reconciliation_status TEXT NOT NULL CHECK(reconciliation_status IN ('SOURCE_UNAVAILABLE','PENDING_REVIEW','RECONCILED_CLEAN','RECONCILED_WITH_VARIANCE')),
  unresolved_gap_count INTEGER NOT NULL DEFAULT 0 CHECK(unresolved_gap_count>=0),
  computed_checksum TEXT,
  independent_verification_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(independent_verification_status IN ('PENDING','PASS','FAIL')),
  task_id TEXT,
  escalation_id TEXT,
  trigger_type TEXT NOT NULL CHECK(trigger_type IN ('MANUAL','SCHEDULED')),
  triggered_by TEXT NOT NULL,
  computed_at TEXT NOT NULL,
  verified_at TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE(organization_id,property_id,business_date)
);

CREATE INDEX IF NOT EXISTS idx_cash_policy_scope ON cash_reconciliation_policies(organization_id,property_id,enabled);
CREATE INDEX IF NOT EXISTS idx_cash_source_batch_scope ON cash_source_batches(organization_id,property_id,business_date,active,status,imported_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_active_daily_source ON cash_source_batches(organization_id,property_id,business_date) WHERE active=1 AND status='PARSED';
CREATE INDEX IF NOT EXISTS idx_cash_source_transaction_scope ON cash_source_transactions(organization_id,property_id,business_date,shift_code);
CREATE INDEX IF NOT EXISTS idx_cash_session_business_date ON shift_cash_sessions(organization_id,property_id,business_date,shift_code,status);
CREATE INDEX IF NOT EXISTS idx_daily_cash_reconciliation_scope ON daily_cash_reconciliation(organization_id,property_id,business_date,reconciliation_status);
