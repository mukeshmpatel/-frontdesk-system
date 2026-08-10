# Migration 0032 rollback

Export all `digital_role_*` tables before rollback. The migration is additive and does not modify existing agent, operations, report, or identity records. Rollback removes the eight `digital_role_*` tables in reverse dependency order. Existing Digital Employees and their earlier policies remain intact. Never roll back after production executions without first preserving the execution, handoff, evaluation, and report ledgers.
