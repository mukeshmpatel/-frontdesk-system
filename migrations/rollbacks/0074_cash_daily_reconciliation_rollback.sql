-- Compatibility rollback for Batch 3 Workflow 1.
-- Drops only the new reconciliation layer, then removes nullable session linkage columns.
DROP INDEX IF EXISTS idx_daily_cash_reconciliation_scope;
DROP INDEX IF EXISTS idx_cash_session_business_date;
DROP INDEX IF EXISTS uq_cash_active_daily_source;
DROP INDEX IF EXISTS idx_cash_source_transaction_scope;
DROP INDEX IF EXISTS idx_cash_source_batch_scope;
DROP INDEX IF EXISTS idx_cash_policy_scope;
DROP TABLE IF EXISTS daily_cash_reconciliation;
DROP TABLE IF EXISTS cash_source_transactions;
DROP TABLE IF EXISTS cash_source_batches;
DROP TABLE IF EXISTS cash_reconciliation_policies;
ALTER TABLE shift_cash_sessions DROP COLUMN source_batch_id;
ALTER TABLE shift_cash_sessions DROP COLUMN shift_code;
ALTER TABLE shift_cash_sessions DROP COLUMN business_date;
