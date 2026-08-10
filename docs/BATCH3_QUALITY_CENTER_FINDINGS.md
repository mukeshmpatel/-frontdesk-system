# Batch 3 Workflow 5 — AAIQ Quality Center Discovery Findings

Date: 2026-08-03  
Scope: the preserved `AAIQ_QUALITY_CENTER`, Module 15 evaluation tables, strict capability ledger, Role Parity policy cases, and production shadow evidence.  
Constraint: discovery only at the time this register was written. HNE Core and GitHub were not touched.

## Canonical owner and bounded workflow

The canonical owner remains `AAIQ_QUALITY_CENTER`, surfaced as **AAIQ Truth & Verification Center**. This repair must not create a second QA page, a second role catalog, or a second capability ledger.

The bounded workflow to repair is:

`canonical Digital Employee duty → versioned golden cases → property-scoped batch execution → deterministic outcome and regression comparison → release gate → sampled live work → human shadow review → auditable drill-down`

Structural route/schema probes remain a separate diagnostic tool. They may detect deployment problems but can never certify a Digital Employee task or release.

## Findings register

### QC-001 — Module 15 schema is disconnected from the product

- Severity: Critical
- Category: Function / Workflow
- Current behavior: `eval_cases`, `eval_runs`, and `shadow_audits` exist, but no service prepares cases, executes a batch, samples live actions, reviews a flag, or displays these records.
- Expected behavior: every canonical Digital Employee duty has executable evidence or a truthful instrumentation/configuration blocker.
- Evidence: `migrations/0058_digital_employee_evals.sql`; no runtime references outside tests and schema searches.
- Repair boundary: extend the preserved Quality Center service and route.

### QC-002 — “QA score” measures page rendering, not task correctness

- Severity: High
- Category: Reporting / Screen
- Current behavior: a response code, byte count, and text marker produce PASS/WARN/FAIL and a numerical score.
- Expected behavior: structural checks stay explicitly separate; the primary release decision is derived from task cases, critical failures, regressions, and reviewed production evidence.
- Evidence: `app/api/v1/quality-center/route.ts`; `db/quality-center.ts`.

### QC-003 — No golden-library preparation path

- Severity: High
- Category: Workflow
- Current behavior: the canonical Role Parity tasks and their independent adversarial policy scenarios are not materialized into Module 15 cases.
- Expected behavior: AAIQ automatically prepares stable, property-scoped deterministic cases from the canonical role/task catalog and records their source/version. It must not invent business facts.
- Evidence: `db/role-parity.ts`; `lib/role-parity-policy.mjs`; `migrations/0058_digital_employee_evals.sql`.

### QC-004 — No batch, baseline, or regression gate

- Severity: Critical
- Category: Function / Workflow
- Current behavior: `run_batch_id` is only an unowned string and no batch summary or deployment decision exists.
- Expected behavior: a role suite produces one durable batch, compares to the last passing baseline, blocks on any critical failure, requires review for major failure/regression, and never self-approves a release.
- Evidence: `migrations/0058_digital_employee_evals.sql`.

### QC-005 — No case-level result drill-down

- Severity: High
- Category: Screen / Reporting
- Current behavior: users cannot see scenario input, expected decision, actual decision, severity, or reason for a task failure.
- Expected behavior: each batch opens to exact cases and source task identity, with failures first and an audit correlation ID.
- Evidence: `app/aaiq-quality-center/quality-center-client.tsx`.

### QC-006 — Production shadow monitoring is a dormant table

- Severity: Critical
- Category: Function / Workflow
- Current behavior: completed Digital Employee queue items are not sampled; missing verification, missing evidence, failure, retry, escalation, or low-confidence work is not surfaced in Module 15.
- Expected behavior: an idempotent property-scoped sampler creates a review queue and explains every automatic flag. No live action is modified by the sampler.
- Evidence: `shadow_audits`; `digital_employee_work_queue`.

### QC-007 — No independent shadow-review path

- Severity: High
- Category: Workflow / Security
- Current behavior: no reviewer can confirm or clear a shadow flag and no central audit event records that decision.
- Expected behavior: authorized administrators review flags with a reason; confirmed critical findings fail safe and remain visible to autonomy controls.
- Evidence: no runtime action for `shadow_audits`.

### QC-008 — Eval roles and property are not navigable

- Severity: Medium
- Category: Screen
- Current behavior: the page shows an enterprise-wide ledger and structural results but no role selector, coverage counts, run action, gate state, or selected-batch details for the active property.
- Expected behavior: least-technical administrators can answer: what role is covered, what ran, what failed, what is blocked, and what needs a human.
- Evidence: `app/aaiq-quality-center/quality-center-client.tsx`.

### QC-009 — Judged and hybrid cases lack a configured judge boundary

- Severity: High
- Category: Function / Security
- Current behavior: the schema allows `JUDGED` and `HYBRID`, but there is no independent judge contract, pinned version, rubric execution, or truthful unavailable state.
- Expected behavior: deterministic policy cases run now; judged/hybrid cases remain visibly blocked until an approved independent judge is configured and certified. They must never silently pass.
- Evidence: `migrations/0058_digital_employee_evals.sql`.

### QC-010 — Existing role-parity evaluation duplicates evidence outside Module 15

- Severity: High
- Category: Duplication
- Current behavior: `digital_role_evaluations` stores policy case results independently while Module 15 tables remain empty.
- Expected behavior: preserve the existing role catalog and policy oracle, but make Quality Center the orchestration and release-gate view. Avoid creating another role/task model.
- Evidence: `db/role-parity.ts`; `migrations/0032_digital_role_parity.sql`; `migrations/0058_digital_employee_evals.sql`.

### QC-011 — No scheduled monitoring or automation failure evidence

- Severity: High
- Category: Workflow
- Current behavior: production shadow sampling is not called by the scheduled worker and therefore cannot detect silent failures.
- Expected behavior: scheduled sampling is idempotent, property scoped, read-only toward operational work, and records automation failures centrally.
- Evidence: `worker/index.ts`; no Quality Center monitor call.

### QC-012 — Capability-ledger review is disconnected from role eval evidence

- Severity: Medium
- Category: Workflow / Duplication
- Current behavior: a human can verify a ledger item only from `workflow_verification_runs`; eval batches and reviewed shadow evidence cannot be inspected alongside that proof.
- Expected behavior: preserve the seven-question business-workflow gate while displaying policy regression and shadow evidence as supporting—not substituting—evidence.
- Evidence: `db/capability-ledger.ts`.

### QC-013 — Three unlabeled buttons appear in the generated ledger

- Severity: Low
- Category: Screen
- Current behavior: source inventory reports unlabeled Quality Center buttons, reducing audit usefulness and accessibility clarity.
- Expected behavior: every action has visible, stable text and an accessible name.
- Evidence: capability baseline references `quality-center-client.tsx` button locations.

### QC-014 — No explicit human boundary at the release decision

- Severity: Critical
- Category: Workflow / Security
- Current behavior: structural PASS/PARTIAL is easy to misread as release approval.
- Expected behavior: AAIQ computes `PASS`, `REVIEW_REQUIRED`, or `BLOCKED`; a named authorized human records the release decision. Critical failures cannot be overridden by UI status selection.
- Evidence: existing structural status and no eval-batch decision model.

## Repair sequence

1. Add only the missing batch/review/monitoring ownership through a forward migration and rollback.
2. Materialize the canonical Role Parity policy scenarios as stable deterministic Module 15 cases.
3. Execute and persist property-scoped role batches with baseline comparison and fail-safe gate logic.
4. Add idempotent shadow sampling and audited human review.
5. Rebuild the existing Quality Center page around role coverage, batch drill-down, release gate, shadow queue, supporting workflow proof, and separately labeled structural diagnostics.
6. Add scheduled sampling, regression tests, build/migration replay, capability baseline regeneration, and complete application regression.

## Non-goals and hard boundaries

- No external LLM judge will be claimed until a separate approved model/version and rubric contract is configured.
- No structural check can verify a business workflow.
- No batch can mark a capability `working_verified`; the preserved seven-question run plus named human review remains mandatory.
- No QA action may execute, retry, undo, or modify the sampled operational action.
- No HNE Core or GitHub change is authorized.

## Remediation disposition

The bounded repair has now been implemented without replacing the preserved Quality Center:

- QC-001, QC-003, QC-004, QC-005, QC-006, QC-007, QC-008, QC-011, and QC-014 are repaired by the canonical Module 15 runtime, migration `0079`, explicit API actions, scheduled sampler, case drill-down, and non-overridable critical gate.
- QC-002 is repaired by making structural diagnostics a collapsed, separately labeled tool whose numerical score is explicitly not a release score.
- QC-009 remains an intentional configuration boundary: judged/hybrid cases display `NOT_CONFIGURED` until an independent model, pinned version, and approved rubric contract exist. No judged result is fabricated.
- QC-010 is contained without deleting preserved evidence: the Role Parity catalog and policy oracle are reused; Quality Center is the release-gate orchestration owner. The older Agent Studio evaluation remains a policy diagnostic, not a competing release gate.
- QC-012 is repaired at the evidence-view level: stored seven-question workflow runs appear alongside—but are not replaced by—policy batches and shadow findings.
- QC-013 is repaired with visible labels and accessible names for every new action.

Automated verification and remaining external gates are recorded in `docs/BATCH3_QUALITY_CENTER_IMPLEMENTATION.md`.
