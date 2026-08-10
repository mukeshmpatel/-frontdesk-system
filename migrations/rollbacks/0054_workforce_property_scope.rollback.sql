DROP INDEX IF EXISTS time_breaks_property_scope_idx;
DROP INDEX IF EXISTS time_entries_property_scope_idx;
ALTER TABLE time_breaks DROP COLUMN property_id;
ALTER TABLE time_entries DROP COLUMN property_id;
