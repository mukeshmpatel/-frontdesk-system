# Batch 3 — Cash Reconciliation Implementation and Operating Guide

Date: 2026-08-03  
Canonical module: `AAIQ_CASH_CUSTODY`  
Workflow key: `cash-reconciliation.daily`  
Engineering state: complete; real-property UAT and human verification remain required

## What is usable now

The preserved Cash & Check Custody module now supports one source-backed daily cash reconciliation for each property and business date. It combines:

- authorized PMS-export, scheduled-email-report, or manual-upload rows;
- employee bill and coin counts;
- check references and private object references;
- immutable employee drop submission;
- independent manager recount;
- daily expected, physically counted, and variance totals;
- shift-level and exact-row drill-down;
- canonical work-order creation for missing or conflicting evidence;
- timed manager escalation through the existing notification outbox; and
- central system audit and independent verification evidence.

The application does **not** claim that OPERA/OHIP is connected. It does not post to the general ledger, make a bank deposit, process a refund, move money, or publish a check image.

## Daily operating flow

### Manager setup — once per property

1. Open **AAIQ Cash & Check Custody** and select **Daily reconciliation**.
2. In **Property cash policy**, confirm the expected shift codes. The default is `AM, PM, NIGHT`.
3. Confirm the discrepancy threshold, escalation delay, and scheduled local run time.
4. Save the policy. The change is property-scoped and audited.

Only an administrator or an active manager/corporate user assigned to the property can change this policy.

### Import the authorized source

1. Select the business date.
2. Choose the truthful source type:
   - **PMS export** for an exported report file;
   - **Email report** for report content received through an authorized mailbox; or
   - **Manual upload** for content supplied by an authorized manager.
3. Enter a source reference such as the report name and scheduled delivery time.
4. Paste the CSV content and choose **Import report and run**.

Required columns are business date, shift, and cash amount. Reference and occurred time are optional. Accepted header aliases are normalized by the parser.

```csv
business_date,shift,cash_amount,reference,occurred_at
2026-08-03,AM,125.25,OPERA-AM-001,2026-08-03T15:00:00Z
2026-08-03,PM,84.50,OPERA-PM-001,2026-08-03T23:00:00Z
2026-08-03,NIGHT,(5.25),REFUND-002,2026-08-04T05:00:00Z
```

Amounts may be ordinary dollar values, dollar-prefixed values, or parenthesized negative amounts. Invalid amounts and rows for the wrong business date are rejected. The raw source row, line number, reference, content hash, importer, and import time are retained.

If a corrected report is imported, the new parsed batch becomes the only active batch for that property/date. Earlier batches remain available as historical evidence but cannot be double-counted. The database enforces this rule.

### Employee shift drop

1. Open **Cashier shift drop**.
2. Select the active authorized source batch and the employee's shift.
3. Start the shift drop. A shift cannot use a report from another property, date, or inactive batch.
4. Count every bill and coin denomination.
5. Add checks using payer, masked check number, amount, and a private object reference where configured.
6. Review the calculated total and submit the sealed drop.

After submission, the employee cannot alter the drop. An employee can see and change only their own open drop.

### Independent manager receipt

1. An authorized manager opens **Manager verification**.
2. Select a submitted drop for a property to which the manager is assigned.
3. Recount bills and coins independently and record received checks.
4. If the recount differs, enter a factual resolution note.
5. Submit verification.

The employee who submitted a drop cannot verify that same drop. Manager verification automatically reruns the daily reconciliation.

### Daily answer and drill-down

The top daily card answers:

- authorized source total;
- physically counted total;
- variance;
- unresolved evidence-gap count; and
- independent verification state.

Select the daily answer to open level 1 shift rows. Select a shift to open level 2 source rows, employee sessions, receipts, and manager verification evidence. Missing source, missing drop, and missing manager verification remain visible as named gaps.

## Truthful result states

| State | Meaning | System behavior |
|---|---|---|
| `SOURCE_UNAVAILABLE` | A complete authorized source is not available. | Expected total and variance remain null; AAIQ does not guess. |
| `PENDING_REVIEW` | Source exists, but one or more drops or manager recounts are missing. | Creates or updates the canonical follow-up task. |
| `RECONCILED_CLEAN` | Every configured shift has source and independently verified custody, and variance is zero. | Closes the reconciliation task. |
| `RECONCILED_WITH_VARIANCE` | All required records exist but the counted total differs from source. | Keeps the task open and escalates when policy threshold/time are met. |

There is no user-selectable Ready status.

## Automation

- Cloudflare invokes the scheduled handler every 15 minutes.
- The handler evaluates each enabled property's configured local time and reconciles the prior business date when due.
- A separate D1 query path recomputes source and custody totals and compares the checksum to the stored calculation.
- The independent result is stored in `workflow_verification_runs` with no human reviewer.
- Missing evidence or a variance creates one idempotent `operational_work_orders` task.
- An over-threshold variance older than the configured window creates one idempotent manager escalation and writes to `notification_escalations`, `notification_outbox`, and `staff_notifications`.
- Every import, calculation, verification, task, and escalation writes central audit evidence.

Automated independent verification is not the same as human UAT. It does not promote the capability to `working_verified`.

## Access and safety boundaries

- Every read and write is scoped to `organization_id` and `property_id`.
- Module access is checked server-side through `AAIQ_CASH_CUSTODY`.
- Employees may work only on their own open shift drop.
- Active managers/corporate users and administrators can import, configure, run, and verify within assigned properties.
- Self-verification is denied.
- Accounting posting is disabled.
- Live PMS mode is blocked until a separately certified connector is configured.
- Check media must use a private object reference; a public URL is rejected.

## Migration and deployment

Apply migration `0074_cash_daily_reconciliation.sql` through the normal forward-only migration command. The migration:

- preserves existing custody sessions;
- adds business date, shift code, and source-batch linkage to custody sessions;
- creates source batch/row, policy, and daily reconciliation storage; and
- creates the one-active-source-per-property-date constraint.

Rollback file `migrations/rollbacks/0074_cash_daily_reconciliation_rollback.sql` removes only the Batch 3 layer. It does not delete preserved cash custody sessions.

The deployment Worker must keep the D1 `DB` binding and the `*/15 * * * *` cron trigger. No R2 binding is required for text-only report reconciliation. Private check-image capture remains unavailable until private media storage is configured.

## Verification completed

- Targeted cash and preserved-custody regression tests: 11/11 passed.
- Deterministic parser, exact match, shortage, missing source, missing drop, and missing manager cases passed.
- Migration preservation, rollback, and one-active-source constraint passed.
- Property scope, authorization, self-verification denial, scheduled execution, work-order creation, escalation, audit, and independent-verification structural checks passed.
- Capability collision check passed: 33 navigation entries, 153 migration tables, 5 canonical owners.
- Migration chain passed: populated Release 68 baseline preserved through 75 migrations.
- Production build passed.
- Complete application regression passed: 250/250 tests.

## Required real-property UAT before verified status

1. Import one representative authorized cash report for each pilot property.
2. Confirm the parser maps every real shift and negative/refund row correctly.
3. Submit at least one exact-match employee drop and complete manager recount.
4. Test one controlled variance and confirm the task and named-manager escalation.
5. Review the source-row, receipt, audit, and independent-verification drill-down.
6. Have an authorized human reviewer record the seven-question workflow verification result.

Until those steps are completed, the capability remains `working_incomplete`. This is intentional and prevents a rendered screen or synthetic test from being presented as production proof.
