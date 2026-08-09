DROP INDEX IF EXISTS report_run_receipts_scope_idx;
DROP TABLE IF EXISTS report_run_receipts;
DROP INDEX IF EXISTS report_facts_property_query_idx;
DROP INDEX IF EXISTS report_facts_property_source_idx;
-- A non-unique compatibility index avoids data loss or rollback failure when
-- two legitimate properties reference the same provider-side source key.
CREATE INDEX IF NOT EXISTS report_facts_source_idx
  ON report_facts(organization_id,source_table,source_record_id,fact_type);
DROP INDEX IF EXISTS report_events_property_cursor_idx;
DROP INDEX IF EXISTS report_saved_views_owner_property_name_idx;
CREATE UNIQUE INDEX IF NOT EXISTS report_saved_views_owner_name_idx
  ON report_saved_views(organization_id,user_email,name);
DROP INDEX IF EXISTS report_drilldown_scope_expiry_idx;
CREATE INDEX IF NOT EXISTS report_drilldown_scope_expiry_idx
  ON report_drilldown_tokens(organization_id,user_email,expires_at);
-- SQLite cannot drop the additive property_id columns without rebuilding preserved tables.
-- Rollback intentionally restores prior indexes while leaving harmless additive columns in place.
