-- SQLite cannot safely drop added columns in-place on every supported D1 version.
-- Rollback is intentionally data-preserving: remove the Release 127 indexes.
DROP INDEX IF EXISTS workforce_upload_property_idx;
DROP INDEX IF EXISTS cleaning_velocity_property_idx;
DROP INDEX IF EXISTS amenity_access_property_idx;
DROP INDEX IF EXISTS inventory_vendor_property_idx;
DROP INDEX IF EXISTS inventory_requisition_property_idx;
DROP INDEX IF EXISTS inventory_transaction_property_idx;
DROP INDEX IF EXISTS ota_exceptions_property_queue_idx;
DROP INDEX IF EXISTS ota_runs_property_period_idx;
DROP INDEX IF EXISTS ota_records_property_stay_idx;
DROP INDEX IF EXISTS growth_updates_property_idx;
DROP INDEX IF EXISTS growth_behavior_property_idx;
DROP INDEX IF EXISTS growth_segments_property_idx;
DROP INDEX IF EXISTS growth_content_property_idx;
DROP INDEX IF EXISTS review_advocacy_property_idx;
DROP INDEX IF EXISTS review_sources_property_idx;
DROP INDEX IF EXISTS review_cases_property_idx;
DROP INDEX IF EXISTS review_drafts_property_idx;
DROP INDEX IF EXISTS review_events_property_queue_idx;
