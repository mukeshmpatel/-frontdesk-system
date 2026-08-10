# Batch 3 — Cash Reconciliation Findings and Implementation Contract

Date: 2026-08-03  
Module: `AAIQ_CASH_CUSTODY`  
Workflow key: `cash-reconciliation.daily`

## Outcome

The repaired workflow must answer **“How much cash did we collect today?”** from authorized source rows and physical shift-drop records. The answer must expose the property, business date, expected cash, counted cash, variance, shift-level gaps, source records, manager verification, task/escalation state, and audit evidence.

The workflow is not considered verified merely because a screen exists or a user selects a status. `working_verified` remains human-review gated through the strict capability ledger.

## Current-state evidence

| Existing capability | Evidence | Classification |
|---|---|---|
| Employee denomination count | `db/cash-check-custody.ts`, `shift_cash_denominations` | Reuse |
| Expected-cash evidence per individual session | `shift_cash_expected_evidence` from migration `0072` | Extend |
| Immutable sealed employee drop | `shift_drop_custody_receipts` | Reuse |
| Independent manager recount | `shift_drop_verifications`, `shift_manager_recount_denominations` | Reuse |
| Property access boundary | `db/property-scope.ts` | Reuse |
| Central audit trail | `db/platform-controls.ts::recordSystemAudit` | Reuse |
| Canonical reporting tasks | `operational_work_orders`, `db/reporting-layer.ts` | Reuse |
| Manager notification/outbox | `notification_escalations`, `notification_outbox`, `staff_notifications` | Reuse |
| Strict verification evidence | migration `0073`, `workflow_verification_runs` | Extend |

## Defects found

### CR-001 — No daily business-date reconciliation

- Severity: Critical
- Current behavior: Each shift session has a manually entered expected total, but no property/business-date record reconciles all shifts.
- Expected behavior: One canonical daily reconciliation with expected, counted, variance, shift breakdown, source status, and reconciliation status.
- Evidence: `db/cash-check-custody.ts` has no business-date aggregation and migrations `0064`/`0072` have no daily reconciliation entity.

### CR-002 — Missing drops are invisible

- Severity: Critical
- Current behavior: If a scheduled shift never submits a drop, no record exposes the missing shift.
- Expected behavior: Compare configured expected shifts against source transactions and submitted/verified sessions; missing source or drop remains an unresolved gap.

### CR-003 — Expected cash can be typed without row-level source proof

- Severity: High
- Current behavior: An operator types expected cash and a text reference.
- Expected behavior: Import authorized cash rows from a PMS export, scheduled email report, or manual report content; preserve a content hash, source line, reference, batch total, and parser outcome. Live PMS must never be implied when no live connector is configured.

### CR-004 — No independent recomputation

- Severity: Critical
- Current behavior: The same stored session values are displayed without an independent aggregate query.
- Expected behavior: A separate verification endpoint must re-query source and custody tables and compare its result to the stored reconciliation checksum.

### CR-005 — Variances do not create canonical work

- Severity: High
- Current behavior: A manager can write a resolution note, but unresolved daily shortages/overages do not create reporting-engine tasks.
- Expected behavior: One idempotent `operational_work_orders` task per unresolved daily reconciliation, visible in the existing task drill-down.

### CR-006 — No timed manager escalation

- Severity: Critical
- Current behavior: Cash discrepancies do not enter the shared notification escalation/outbox path.
- Expected behavior: An unresolved variance above the property threshold and age window must route to a named manager and be audited.

### CR-007 — No total → shift → source drill-down

- Severity: High
- Current behavior: Reports drill into an individual session only.
- Expected behavior: A manager reaches exact shift sessions and original imported source rows from the daily total in no more than two interactions.

### CR-008 — Manager verification is unnecessarily admin-only

- Severity: High
- Current behavior: `verifyCashSession` checks `context.role === "admin"` although `canVerify` already recognizes manager/corporate profiles.
- Expected behavior: Active managers/corporate users assigned to the property may verify; ordinary employees may not verify their own records.

## Implementation contract

### Scope

1. Add an additive, forward-only migration and rollback for daily reconciliation policy, imported source batches/rows, business-date session linkage, and reconciliation records.
2. Add deterministic cash-report parsing and reconciliation calculation.
3. Add manager APIs for import, run, read, sources, independent verify, and escalation processing.
4. Extend the existing Cash & Check Custody screen with a daily command surface, shift/source drill-down, explicit missing-data states, and detailed help.
5. Create canonical reporting tasks and shared notification escalations for unresolved discrepancies.
6. Persist system audit evidence for source import, run, independent verify, task creation, and escalation.
7. Add controlled tests for missing drops, unavailable source, threshold escalation behavior, tenant/property scope, parser validation, and exact-match/variance math.

### Explicit non-goals

- No live OPERA/OHIP claim until credentials and a certified connector exist.
- No automatic accounting/GL posting, bank deposit, refund, or payment action.
- No public check image storage.
- No fabricated report, shift, transaction, employee, manager, or credential data.
- No automatic `working_verified` promotion. Human review is required.

### Hierarchy and access

- Every record is scoped by `organization_id` and `property_id`.
- Employees may create/count/submit only their own open shift session.
- Managers/corporate/admin users may import a source report, run/verify reconciliation, recount submitted drops, and resolve discrepancies for authorized properties.
- A user may not manager-verify their own submitted drop.
- Source rows and audit details are not available without `AAIQ_CASH_CUSTODY` access.

### Source and fallback contract

- Supported wired path for this release: parsed PMS export, scheduled-email report content, or manual report content.
- Required columns: business date, shift, cash amount; optional columns: transaction/reference and occurred time.
- The content SHA-256, raw source row, row number, source type, source reference, importer, and import time are preserved.
- If no valid authorized source exists, status is `SOURCE_UNAVAILABLE` and the UI states that the amount cannot be computed. It never guesses.

### Workflow

1. Schedule or manager triggers a run.
2. System resolves property timezone, business date, policy, source rows, expected shifts, physical sessions, receipts, and manager verifications.
3. Deterministic engine calculates expected/count/variance for every shift and the day.
4. Missing source/drop/manager verification remains an explicit gap.
5. System stores the reconciliation and checksum.
6. A separate function re-queries and recomputes independently.
7. Any unresolved discrepancy creates/updates one canonical reporting task.
8. Over-threshold, overdue discrepancy creates one shared escalation/outbox/staff notification for the named manager.
9. Every step writes central audit evidence.

### Status rules

- `SOURCE_UNAVAILABLE`: no valid source rows; expected total and variance are `NULL`.
- `PENDING_REVIEW`: source exists but a drop/manager verification is missing.
- `RECONCILED_CLEAN`: all required shifts have source and verified drops and variance is zero.
- `RECONCILED_WITH_VARIANCE`: all required records exist but expected and counted differ.
- User-selected “Ready” is not part of this workflow.

### Acceptance criteria

- Missing shift drop is shown as a named unresolved shift and creates a task.
- Missing PMS/report source states “cannot compute” and does not display a guessed amount.
- Shortage/overage above threshold produces an idempotent manager escalation after the configured window.
- Daily total opens shift rows in one interaction and exact source rows in a second.
- Independent verification uses a separate query path and records pass/fail evidence.
- Existing shift custody and manager recount remain functional.
- Build, migration-chain, capability-collision, security boundary, and workflow tests pass.
- Capability remains `working_incomplete` until a real-property workflow run is reviewed by a human.

