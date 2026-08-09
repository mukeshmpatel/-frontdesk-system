# Batch 3 — Maintenance Defect-to-Repair Discovery Findings

Date: 2026-08-03  
Scope: AAIQ Maintenance defect intake through verified return to service  
Phase: Discovery complete; remediation authorized under the standing repair instruction  

## Workflow map inspected

1. An operator opens `/maintenance`.
2. The route renders the shared `PropertyOperationsClient` with `initialDepartment="MAINTENANCE"`.
3. Work is read from `operational_work_orders` through `getPropertyWorkflows`.
4. A maintenance request is created through the generic `/api/operations/workflows` `maintenance_issue` action.
5. Progress is changed with percentage buttons through `updateWorkOrder`.
6. Files are attached through the generic work-order attachment route and reviewed by an administrator.
7. A separate read-only Agent Studio action can prepare a maintenance briefing.

The storage is real and property-scoped after migration 0076, but this is not yet a complete maintenance workflow.

## Findings register

### ID: MT-001
Module: AAIQ Maintenance
Category: Screen
Severity: High
Title: Maintenance opens a generic department shell
Current Behavior: `/maintenance` renders `PropertyOperationsClient`, including controls and source-import language that also serve housekeeping and compliance.
Expected Behavior: Maintenance must open a purpose-built defect, diagnosis, repair, verification, and return-to-service workspace.
Evidence: `app/maintenance/page.tsx`; `app/property-operations/property-operations-client.tsx`; `app/globals.css` `.po-*` rules.
Related Findings: MT-005, MT-011
Suggested Fix Module: Maintenance defect-to-repair chain

### ID: MT-002
Module: AAIQ Maintenance
Category: Workflow
Severity: High
Title: Issue intake does not preserve a canonical source and idempotency identity
Current Behavior: `createMaintenanceIssue` accepts a title, description, room, and caller-selected priority. It does not store a normalized source type/reference, duplicate key, risk facts, guest impact, or safety facts.
Expected Behavior: Every request must preserve its source, deduplicate retried intake, record risk facts, and create exactly one canonical case and work order.
Evidence: `db/property-workflows.ts:createMaintenanceIssue`; `app/api/operations/workflows/route.ts`.
Related Findings: MT-004, MT-012
Suggested Fix Module: Maintenance defect-to-repair chain

### ID: MT-003
Module: AAIQ Maintenance
Category: Function
Severity: Critical
Title: Assignment is not based on an eligible property roster
Current Behavior: Assignment reuses the least-loaded `assigned_to` string already present on another work order, or falls back to the literal `Maintenance queue`.
Expected Behavior: AAIQ must choose only active Maintenance employees assigned to the same property, explain the selection, and leave the case in an explicit unassigned exception state when no eligible person exists.
Evidence: `db/property-workflows.ts:createMaintenanceIssue`; `property_assignments` and `staff_members` schemas.
Related Findings: MT-010
Suggested Fix Module: Maintenance defect-to-repair chain

### ID: MT-004
Module: AAIQ Maintenance
Category: Function
Severity: High
Title: Priority and SLA are not derived from verified risk facts
Current Behavior: The caller selects a priority and every request receives a 30-minute due time.
Expected Behavior: A deterministic, explainable classifier must derive priority and response target from safety, active leak/flood, electrical/fire/gas indicators, guest impact, room outage, and urgency facts. Life-safety indicators must create a human emergency hold, not autonomous repair authority.
Evidence: `db/property-workflows.ts:createMaintenanceIssue`; `db/digital-employee-authority.ts` Maintenance authority definitions.
Related Findings: MT-006, MT-010
Suggested Fix Module: Maintenance defect-to-repair chain

### ID: MT-005
Module: AAIQ Maintenance
Category: Workflow
Severity: Critical
Title: No enforceable maintenance state machine exists
Current Behavior: Work advances through free-form percentages and generic statuses. There is no required progression through acknowledgement, diagnosis, repair, testing, supervisor verification, and return to service.
Expected Behavior: A server-enforced state machine must reject skipped transitions and preserve every transition in an append-only trace.
Evidence: `db/property-workflows.ts:updateWorkOrder`; `app/property-operations/property-operations-client.tsx` progress actions.
Related Findings: MT-001, MT-008, MT-012
Suggested Fix Module: Maintenance defect-to-repair chain

### ID: MT-006
Module: AAIQ Maintenance
Category: Security
Severity: Critical
Title: Life-safety and utility hazards do not create a hard human boundary
Current Behavior: A critical priority can be selected, but the runtime does not lock the case into a safety hold or prohibit autonomous shutdown and return-to-service actions.
Expected Behavior: Fire, smoke, gas, electrical arcing, active flooding, medical/security, and other life-safety facts must force `SAFETY_HOLD`, notify management, and require a qualified human clearance before work can resume.
Evidence: `db/property-workflows.ts`; `db/digital-employee-authority.ts` defines `LIFE_SAFETY_SHUTDOWN` as `HUMAN_REQUIRED` but the work-order runtime does not enforce it.
Related Findings: MT-004, MT-005
Suggested Fix Module: Maintenance defect-to-repair chain

### ID: MT-007
Module: AAIQ Maintenance
Category: Workflow
Severity: High
Title: Asset, warranty, parts, and vendor facts are disconnected from repair decisions
Current Behavior: Room work orders may receive an `asset_id`, but Maintenance does not display or require asset identity, warranty status, parts availability, or an approval-gated procurement path.
Expected Behavior: The workflow must expose the scoped asset, warranty facts and open history; allow local parts reservations; and prepare, never submit, an external purchase/vendor request without approval.
Evidence: `property_assets`, `supply_inventory`, `inventory_requisitions`, `inventory_purchase_orders`; `db/property-assets.ts`; `db/property-intelligence.ts`.
Related Findings: MT-009
Suggested Fix Module: Maintenance defect-to-repair chain

### ID: MT-008
Module: AAIQ Maintenance
Category: Workflow
Severity: Critical
Title: Evidence review is generic and does not prove return to service
Current Behavior: Four generic attachment areas can be manager-approved. File receipt is now truthfully labeled, but the workflow does not require diagnosis, repair actions, test readings, a separate verifier, or a return-to-service decision.
Expected Behavior: Completion must require the configured evidence areas, repair/test records, no open safety hold, and approval by an authorized verifier who is not the repair performer.
Evidence: `db/property-workflows.ts:updateWorkOrder`, `saveAttachment`, and `decideEvidenceReview`.
Related Findings: MT-005, MT-006
Suggested Fix Module: Maintenance defect-to-repair chain

### ID: MT-009
Module: AAIQ Maintenance
Category: Reporting
Severity: High
Title: Repair history cannot support downtime, MTTR, repeat-failure, warranty, or lifecycle reporting
Current Behavior: Generic work-order facts provide counts and status but no structured diagnosis, failure code, outage interval, repair action, test result, parts usage, warranty disposition, or return-to-service record.
Expected Behavior: Structured, property-scoped events must support drill-down from portfolio totals to the underlying case, action, evidence, and verifier.
Evidence: `db/reporting-layer.ts`; `db/reporting-insights.ts`; current `operational_work_orders` columns.
Related Findings: MT-007, MT-012
Suggested Fix Module: Maintenance defect-to-repair chain

### ID: MT-010
Module: AAIQ Maintenance
Category: Workflow
Severity: High
Title: No durable SLA escalation or unassigned-case exception exists
Current Behavior: A due timestamp is written, but there is no scheduled maintenance monitor or explicit assignment exception created when the queue cannot be staffed.
Expected Behavior: A scheduled monitor must flag overdue acknowledgement/repair/verification targets, preserve idempotency, and route an actionable exception to management.
Evidence: `worker/index.ts`; `automation_exceptions`; `db/property-workflows.ts:createMaintenanceIssue`.
Related Findings: MT-003, MT-004
Suggested Fix Module: Maintenance defect-to-repair chain

### ID: MT-011
Module: AAIQ Maintenance
Category: Function
Severity: Medium
Title: The real briefing agent is isolated from the Maintenance workspace
Current Behavior: A read-only, source-citing Maintenance briefing agent exists only through Agent Studio.
Expected Behavior: Maintenance should expose a clearly labeled briefing action, show credential/configuration failures honestly, and never imply that a model executed repair work.
Evidence: `app/server/agents/maintenance-briefing-agent.ts`; `app/api/v1/agent-studio/route.ts`; `app/maintenance/page.tsx`.
Related Findings: MT-001
Suggested Fix Module: Maintenance defect-to-repair chain

### ID: MT-012
Module: AAIQ Maintenance
Category: Duplication
Severity: High
Title: Maintenance mutations share a broad generic endpoint and generic progress contract
Current Behavior: Maintenance creation, generic progress, night-report import, compliance generation, and evidence decisions share `/api/operations/workflows`.
Expected Behavior: Maintenance must have a dedicated API contract with allowlisted actions, property and role checks, transition guards, replay protection, and a trace endpoint.
Evidence: `app/api/operations/workflows/route.ts`; `db/property-workflows.ts`.
Related Findings: MT-002, MT-005
Suggested Fix Module: Maintenance defect-to-repair chain

### ID: MT-013
Module: AAIQ Maintenance
Category: Reporting
Severity: Medium
Title: Maintenance reporting stops at generic counts
Current Behavior: Existing report facts identify maintenance work but do not expose priority/SLA state, safety holds, repeat failures, downtime, verification outcomes, or case trace.
Expected Behavior: Maintenance reporting must publish source-linked facts and offer drill-down to the exact case and evidence without manufacturing metrics.
Evidence: `db/reporting-insights.ts`; `db/reporting-layer.ts`; `/api/v1/reports/*`.
Related Findings: MT-009
Suggested Fix Module: Maintenance defect-to-repair chain

### ID: MT-014
Module: AAIQ Maintenance
Category: Function
Severity: High
Title: The UI can imply AI inspection or operational execution that no connector performs
Current Behavior: Shared wording can suggest AI review or automated work even though uploads receive only integrity intake and the briefing agent is read-only.
Expected Behavior: Every status must distinguish uploaded, human-reviewed, model-reviewed, connector-blocked, proposed, and externally executed states.
Evidence: `db/property-workflows.ts:saveAttachment`; `app/property-operations/property-operations-client.tsx`; `app/server/agents/maintenance-briefing-agent.ts`.
Related Findings: MT-008, MT-011
Suggested Fix Module: Maintenance defect-to-repair chain

## Remediation contract

This repair will implement one bounded workflow:

`verified intake → explainable risk triage → eligible property assignment → acknowledgement → diagnosis → repair record → evidence/test gate → independent return-to-service review → report facts and trace`

The following remain deliberately outside this repair:

- physical repair, physical safety inspection, or legal sign-off by a Digital Employee;
- autonomous vendor commitment, purchase-order submission, spending, shutdown, or room release;
- claiming image/video defect detection until a governed vision provider is configured and verified;
- fabricating missing asset, warranty, room, employee, part, or test facts.

## Definition of done

- A dedicated Maintenance page and API replace the generic maintenance shell.
- Cross-property access and cross-property parent/asset references are rejected.
- Intake is idempotent and the server derives priority/SLA from recorded facts.
- Assignment uses an active, same-property Maintenance roster or creates an explicit unassigned exception.
- A server-enforced state machine blocks skipped transitions.
- Life-safety conditions create a non-bypassable human safety hold.
- Parts reservations cannot exceed property stock; procurement remains approval-gated.
- Return to service requires evidence, repair/test facts, and a separate authorized verifier.
- Every mutation and decision emits an audit event; report facts link to the source case.
- Targeted tests, migration verification, production build, and the full regression suite pass.

## Remediation disposition — 2026-08-03

The bounded code remediation is complete. MT-001 through MT-014 are resolved in the application implementation as follows:

- MT-001, MT-012: `/maintenance` now uses a dedicated client and four dedicated, allowlisted API surfaces rather than `PropertyOperationsClient` and the broad operations mutation endpoint.
- MT-002, MT-004: intake stores source identity, a per-property idempotency key, normalized risk facts, server-derived priority and response target, and a non-bypassable safety-hold state.
- MT-003: assignment is limited to active same-property Maintenance staff, prefers clocked-in staff, balances open workload, records the assignment reason, and creates an exception when no eligible technician exists.
- MT-005, MT-006: a server-enforced transition graph requires acknowledgement, diagnosis, repair action, test result, verification request, and independent return-to-service review. The active-warranty gate blocks repair until authorization or non-applicability is documented.
- MT-007: property stock is reserved atomically; insufficient stock creates a human approval exception and never claims a purchase or financial commitment.
- MT-008, MT-014: four required evidence views are private, hashed, deduplicated, and labeled `UPLOAD_INTEGRITY_ONLY_V1`. No visual inspection claim is made without a governed provider.
- MT-009, MT-013: every case transition emits source-linked reporting facts and exposes a complete property-scoped case trace.
- MT-010: the scheduled worker creates idempotent SLA-breach exceptions and notifications.
- MT-011: the Maintenance workspace exposes the existing read-only, source-cited briefing agent and reports connector/configuration failures honestly.

This disposition does **not** relabel the module `working_verified`. Real property rosters/assets, private media, notification delivery, representative work orders, safety-clearance behavior, independent manager review, and source-to-report drill-down still require authorized pilot UAT at both properties.
