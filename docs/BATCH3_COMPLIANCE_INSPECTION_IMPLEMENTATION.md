# Batch 3 Workflow 4 — Compliance Inspection-to-Closure Implementation

Date: 2026-08-03  
Canonical capability: `AAIQ_COMPLIANCE_CENTER`  
Route: `/compliance-center`  
Status: engineering complete; local source configuration and authorized UAT required

## Outcome

AAIQ now owns the administrative work around a hotel compliance inspection without claiming to perform the physical or legally reserved work. The implemented chain is:

`approved rule source → scheduled due instance → exact registered asset → eligible property inspector → measured checklist → automatic failure containment → linked Maintenance remediation → private evidence → independent qualified review → next due date → drill-down trace`

## What AAIQ performs autonomously

- prepares the governed program definitions through an explicit or scheduled idempotent job;
- detects approved programs that are due within the controlled horizon;
- selects only registered, active targets matching the governed target rule;
- selects an active same-property Compliance inspector and explains the assignment;
- opens a named exception when the source, target, inspector, evidence, remediation, or deadline is not ready;
- validates required response types and source-approved numeric ranges;
- creates a property-scoped Maintenance case for each failed result;
- fail-closes critical results into a non-waivable hold;
- checks required evidence coverage without pretending upload integrity is visual approval;
- advances recurrence only after independent compliant closure;
- emits property-scoped report facts, audit entries, notifications, automation proof, and immutable case events;
- monitors due/overdue work from the existing scheduled worker.

## Human gates that remain intentionally visible

- approving the real property SOP, authority, jurisdiction, effective date, and measurement ranges;
- registering real rooms/equipment and assigning qualified property staff;
- physical observation, testing, measurement, repair, and emergency response;
- life-safety, licensed, regulatory, insurer, brand, or legal sign-off;
- uploading representative private evidence and independently reviewing it;
- approving a time-limited non-critical waiver; critical holds cannot be waived;
- public filing, vendor commitment, spending, shutdown, and room/asset release.

## Persistence and ownership

- Forward migration: `migrations/0078_compliance_inspection_chain.sql`
- Recovery artifact: `migrations/rollbacks/0078_compliance_inspection_chain_rollback.sql`
- Existing owners reused: `operational_work_orders`, `maintenance_compliance_templates`, `property_assets`, `property_assignments`, `work_order_attachments`, `work_evidence_reviews`, `automation_exceptions`, `staff_notifications`, central reporting, and `system_audit_trail`.
- Added owner tables: programs/items, inspection cases/responses, evidence links, independent reviews, append-only events, and automation runs.

## API and screen

- `/api/compliance/programs` — read center, prepare baseline, approve sources/ranges, run due automation.
- `/api/compliance/cases/:id/action` — allowlisted lifecycle transitions, response records, assignments, remediation checks, review, waiver, cancellation.
- `/api/compliance/cases/:id/evidence` — private image/PDF evidence with digest identity and explicit evidence type.
- `/api/compliance/cases/:id/trace` — property-scoped case trace and audit access receipt.
- `/compliance-center` — separate manager/inspector/read-only experience with queue filters, source configuration, measurement ranges, evidence gates, remediation, independent review, exceptions, automation runs, and trace.

## Verification evidence

- SQL placeholder/bind parity is AST-checked for every Compliance INSERT.
- The engine tests allowed/forbidden transitions, critical no-waiver behavior, typed range evaluation, factual failure notes, recurrence, and exact target rules.
- The migration test verifies property isolation, idempotency, append-only events, rollback, and Release 68 work-order preservation.
- Static contract tests verify dedicated routes, property scoping, source gating, staff eligibility, Maintenance linkage, independent review, private evidence labeling, reporting/audit, worker wiring, and replacement of the generic shell.
- Migration replay and production build pass. Full regression evidence is recorded in `MISSION_LOG.md` after the final suite completes.

## Pilot UAT required before `working_verified`

For each pilot property, configure at least one real program source and target, create a due case, complete a passing inspection, deliberately test an out-of-range/failed item, close its linked Maintenance repair, repeat the inspection, upload every required evidence type, use a different manager for closure, and open the full trace. Verify notifications and reports with authorized staff. Store the seven-question human verification record; do not relabel the capability based only on automated tests.

Confirmed: HNE Core and the GitHub repository were not inspected or modified.
