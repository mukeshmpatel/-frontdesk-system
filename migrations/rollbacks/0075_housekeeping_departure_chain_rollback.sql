-- Compatibility rollback for Batch 3 Workflow 2.
DROP INDEX IF EXISTS idx_work_attachment_checksum;
DROP INDEX IF EXISTS idx_housekeeping_handoff_assignment;
DROP INDEX IF EXISTS idx_housekeeping_inspection_assignment;
DROP INDEX IF EXISTS idx_housekeeping_assignment_queue;
DROP INDEX IF EXISTS idx_housekeeping_departure_scope;
DROP INDEX IF EXISTS idx_housekeeping_batch_scope;
DROP TABLE IF EXISTS housekeeping_maintenance_handoffs;
DROP TABLE IF EXISTS housekeeping_assignment_inspections;
DROP TABLE IF EXISTS housekeeping_assignments;
DROP TABLE IF EXISTS housekeeping_departures;
DROP TABLE IF EXISTS housekeeping_departure_batches;
ALTER TABLE work_order_attachments DROP COLUMN content_sha256;
