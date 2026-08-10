# Batch 3 — Maintenance Defect-to-Repair Implementation

Date: 2026-08-03  
Capability owner: `AAIQ_MAINTENANCE`  
Status: Engineering complete; real-property configuration and authorized UAT required

## Outcome

The former shared department shell is now a bounded operational workflow. AAIQ can receive a factual defect, derive urgency from recorded risk facts, select an eligible same-property technician, monitor the response target, reserve available local parts, demand the required repair/test evidence, and route the completed case to an independent human for return-to-service review.

AAIQ does not claim to perform physical repair, inspect life-safety conditions, purchase parts, release rooms, or visually analyze media without a configured and certified provider.

## End-to-end workflow

1. **Verified intake** — records source type/reference, room or asset, defect facts, and a property-scoped idempotency key.
2. **Deterministic triage** — the server derives priority, safety hold, explanation, and response target. The operator cannot choose urgency.
3. **Eligible assignment** — only active Maintenance staff assigned to the property are eligible. Clocked-in staff are preferred, then lowest open workload.
4. **Acknowledgement and diagnosis** — the assigned technician acknowledges, starts diagnosis, records a failure code, factual finding, probable cause, and warranty disposition.
5. **Repair and parts** — local inventory can be reserved. Insufficient stock creates an approval exception; AAIQ never places an order or commits funds.
6. **Testing** — a repair record is required before testing, and a passing factual test is required before verification.
7. **Evidence gate** — before, repair-detail, after, and safety-check media are required. Files are private, hashed, deduplicated, and await human or governed-provider review.
8. **Independent decision** — a property manager/supervisor who did not perform the repair confirms the checklist and chooses approved, rework, or safety hold.
9. **Reporting and trace** — transitions emit source-linked report facts; the case trace includes events, diagnoses, repair/test actions, parts, evidence, reviews, and central audit records.
10. **Scheduled escalation** — overdue active cases create one durable management exception and notification rather than silently aging.

## Digital Employee authority

The Digital Maintenance dispatcher may autonomously:

- accept idempotent property-scoped intake;
- apply the versioned deterministic risk/SLA policy;
- select from the eligible property roster;
- maintain the local queue and response timers;
- reserve already-approved property stock;
- request missing records/evidence;
- create exceptions and internal notifications;
- prepare a read-only, source-cited briefing when Agent Studio is configured.

Human action remains mandatory for:

- physical diagnosis, repair, test, and safety inspection;
- clearing a life-safety hold as a qualified person;
- warranty authorization, purchasing, vendor commitment, or spending;
- independent return-to-service approval;
- visual evidence judgment until a governed vision provider is certified.

## Primary implementation

- `lib/maintenance-repair-engine.ts`
- `db/maintenance-repairs.ts`
- `app/maintenance/page.tsx`
- `app/maintenance/maintenance-repair-client.tsx`
- `app/maintenance/maintenance.css`
- `app/api/maintenance/cases/route.ts`
- `app/api/maintenance/cases/[id]/action/route.ts`
- `app/api/maintenance/cases/[id]/evidence/route.ts`
- `app/api/maintenance/cases/[id]/trace/route.ts`
- `worker/index.ts`
- `migrations/0077_maintenance_defect_repair_chain.sql`
- `migrations/rollbacks/0077_maintenance_defect_repair_chain_rollback.sql`
- `tests/batch3-maintenance-defect-repair.test.mjs`

## Verification contract

Automated verification covers deterministic risk classification, guarded state transitions, safety clearance, evidence requirements, property isolation, idempotency, append-only events, rollback preservation, dedicated routing/UI, worker escalation wiring, truthful provider labeling, independent review, and SQL placeholder/bind parity.

Final release verification passed:

- 8/8 targeted Maintenance and role-separation tests;
- 78/78 forward migrations applied with the populated Release 68 preservation record intact;
- 33 unique navigation entries and 165 migration-owned tables with no canonical-owner collision;
- production Vinext/Vite build, including all four dedicated Maintenance API routes;
- 264/264 complete application regression tests;
- capability baseline `2026-08-03-b3-3`: 564 inventoried items and zero `working_verified` claims.

The production capability remains `working_incomplete` until both pilot properties complete representative human UAT with real staff, assets, private media, notification delivery, and drill-down report review. No test fixture or operator assertion upgrades this status automatically.

## Deployment

`deployment/Deploy-AAIQ-Pilot.ps1` copies every numbered migration from `migrations/` into the deployment migration directory before running the forward-only D1 migration command. Migration `0077` is therefore packaged by the release deployment flow; its rollback is retained for controlled non-production recovery planning and is never auto-run in production.

Confirmed: HNE Core and the GitHub repository were not modified.
