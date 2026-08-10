-- Controlled rollback for Batch 3 strict verification storage.
-- Export evidence before applying this rollback in any environment containing reviewed runs.
DROP INDEX IF EXISTS idx_digital_employee_work_queue_scope;
DROP INDEX IF EXISTS idx_digital_employee_duty_role;
DROP INDEX IF EXISTS idx_workflow_verification_scope;
DROP INDEX IF EXISTS idx_capability_ledger_status;
DROP TABLE IF EXISTS digital_employee_work_queue;
DROP TABLE IF EXISTS digital_employee_duties;
DROP TABLE IF EXISTS workflow_verification_runs;
DROP TABLE IF EXISTS capability_ledger;
