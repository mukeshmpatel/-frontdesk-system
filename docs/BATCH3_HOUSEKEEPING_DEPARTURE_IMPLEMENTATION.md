# Batch 3 — Housekeeping Departure Chain Implementation Contract

## Reuse / extend / create decisions

- Reuse `operational_work_orders` as the execution ledger.
- Reuse `work_order_attachments` and private object storage for evidence.
- Reuse `work_evidence_reviews` for review history, but expose the latest effective review per area.
- Reuse `property_contexts`, `property_assignments`, and `staff_members` as identity and scope authorities.
- Reuse the Maintenance queue and reporting/audit infrastructure.
- Create departure batches/rows, assignment decisions, and maintenance handoff records because those concepts do not exist durably today.
- Create a dedicated Housekeeping Departure Center; do not duplicate maintenance implementation logic.

## Data changes (forward-only migration)

1. `housekeeping_departure_batches`
   - property, business date, source type/reference, checksum, parse status/counts, actor, timestamps.
   - unique property + checksum for idempotent source processing.
2. `housekeeping_departures`
   - immutable normalized source row, room, departure/arrival facts, flags, parse confidence, status, and source lineage.
3. `housekeeping_assignments`
   - departure, linked work order, assigned employee, score/priority/reason, workflow state, due and escalation timestamps.
4. `housekeeping_maintenance_handoffs`
   - assignment, housekeeping work order, maintenance work order, defect, confidence, review state, timestamps.
5. Additive indexes and checks that keep every link inside one organization/property.

## Deterministic decision policy v1

- Eligible assignee: active `staff_members` row + active `property_assignments` row for the active property + department/role indicating Housekeeping.
- Candidate ranking: fewest open assigned housekeeping jobs, then stable email ordering.
- Room score:
  - departed/checked-out: +40
  - early-arrival/early-check-in pressure: +30
  - VIP: +20
  - due-out/expected departure: +10
  - unknown facts: +0, never inferred
- Priority: `CRITICAL >= 80`, `HIGH >= 50`, `MEDIUM >= 20`, otherwise `LOW`.
- Due time: explicit source due time if valid; otherwise a policy duration by priority. The fallback is labeled as policy-derived.
- Decision reason: persisted JSON containing only the facts and policy rules actually used.

## State model

`UNASSIGNED -> ASSIGNED -> ACCEPTED -> IN_PROGRESS -> EVIDENCE_SUBMITTED -> SUPERVISOR_REVIEW -> VERIFIED`

Failure branches:

- no eligible worker -> `UNASSIGNED` + critical supervisor escalation
- integrity/coverage failure -> `REWORK_REQUIRED`
- visual provider unavailable or ambiguous -> `SUPERVISOR_REVIEW`
- failed brand-standard checklist -> real maintenance work order + `MAINTENANCE_HOLD`
- overdue unaccepted/in-progress -> durable escalation, never silently closed

Only server-side evidence and workflow rules may grant `VERIFIED`.

## API contract

- `POST /api/housekeeping/departures/ingest`
  - accepts governed text/CSV content or multipart upload
  - property comes from authenticated active scope, never request trust
  - returns batch, parsed rows, assignments, exceptions
- `GET /api/housekeeping/assignments/today`
  - returns active property, source status, supervisor rollup, and role-filtered assignments
- `POST /api/housekeeping/assignments/:id/verify`
  - actions: accept, start, submit evidence, supervisor inspection/rework
  - failed checklist items can create a linked maintenance handoff atomically
- `GET /api/housekeeping/assignments/:id/handoff-trace`
  - returns departure, assignment decision, work order, evidence/reviews, handoff, maintenance order, audit timeline

## Distinct user journeys

### Housekeeper

1. Open “My rooms.”
2. See ordered rooms with due time and factual priority reason.
3. Accept and start a room.
4. Capture required before/after evidence.
5. Complete the room checklist and submit.
6. Correct rework if returned.

### Housekeeping supervisor

1. Ingest a departure report or see verified connected-source status.
2. Review automatic assignments and explicit unassigned exceptions.
3. Reassign only to eligible property staff.
4. Review required coverage and checklist results.
5. Approve, require rework, or create a linked maintenance defect.
6. Drill through the full handoff trace.

### Maintenance

The existing Maintenance Center receives a normal property-scoped work order with the housekeeping parent and handoff reference. It is not a housekeeping-only display skin.

## Security and audit controls

- No organization-only mutation authorization.
- Every route resolves an active property through `property_assignments`.
- Staff may mutate only their assigned work; supervisors/admins may assign/review within authorized properties.
- Private object keys are never returned as public URLs.
- Source text and filenames are untrusted data, not instructions.
- Central audit records and report facts are both required for material events.
- No credential, payment, door-access, publishing, or irreversible external action is introduced.

## Definition of done

- Fresh and upgrade migrations pass with rollback artifact present.
- Duplicate batch ingestion is idempotent.
- Same room number at two properties does not collide.
- No-roster import creates an explicit escalation.
- An eligible roster produces balanced, explainable assignments.
- Staff cannot mutate another user's or another property's assignment.
- Missing evidence cannot verify a room.
- Low-confidence inspection routes to supervisor.
- Failed inspection creates exactly one linked maintenance order.
- Handoff trace reaches the maintenance record and audit events.
- Housekeeping UI is a distinct role journey.
- Full test/build/migration/collision suites remain green.
- Capability remains `working_incomplete` until real-property human review is recorded.

## Implemented evidence — 2026-08-03

The contract above is now implemented without replacing the preserved work-order, audit, reporting, identity, or private-storage owners.

- `migrations/0075_housekeeping_departure_chain.sql` adds the property-scoped departure batch, normalized departure, assignment, inspection, and maintenance-handoff ledgers. Its rollback removes only this layer.
- `migrations/0076_property_workflow_scope_hardening.sql` repairs the legacy compliance-template uniqueness boundary so the same governed template may exist independently at both pilot properties. Its rollback preserves one deterministic legacy row per organization/template code.
- `db/housekeeping-departures.ts` owns the dedicated departure, assignment, escalation, evidence, inspection, and handoff service.
- `/api/housekeeping/*` exposes dedicated ingest, today queue, evidence, verification, and trace routes.
- `app/housekeeping/housekeeping-departure-client.tsx` replaces the former shared Housekeeping/Maintenance display with role-specific housekeeper and supervisor journeys.
- `db/property-workflows.ts` and its API routes now enforce the active property on every retained legacy work-order mutation and evidence read, require department/assignment authority, and write central audit evidence.
- `db/reporting-layer.ts` no longer projects every organization work order or attachment into every property; legacy report facts are filtered by the selected property.
- File byte size is no longer treated as visual quality. Image uploads receive `UPLOAD_INTEGRITY_ONLY_V1` and `PENDING_SUPERVISOR_REVIEW`; only a configured governed vision result or authorized human decision may approve visible work.
- The generated capability baseline is version `2026-08-03-b3-2`, inventories 540 items, and retains zero `working_verified` claims.

## Verification evidence — 2026-08-03

- Capability collisions: 33 navigation entries, 158 migration tables, status `PASS`.
- Migration replay: populated Release 68 preservation record survived all 77 forward migrations.
- Production build: passed.
- Housekeeping/rendered-shell regression: 44/44 passed.
- Housekeeping plus capability-ledger regression: 13/13 passed.
- Complete application regression: 259 tests (final result recorded in `MISSION_LOG.md`).

## Remaining operational gate

Engineering proof does not prove real hotel operation. `AAIQ_HOUSEKEEPING` remains `working_incomplete` until an authorized manager runs representative departures for both pilot properties through assignment, before/after evidence, supervisor decision, rework or maintenance handoff, and opens the resulting audit trace. Private media and any PMS/email/vision provider must also be configured and certified before those source labels can become connected or provider-verified.
