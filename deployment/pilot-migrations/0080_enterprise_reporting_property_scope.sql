-- Batch 3 Workflow 6: property-isolated saved views/tokens and explicit report-run receipts.
ALTER TABLE report_drilldown_tokens ADD COLUMN property_id TEXT NOT NULL DEFAULT 'UNASSIGNED';
DROP INDEX IF EXISTS report_drilldown_scope_expiry_idx;
CREATE INDEX IF NOT EXISTS report_drilldown_scope_expiry_idx
  ON report_drilldown_tokens(organization_id,property_id,user_email,expires_at);

ALTER TABLE report_saved_views ADD COLUMN property_id TEXT NOT NULL DEFAULT 'UNASSIGNED';
DROP INDEX IF EXISTS report_saved_views_owner_name_idx;
CREATE UNIQUE INDEX IF NOT EXISTS report_saved_views_owner_property_name_idx
  ON report_saved_views(organization_id,property_id,user_email,name);

CREATE INDEX IF NOT EXISTS report_events_property_cursor_idx
  ON report_events(organization_id,property_id,ingested_at,id);
CREATE INDEX IF NOT EXISTS report_facts_property_query_idx
  ON report_facts(organization_id,property_id,fact_type,occurred_at);
DROP INDEX IF EXISTS report_facts_source_idx;
CREATE UNIQUE INDEX IF NOT EXISTS report_facts_property_source_idx
  ON report_facts(organization_id,property_id,source_table,source_record_id,fact_type);

CREATE TABLE IF NOT EXISTS report_run_receipts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  user_email TEXT NOT NULL,
  report_id TEXT NOT NULL,
  filters_json TEXT NOT NULL,
  source_coverage_json TEXT NOT NULL,
  result_row_count INTEGER NOT NULL CHECK(result_row_count>=0),
  result_sha256 TEXT NOT NULL,
  duration_ms INTEGER NOT NULL CHECK(duration_ms>=0),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS report_run_receipts_scope_idx
  ON report_run_receipts(organization_id,property_id,created_at);
