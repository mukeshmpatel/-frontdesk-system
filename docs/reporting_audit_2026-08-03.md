# AAIQ Reporting Discovery Audit — 2026-08-03

## Scope and preservation decision

This audit was completed before the Release 114 reporting schema or application changes. The existing canonical reporting event/fact layer, tokenized drill-down service, governed CSV export, property scope, report source receipts, and original-source drawer are preserved and extended. No parallel reporting module is being created.

## Immediate defect evidence

| Widget | Source | Current computation | Clickable before repair | Evidence |
|---|---|---|---|---|
| Assigned/open tasks | `operational_work_orders` through `getPropertyWorkflows` | Live, filtered to non-complete/non-verified work and then role department | No | `app/api/v1/command-center/route.ts`; `app/components/aaiq-command-strip.tsx` |
| Critical/urgent tasks | Same scoped work-order result | Live filter where priority is `CRITICAL` | No | Same files; count rendered inside an inert header `span` |
| Primary next action | Same scoped work-order result | First priority-sorted open work order | Yes | Links to `/property-operations` |

The reported “30 tasks / 7 urgent” values are not hardcoded. They are current workflow counts, but the two numbers had no record-list destination. This is why the urgent seven appeared only in the heading.

## Existing dashboard and KPI inventory

| Surface | Widgets / counts | Source tables or service | State before Release 114 |
|---|---|---|---|
| AAIQ role command strip | open work, critical work, primary action, asset findings | property workflows, property assets | counts not clickable; primary action and module cards clickable |
| Enterprise Reporting | labor hours, resolved tasks, maintenance requests, incidents, resolution velocity, housekeeping, maintenance, compliance, critical work, evidence | `report_facts`, synchronized legacy operational tables | clickable tokenized drill-down; source drawer and governed CSV exist |
| Reporting performance distribution | grouped fact values and source record counts | `report_facts` | group rows attempt metric drill-down; some fact-type names do not map to a visible metric |
| Digital Front Desk | open tasks, urgent actions, hours, completion | workforce/front-desk API | decorative KPI tiles; no universal drill-down binding |
| Action Center | due today, overdue, approval queue, high priority | reminders and notification candidates | cards navigate to a section, not an exact filtered record set |
| Pilot Launch Center | ready/total/blocked counts and stage counts | `pilot_launch_tasks` | stage selection works; totals are not record drawers |
| Website Factory | portfolio, published, ready, needs attention | website projects | portfolio sections are functional; summary cards are not universal drill-down widgets |
| Technology and Control modules | module-specific health/status counts | connector, device, quality and audit tables | inconsistent; requires the next Technology & Control audit slice |
| Growth and Revenue | website/channel/review and property-growth counts | website factory and integration sources | partially interactive; no common external-market signal registry yet |

## Existing reporting data assets to reuse

- `report_events`: idempotent cross-module event envelope.
- `report_facts`: property-scoped facts with source table/record identity and dimensions.
- `report_drilldown_tokens`: short-lived user- and organization-bound source sets.
- `report_saved_views`: personal reusable report filters.
- `report_query_metrics`: query duration evidence.
- `report_export_audit`: checksummed export receipt.
- `system_audit_events`: canonical mutation/audit history.
- `operational_work_orders`: canonical cross-department work queue used by the 30/7 counts.

## Duplication and integrity findings

1. `db/reporting-insights.ts` and `db/reporting-layer.ts` both create summary metrics and drill-down tokens. `db/reporting-layer.ts` is the active Enterprise Reporting route and is the canonical owner; the older insights module should be migrated/deprecated in the Technology & Control cleanup, not expanded.
2. The command strip and Reporting Center compute work counts through different service paths. Release 114 introduces one task drill-down query contract so the displayed count and returned row set cannot diverge.
3. Several operational KPI tiles outside Reporting are decorative. They are registered as remediation findings; they are not falsely marked complete in this slice.
4. Existing drill-down tokens return source records but do not consistently provide a UI route back to the owning module. Release 114 adds explicit work-order routes for task rows.

## Release 114 implementation contract

- Add a governed widget/query registry, saved reports, drill-down click log, and module test ledger via forward-only migration.
- Provide one RBAC- and property-scoped task snapshot for total and urgent work.
- Make the command-strip counts clickable and make Enterprise Reporting show the same task surfaces.
- Preserve the existing report filters, grouped analysis, source drawer, CSV export, and event refresh.
- Record click evidence and regression-test that `badge count === returned rows`.

## Deferred findings (not claimed complete)

- Platform-wide conversion of every KPI across all 30 modules.
- Drag-and-drop report builder and scheduled delivery.
- Full Technology & Control remediation.
- External market intelligence and AI Website Factory templates.

Those are sequenced after this reporting foundation, as required by the attached program index.

