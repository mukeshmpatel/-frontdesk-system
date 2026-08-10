-- Release 125: additive custody evidence around the preserved Release 119 cash/check schema.
CREATE TABLE IF NOT EXISTS shift_cash_expected_evidence (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  source_type TEXT NOT NULL CHECK(source_type IN ('PMS_REPORT','EMAIL_REPORT','MANUAL_UPLOAD','MANAGER_ENTERED','OTHER')),
  source_reference TEXT NOT NULL,
  expected_cash_cents INTEGER NOT NULL CHECK(expected_cash_cents>=0),
  captured_by TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES shift_cash_sessions(id)
);

CREATE TABLE IF NOT EXISTS shift_drop_custody_receipts (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  receipt_type TEXT NOT NULL CHECK(receipt_type IN ('EMPLOYEE_SUBMISSION','MANAGER_RECEIPT','RETURN_FOR_RECOUNT','VARIANCE_RESOLUTION')),
  seal_reference TEXT,
  cash_cents INTEGER NOT NULL DEFAULT 0,
  check_cents INTEGER NOT NULL DEFAULT 0,
  variance_cents INTEGER NOT NULL DEFAULT 0,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  acknowledged_by TEXT NOT NULL,
  acknowledged_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES shift_cash_sessions(id)
);

CREATE TABLE IF NOT EXISTS shift_manager_recount_denominations (
  id TEXT PRIMARY KEY,
  verification_id TEXT NOT NULL,
  denomination_cents INTEGER NOT NULL CHECK(denomination_cents>0),
  quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity>=0),
  subtotal_cents INTEGER NOT NULL DEFAULT 0 CHECK(subtotal_cents>=0),
  FOREIGN KEY(verification_id) REFERENCES shift_drop_verifications(id),
  UNIQUE(verification_id,denomination_cents)
);

CREATE INDEX IF NOT EXISTS idx_cash_receipts_session ON shift_drop_custody_receipts(session_id,acknowledged_at);
CREATE INDEX IF NOT EXISTS idx_manager_recount_verification ON shift_manager_recount_denominations(verification_id);

