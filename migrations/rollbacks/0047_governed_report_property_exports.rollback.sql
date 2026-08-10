-- Recovery-only rollback. Preserve added audit columns for forward compatibility.
DROP INDEX IF EXISTS report_export_property_time_idx;
DROP INDEX IF EXISTS report_facts_property_query_idx;
UPDATE report_facts SET property_id='primary' WHERE property_id!='UNASSIGNED';
UPDATE report_events SET property_id='primary' WHERE property_id!='UNASSIGNED';
