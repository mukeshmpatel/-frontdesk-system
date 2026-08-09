# Batch 3 — Compliance Inspection-to-Closure Discovery Findings

Date: 2026-08-03  
Scope: `AAIQ_COMPLIANCE_CENTER` governed inspection from approved rule source through independently reviewed closure  
Phase: Discovery completed before remediation code

## Preserved owners

- Canonical module and route: `AAIQ_COMPLIANCE_CENTER` → `/compliance-center`
- Existing property task ledger: `operational_work_orders`
- Existing template owner: `maintenance_compliance_templates`
- Existing asset owner: `property_assets`
- Existing staff/property access: `staff_members`, `property_assignments`, `activeStaffContext`
- Existing private evidence owner: `work_order_attachments`, `work_evidence_reviews`, private `MEDIA`
- Existing automation exception/notification owners: `automation_exceptions`, `staff_notifications`
- Existing reporting/audit owners: `emitReportEvent`, `system_audit_trail`
- Existing agent identity: `compliance-inspector`

The repair must extend these owners. It must not create another navigation module, property master, employee directory, asset registry, media store, exception queue, reporting system, or audit service.

## Findings register

### ID: CP-001
Module: AAIQ Compliance Center
Category: Screen
Severity: Critical
Title: Compliance is still a themed generic operations shell
Current Behavior: `/compliance-center` renders `PropertyOperationsClient`; Housekeeping, Maintenance, and Compliance share one progress/evidence interaction model.
Expected Behavior: Compliance needs a dedicated due-rule, inspection, measurement, exception, remediation, and sign-off workspace.
Evidence: `app/compliance-center/page.tsx`; `app/property-operations/property-operations-client.tsx`.
Related Findings: CP-005, CP-009
Suggested Fix Module: Compliance inspection-to-closure chain

### ID: CP-002
Module: AAIQ Compliance Center
Category: Function
Severity: High
Title: Default templates mutate data during ordinary reads
Current Behavior: `getPropertyWorkflows` calls `ensureComplianceTemplates` whenever the shared page loads.
Expected Behavior: Baseline provisioning must run through an explicit/scheduled, audited, idempotent automation job—not as a hidden read side effect.
Evidence: `db/property-workflows.ts:getPropertyWorkflows`, `ensureComplianceTemplates`.
Related Findings: CP-003
Suggested Fix Module: Compliance inspection-to-closure chain

### ID: CP-003
Module: AAIQ Compliance Center
Category: Workflow
Severity: Critical
Title: Templates lack an approved governing source and applicability record
Current Behavior: Seeded names and instructions have no property-approved SOP, jurisdiction, citation, effective date, source status, or licensed-signoff requirement.
Expected Behavior: AAIQ may prepare an operational baseline, but it must never call a property compliant until the governing source and applicability are configured and cited.
Evidence: `maintenance_compliance_templates` baseline/migration schema; `ensureComplianceTemplates` seed values.
Related Findings: CP-011, CP-012
Suggested Fix Module: Compliance inspection-to-closure chain

### ID: CP-004
Module: AAIQ Compliance Center
Category: Workflow
Severity: Critical
Title: Missing target assets silently become property-wide inspections
Current Behavior: `generateComplianceAssignments` falls back to `{id:null,name:'Property-wide'}` when an expected pool, extinguisher, room, or HVAC asset is absent.
Expected Behavior: Missing required assets must create a configuration exception and block that inspection instance; scope must never be invented.
Evidence: `db/property-workflows.ts:generateComplianceAssignments`.
Related Findings: CP-003, CP-006
Suggested Fix Module: Compliance inspection-to-closure chain

### ID: CP-005
Module: AAIQ Compliance Center
Category: Workflow
Severity: Critical
Title: Arbitrary progress percentages replace a controlled inspection lifecycle
Current Behavior: Operators can select 0/25/50/75/100, and generic progress logic may move an assignment toward completion.
Expected Behavior: Server transitions must require assignment, acknowledgement, inspection responses, exception handling, evidence, and independent review in order.
Evidence: `PropertyOperationsClient` progress buttons; `db/property-workflows.ts:updateWorkOrder`.
Related Findings: CP-001, CP-007
Suggested Fix Module: Compliance inspection-to-closure chain

### ID: CP-006
Module: AAIQ Compliance Center
Category: Function
Severity: Critical
Title: Assignment uses a queue label rather than an eligible person
Current Behavior: Generated work is assigned to the literal `Maintenance compliance queue`.
Expected Behavior: Assignment must select an active, same-property Compliance/qualified inspection role, explain the choice, or create an unassigned exception.
Evidence: `db/property-workflows.ts:generateComplianceAssignments`; `property_assignments`.
Related Findings: CP-004, CP-010
Suggested Fix Module: Compliance inspection-to-closure chain

### ID: CP-007
Module: AAIQ Compliance Center
Category: Function
Severity: Critical
Title: Ordered instruction checkboxes do not record inspection facts
Current Behavior: A step is only complete/incomplete; readings, units, pass/fail/not-applicable result, deficiency reason, and measurement validation are absent.
Expected Behavior: Each required checklist item must store typed results and enforce configured ranges before review.
Evidence: `work_order_steps`; `seedGuidedSteps`; `toggleWorkOrderStep`.
Related Findings: CP-005, CP-008
Suggested Fix Module: Compliance inspection-to-closure chain

### ID: CP-008
Module: AAIQ Compliance Center
Category: Workflow
Severity: Critical
Title: Failed life-safety findings do not create a fail-closed hold and remediation chain
Current Behavior: Instructions tell users to escalate, but no durable failed item, safety hold, exception, linked remediation, owner, or clearance record is required.
Expected Behavior: Critical failed items must automatically block closure, create a management exception, link corrective work, and require qualified human clearance.
Evidence: `complianceSteps`; `generateComplianceAssignments`; generic evidence review.
Related Findings: CP-007, CP-011
Suggested Fix Module: Compliance inspection-to-closure chain

### ID: CP-009
Module: AAIQ Compliance Center
Category: Workflow
Severity: High
Title: Generic photo coverage can stand in for compliance evidence
Current Behavior: Compliance reuses Maintenance evidence areas and file receipt can advance generic completion without mapping evidence to a rule/checklist item.
Expected Behavior: Evidence must be private, hashed, mapped to the inspection/item, truthfully labeled, and reviewed independently; receipt is not compliance verification.
Evidence: `requiredEvidenceAreas`; `saveAttachment`; `work_evidence_reviews`; shared UI.
Related Findings: CP-001, CP-012
Suggested Fix Module: Compliance inspection-to-closure chain

### ID: CP-010
Module: AAIQ Compliance Center
Category: Workflow
Severity: High
Title: No scheduled, idempotent due/overdue automation exists
Current Behavior: An administrator must press Generate; templates are not advanced after closure and overdue acknowledgement/review is not monitored.
Expected Behavior: A scheduled job must provision baselines, create each due instance once, assign or escalate it, remind overdue owners, and advance the next due date only after approved closure.
Evidence: `worker/index.ts`; `generateComplianceAssignments`; template `next_due_at`.
Related Findings: CP-002, CP-006
Suggested Fix Module: Compliance inspection-to-closure chain

### ID: CP-011
Module: AAIQ Compliance Center
Category: Security
Severity: Critical
Title: Legally or professionally reserved sign-off is not enforced
Current Behavior: Generic administrator evidence approval does not establish inspector qualification, independent reviewer, certificate identity, or reserved human authority.
Expected Behavior: Licensed/manager sign-off must be explicitly configured, recorded by an authorized different person, and impossible for the Digital Employee to perform.
Evidence: `digital-employee-authority.ts` labels `LEGAL_SIGN_OFF` human-required, but the shared execution flow does not enforce it.
Related Findings: CP-003, CP-008
Suggested Fix Module: Compliance inspection-to-closure chain

### ID: CP-012
Module: AAIQ Compliance Center
Category: Reporting
Severity: High
Title: Generic assignment counts cannot prove compliance posture
Current Behavior: Reporting exposes only counts of compliance work and evidence files.
Expected Behavior: Reports must drill from property/program/due status to source, target asset, checklist results, failures, remediation, evidence, reviewer, and immutable trace without interpreting missing data as compliant.
Evidence: `db/reporting-layer.ts`; `db/reporting-insights.ts`.
Related Findings: CP-003, CP-007, CP-009
Suggested Fix Module: Compliance inspection-to-closure chain

### ID: CP-013
Module: AAIQ Compliance Center
Category: Function
Severity: Medium
Title: Compliance Inspector exists in catalogs but has no bounded runtime duty chain
Current Behavior: Agent and authority entries describe due-item summaries, but the Compliance page does not register or display a trigger-to-action-to-verification duty or cite operational sources.
Expected Behavior: AAIQ must register one truthful Digital Compliance Coordinator duty with allowed autonomous steps, human gates, retry policy, escalation conditions, and trace.
Evidence: `db/agent-platform.ts`; `db/digital-employee-authority.ts`; shared Compliance blueprint.
Related Findings: CP-001, CP-010
Suggested Fix Module: Compliance inspection-to-closure chain

### ID: CP-014
Module: AAIQ Compliance Center
Category: Security
Severity: High
Title: Dedicated action and trace contracts are absent
Current Behavior: Compliance generation, progress, step toggles, evidence, and unrelated workflows share `/api/operations/workflows`.
Expected Behavior: Dedicated allowlisted routes must enforce module access, active property, actor eligibility, transition rules, evidence limits, and a property-scoped trace.
Evidence: `app/api/operations/workflows/route.ts`.
Related Findings: CP-005, CP-011
Suggested Fix Module: Compliance inspection-to-closure chain

## Bounded remediation contract

`approved rule source → due instance → verified target → eligible assignment → acknowledgement → typed inspection results → automatic failure/hold/remediation → private evidence → independent qualified review → next due date → source-linked report and trace`

## Permanent human boundaries

- physical inspection, measurement, testing, repair, and emergency response;
- professional, licensed, regulatory, insurer, brand, or legal sign-off;
- waiver approval, deadline change, or applicability determination;
- public filing/submission, vendor commitment, shutdown, spending, or room/asset release;
- image/video judgment until a governed provider is configured and certified.

## Definition of done

- Dedicated Compliance page and API replace the shared shell.
- No template/program is created during an ordinary GET.
- Every active program has an explicit source status; missing sources remain configuration-required.
- Missing assets create exceptions rather than fabricated property-wide scope.
- Same-property eligible assignment or explicit unassigned state is enforced.
- Typed required responses and range checks block skipped or false completion.
- Failed critical items create a hold, exception, and linked remediation path.
- Evidence is private, hashed, item-linked, and never self-certifies.
- Independent authorized review is enforced; legally reserved sign-off stays human-only.
- Closure advances the next due date exactly once and emits report/audit facts.
- Scheduled automation is idempotent and escalates overdue work.
- Migration replay, rollback preservation, build, targeted tests, and complete regression pass.

Confirmed discovery boundary: HNE Core and the GitHub repository were not inspected or modified.

## Remediation disposition — 2026-08-03

All fourteen findings were addressed in the preserved `AAIQ_COMPLIANCE_CENTER` owner without creating a competing module:

- CP-001/CP-005/CP-007: the generic shell and arbitrary progress controls were replaced by a dedicated server-controlled inspection lifecycle with typed, required responses.
- CP-002/CP-003: ordinary GET requests no longer provision templates; explicit and scheduled baseline preparation is idempotent and every program remains configuration-required until a manager cites the real source, jurisdiction, effective date, and required critical measurement ranges.
- CP-004/CP-006: exact registered assets and eligible same-property inspectors are required; missing targets or staff produce governed exceptions instead of invented scope or queue identities.
- CP-008/CP-011: failed items automatically create linked Maintenance remediation; critical failures enter a non-waivable hold and reserved/qualified closure remains an independent human action.
- CP-009: evidence is private, hashed, mapped to case/item/type, labeled upload-integrity-only, and separately reviewed. File receipt is never treated as visual or compliance approval.
- CP-010: scheduled due-case creation and overdue escalation are idempotent, auditable, and wired into the existing worker schedule. Scheduler failures now produce a system audit event.
- CP-012: every case emits central report facts and exposes source, target, measured results, remediation, evidence, review, exception, and immutable trace drill-down.
- CP-013: the bounded Digital Compliance duty is registered with trigger, sources, actions, verification, retry, escalation, and permanent human boundaries.
- CP-014: dedicated allowlisted APIs enforce module access, property scope, actor eligibility, state rules, file controls, and trace access.

Automated evidence: `tests/batch3-compliance-inspection-chain.test.mjs`, the full migration replay, production build, and complete application regression. Real-property source approval, asset/staff configuration, private media, notification delivery, and authorized UAT remain external/configuration gates and are not represented as verified.
