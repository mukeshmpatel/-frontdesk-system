CREATE TABLE IF NOT EXISTS tax_preparation_profiles (
  organization_id TEXT PRIMARY KEY, accounting_method TEXT NOT NULL DEFAULT 'UNCONFIRMED',
  accounting_method_confirmed INTEGER NOT NULL DEFAULT 0, gross_includes_tax INTEGER,
  sales_tax_rate REAL, lodging_tax_rate REAL, jurisdiction_label TEXT,
  verified_by TEXT, verified_at TEXT, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tax_source_imports (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, object_key TEXT NOT NULL, file_name TEXT NOT NULL,
  frequency TEXT NOT NULL, period_start TEXT NOT NULL, period_end TEXT NOT NULL,
  row_count INTEGER NOT NULL, mapped_rows INTEGER NOT NULL, exceptions_json TEXT NOT NULL,
  imported_by TEXT NOT NULL, imported_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS tax_source_imports_period_idx ON tax_source_imports(organization_id,period_start,period_end);
CREATE TABLE IF NOT EXISTS tax_financial_facts (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, import_id TEXT NOT NULL,
  business_date TEXT NOT NULL, source_reference TEXT, gross_revenue REAL NOT NULL DEFAULT 0,
  taxable_room_revenue REAL NOT NULL DEFAULT 0, taxable_other_sales REAL NOT NULL DEFAULT 0,
  exempt_revenue REAL NOT NULL DEFAULT 0, refunds REAL NOT NULL DEFAULT 0, discounts REAL NOT NULL DEFAULT 0,
  adjustments REAL NOT NULL DEFAULT 0, operating_expenses REAL NOT NULL DEFAULT 0,
  sales_tax_collected REAL NOT NULL DEFAULT 0, lodging_tax_collected REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS tax_financial_facts_date_idx ON tax_financial_facts(organization_id,business_date);
CREATE TABLE IF NOT EXISTS tax_return_workpapers (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, period_start TEXT NOT NULL, period_end TEXT NOT NULL,
  accounting_method TEXT NOT NULL, calculation_json TEXT NOT NULL, status TEXT NOT NULL,
  exceptions_json TEXT NOT NULL, prepared_by TEXT NOT NULL, prepared_at TEXT NOT NULL,
  approved_by TEXT, approved_at TEXT, UNIQUE(organization_id,period_start,period_end)
);
CREATE TABLE IF NOT EXISTS work_evidence_reviews (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, work_order_id TEXT NOT NULL,
  attachment_id TEXT NOT NULL UNIQUE, evidence_area TEXT NOT NULL, evidence_stage TEXT NOT NULL,
  review_status TEXT NOT NULL, quality_score INTEGER, deficiencies_json TEXT NOT NULL,
  provider_label TEXT NOT NULL, reviewer_email TEXT, reviewer_note TEXT,
  reviewed_at TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS work_evidence_reviews_order_idx ON work_evidence_reviews(organization_id,work_order_id);
