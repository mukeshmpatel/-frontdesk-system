# Batch 3 — Housekeeping Departure Chain Findings

## Scope and non-negotiable outcome

This repair covers one workflow only:

`departure source -> parsed departure -> deterministic priority -> roster-aware assignment -> housekeeper work queue -> before/after evidence -> inspection -> linked maintenance handoff -> trace`

The workflow must remain property-scoped, role-controlled, auditable, and honest about external capabilities. It must not mark an assignment verified merely because a user selected a status. Physical cleaning and repair remain human work. AAIQ may ingest, prioritize, assign, monitor, verify evidence, create linked work, and escalate.

## Preserved components that are safe to extend

| Existing component | Evidence | Decision |
| --- | --- | --- |
| Canonical work-order ledger | `migrations/baselines/release68_operational_work_orders.sql` defines `operational_work_orders` | Reuse for executable housekeeping and maintenance work; add workflow-specific links rather than create a competing work-order table. |
| Private evidence objects | `work_order_attachments` and `/api/operations/workflows/attachments/[id]` | Reuse object storage and authenticated download path. Add checksum and explicit assignment evidence links. |
| Evidence review ledger | `work_evidence_reviews` | Extend its use for effective per-area reviews and human approval; do not claim image understanding from file size. |
| Property identity and assignments | `property_contexts`, `property_assignments`, `activeStaffContext` | Reuse as the authorization root. Every new read and write must join through the active property assignment. |
| Maintenance queue | `operational_work_orders.department='MAINTENANCE'` | Reuse so a housekeeping failure creates a real, visible maintenance work order. |
| Report facts | `emitReportEvent` | Reuse for operational reporting, in addition to the central immutable system audit record. |

## Validated defects

### HK-001 — Housekeeping and Maintenance are filtered skins of one component

- Severity: High
- Evidence: `app/housekeeping/page.tsx` and `app/maintenance/page.tsx` both render `PropertyOperationsClient`; `app/property-operations/property-operations-client.tsx` switches only `initialDepartment`.
- Impact: role-specific journeys, empty states, actions, and instructions are not distinct. This reproduces the reported “same screen” problem.
- Repair: create a dedicated Housekeeping Departure Center component and API contract. Preserve the shared work-order primitives underneath.

### HK-002 — Demo work orders are inserted during normal reads

- Severity: Critical
- Evidence: `db/property-workflows.ts:22-44` seeds `demo-housekeeping-*` and `demo-maintenance-*` from `getPropertyWorkflows`.
- Impact: fabricated operational records can be mistaken for live work and contaminate reports.
- Repair: remove runtime demo seeding. Test fixtures belong only in automated tests or explicitly labeled demo environments.

### HK-003 — Departure ingestion has no durable departure model

- Severity: High
- Evidence: `importNightRoomReport` parses each line directly into a work order and stores only aggregate import counts.
- Impact: source rows, corrections, priorities, parse exceptions, source lineage, and reprocessing cannot be reconciled.
- Repair: add property-scoped ingestion batches and immutable departure rows with idempotency keys and source provenance.

### HK-004 — Import and work creation are not property-safe

- Severity: Critical
- Evidence: `importNightRoomReport`, `createMaintenanceIssue`, and several attachment/work-order queries omit `property_id`; duplicate checks use organization + room + department only.
- Impact: one hotel can suppress, mutate, or attach evidence to another hotel's room work when room numbers overlap.
- Repair: resolve one authorized active property before every operation and include it in every insert, lookup, uniqueness check, audit event, and report fact.

### HK-005 — “Assignment” is a generic text queue, not a staff assignment decision

- Severity: High
- Evidence: departure-created work uses `Housekeeping queue`; no availability, department, load, property, or priority decision is made.
- Impact: no housekeeper receives a usable personal queue and no assignment explanation exists.
- Repair: implement a deterministic assignment engine that filters active property-authorized Housekeeping staff, balances open load, records the reason, and creates an explicit unassigned escalation when no eligible staff exist.

### HK-006 — Priority is not based on operational facts

- Severity: High
- Evidence: all housekeeping room turns are assigned `MEDIUM` and a fixed two-hour due time.
- Impact: VIP, early-arrival, departed, due-out, and ordinary rooms cannot be ordered credibly.
- Repair: parse supported facts and calculate an explainable score using a versioned policy. Unknown fields remain unknown; AAIQ does not invent guest or room facts.

### HK-007 — No required departure-chain APIs or handoff trace

- Severity: High
- Evidence: only the broad `/api/operations/workflows` route exists; there is no assignment-today, assignment-verification, or handoff-trace endpoint.
- Impact: individual role clients and tests cannot depend on a stable workflow contract; users cannot drill from a departure to its maintenance outcome.
- Repair: add the four Batch 3 endpoints with authenticated property scope and stable response shapes.

### HK-008 — Progress mutation is too broad

- Severity: Critical
- Evidence: `updateWorkOrder` and `toggleWorkStep` authorize only by organization, not active property assignment, assigned worker, department supervisor, or admin role.
- Impact: a staff member can potentially change another property's or another department's work.
- Repair: enforce property membership and action-specific authority. Assigned workers may update their own housekeeping progress; supervisors/admins may review or reassign.

### HK-009 — Evidence quality is inferred from file size

- Severity: High
- Evidence: `saveAttachment` assigns quality scores of 88/68/35 based only on bytes.
- Impact: a large unrelated image may look “high quality”; this is not a defensible inspection.
- Repair: treat upload integrity and required coverage deterministically. Mark visual inspection as `PENDING_SUPERVISOR_REVIEW` unless a real configured vision provider supplies a governed result. Low-confidence/provider-unavailable cases route to supervisor review.

### HK-010 — Evidence review can use stale area records

- Severity: High
- Evidence: the client uses `.find()` by area while multiple replacement attachments can exist.
- Impact: an old failed image can mask a corrected image, or an old approval can mask later rework.
- Repair: return one effective latest review per required area and preserve full history separately.

### HK-011 — Maintenance handoff lacks enforceable lineage

- Severity: High
- Evidence: `parent_order_id` is optional text and `createMaintenanceIssue` does not validate that the parent is an authorized housekeeping assignment in the active property. No handoff ledger exists.
- Impact: tickets can be orphaned or linked across properties; no durable handoff state or trace is available.
- Repair: add an explicit housekeeping-maintenance handoff row, validate both work orders, and expose the trace.

### HK-012 — No automatic overdue or no-roster escalation

- Severity: High
- Evidence: no scheduled escalation path exists for unassigned or overdue departure work.
- Impact: silent failures remain in a queue without notifying a supervisor.
- Repair: create durable automation exceptions/notifications for no eligible staff, overdue unaccepted work, and low-confidence inspection. Add an idempotent sweep callable by cron and UI refresh.

### HK-013 — Audit coverage is incomplete

- Severity: High
- Evidence: several mutations emit reporting events but do not call the central `recordSystemAudit` ledger.
- Impact: reporting facts are not a substitute for an immutable user/action audit trail.
- Repair: record ingestion, assignment decision, state transition, evidence receipt, inspection decision, escalation, and maintenance handoff with a correlation ID.

### HK-014 — Source capability is overstated

- Severity: Medium
- Evidence: copy describes “front desk automation,” while the live path is a manual CSV/TXT upload and optional object storage.
- Impact: users may believe a PMS or email source is connected when it is not.
- Repair: label each source `MANUAL_UPLOAD`, `EMAIL_ATTACHMENT`, or `PMS_API`, expose connection status, and never claim live PMS/email ingestion without a verified connector.

## Root-cause conclusion

The current experience has useful primitives but no canonical Housekeeping departure aggregate. Work orders were asked to act simultaneously as source rows, assignment decisions, evidence records, and handoff records. That shortcut causes the shared-screen problem, weak authorization, missing lineage, and false “automation” language. The repair must retain the work-order ledger while adding a small, explicit departure/assignment/handoff layer around it.

## Human review gate

This findings record authorizes the implementation scope only. The repaired capability remains `working_incomplete` until a manager tests at least one real property-scoped departure through assignment, evidence review, and any required maintenance handoff. Automated tests may prove code behavior but cannot substitute for that operational review.

## Remediation disposition — 2026-08-03

| Finding | Engineering disposition | Remaining external or human gate |
| --- | --- | --- |
| HK-001 | Resolved for Housekeeping with a dedicated page, client, service, and API family. | Real housekeeper/supervisor usability review. |
| HK-002 | Resolved; ordinary reads no longer seed demo work. | None. |
| HK-003 | Resolved by migration `0075` and immutable source lineage. | Representative report layouts. |
| HK-004 | Resolved in the dedicated chain and hardened retained legacy operations/report projections. | Two-property adversarial UAT. |
| HK-005 | Resolved with active-property roster filtering, clocked-in preference, load balancing, persisted reasoning, and no-roster escalation. | Real roster and shift evidence. |
| HK-006 | Resolved with deterministic, versioned factual scoring. | Confirm property priority policy during UAT. |
| HK-007 | Resolved with dedicated ingest, today, verify, evidence, and trace endpoints. | Authenticated operational UAT. |
| HK-008 | Resolved with property, role, department, and assignment mutation guards plus audit. | Role-boundary penetration/UAT with real accounts. |
| HK-009 | Resolved; byte-size scoring was removed from both dedicated and retained legacy evidence paths. | Governed vision-provider certification or human review. |
| HK-010 | Resolved; latest effective area state is ordered/selected while history remains stored. | Replacement-photo UAT. |
| HK-011 | Resolved with property-validated, durable handoff lineage and full trace. | Real failed-room handoff UAT. |
| HK-012 | Resolved with idempotent scheduled escalation processing and durable notifications/exceptions. | Notification provider configuration and timing UAT. |
| HK-013 | Resolved for material chain and retained legacy workflow mutations through central system audit plus reporting facts. | Human audit-trace review. |
| HK-014 | Resolved; manual upload is labeled `MANUAL_UPLOAD`, and no PMS/email/vision connection is claimed without evidence. | Provider credentials and certification when available. |

The engineering disposition is complete, but the capability remains `working_incomplete`. No row was promoted to `working_verified` by automated tests.
