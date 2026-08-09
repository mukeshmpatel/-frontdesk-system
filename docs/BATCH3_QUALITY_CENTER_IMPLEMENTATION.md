# Batch 3 Workflow 5 — AAIQ Quality Center Implementation Evidence

Date: 2026-08-03  
Canonical owner: `AAIQ_QUALITY_CENTER` / **AAIQ Truth & Verification Center**  
Status: engineering complete; independent semantic judge, representative live actions, and named property UAT remain required.

## What is now operational

The preserved Module 15 schema is connected to one controlled workflow:

`canonical duty → stable golden cases → role batch → baseline comparison → system release gate → named human decision → scheduled production sampling → reviewed shadow finding → trust/autonomy response`

### Automated by AAIQ

1. A single role selection materializes deterministic cases from the canonical Role Parity task catalog and its independent adversarial policy scenarios.
2. Every run records the catalog, deterministic engine, and prompt-contract versions, exact inputs, expected decisions, actual decisions, latency, and batch correlation.
3. The latest named-human-approved passing batch is used as the regression baseline.
4. A critical failure sets `BLOCKED`; major/minor failures or regressions set `REVIEW_REQUIRED`; a clean run sets `PASS`.
5. Completed Digital Employee queue items are sampled idempotently. Failure/retry, escalation, missing verification, missing audit evidence, and low confidence are classified and explained.
6. The scheduled worker runs this sampler for every property and records both successful and failed monitor runs.
7. Confirmed critical shadow findings write the trust ledger and immediately demote the matching autonomy configuration one level. The sampled operational action is never modified.

### Human-controlled by design

- Provider credentials and access policy.
- Approval of an independent semantic-judge model, pinned version, and rubric contract.
- Final named release approval or rejection.
- Review of a flagged production shadow item.
- Seven-question property workflow verification.

A critical batch cannot be approved in either service logic or database constraints. A policy batch is supporting evidence; it cannot change a capability to `working_verified` without the preserved seven-question workflow run and named human review.

## Files and ownership

- Runtime: `db/quality-evaluations.ts`
- Deterministic gate/classifier: `lib/quality-eval-engine.mjs`
- API owner: `app/api/v1/quality-center/route.ts`
- Existing page repaired in place: `app/aaiq-quality-center/quality-center-client.tsx`
- Scheduled monitoring: `worker/index.ts`
- Additive migration: `migrations/0079_quality_center_eval_runtime.sql`
- Rollback: `migrations/rollbacks/0079_quality_center_eval_runtime_rollback.sql`
- Deployment copy: `deployment/pilot-migrations/0079_quality_center_eval_runtime.sql`
- Regression suite: `tests/batch3-quality-eval-runtime.test.mjs`

## Security, scope, and evidence controls

- All reads and writes are organization- and property-scoped.
- Mutating actions require the active administrator role.
- Opening the Quality Center is read-only and no longer seeds the Role Parity catalog.
- Golden preparation, batch completion, release decision, shadow sampling, sampler failure, and shadow review emit central audit records.
- A reason of at least ten characters is required for release and shadow decisions.
- A shadow item is unique per property/live action and cannot be sampled twice.
- The shadow monitor never retries, cancels, or changes the operational work it evaluates.
- Judged/hybrid evaluation remains visibly unavailable rather than falling back to the Digital Employee itself or silently passing.

## Automated proof

The targeted test suite verifies:

- critical, regression, and clean gate decisions;
- non-overridable critical failures;
- shadow classification of missing/failed evidence;
- exact SQL placeholder/bind parity for every runtime insert;
- property isolation and forward/rollback preservation;
- read-side non-mutation;
- API, scheduled worker, UI drill-down, and structural-vs-functional labeling.

The capability baseline is `2026-08-03-b3-5`. It truthfully labels Quality Center `working_incomplete` until real property samples and named UAT are available; it contains zero self-certified `working_verified` items.

## Property UAT required before verification

For each pilot property:

1. Run one Front Desk role batch and inspect at least one critical case, one normal case, and one approval-required case.
2. Confirm the system gate matches the stored case outcomes.
3. Attempt to approve a deliberately blocked batch and confirm both UI and API reject it.
4. Record a named release decision on a clean or review-required batch.
5. Complete representative Digital Employee work with full proof; run the shadow monitor and confirm it auto-clears without changing the work.
6. Complete a controlled item with missing verification; confirm it enters the review queue.
7. Confirm the finding and verify the trust-ledger entry, central audit record, and fail-safe autonomy demotion.
8. Record the seven-question workflow verification and obtain named authorized review.

Until these steps and an independent judged/hybrid evaluator are certified, the page must continue to show the remaining configuration and human-review boundaries.

Confirmed: HNE Core and GitHub repository were not touched.
