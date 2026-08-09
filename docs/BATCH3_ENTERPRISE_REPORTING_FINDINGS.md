# Batch 3 — AAIQ Enterprise Reporting findings

Status: discovery complete; repair authorized by Mukesh  
Workflow under repair: source record → governed report → exact drill-down → owning workflow → governed export  
Preservation boundary: extend the existing Enterprise Reporting Center and `db/reporting-layer.ts`; do not create a second reporting product and do not modify HNE core.

## User outcome

An authorized user must be able to select a property and period, see totals that reconcile to that property's canonical operational records, click every displayed number to see exactly the rows counted, open the owning workflow, compare with the immediately preceding equal-length period, save a property-scoped view, and export the same rows to audited CSV. Unsupported data areas must say which connection or source is missing instead of showing invented zeroes or placeholder reports.

## Canonical ownership decision

- Canonical reporting service: `db/reporting-layer.ts`.
- Canonical task source: `operational_work_orders` and `work_order_attachments`.
- Canonical front-desk source: `front_desk_operational_records`.
- Canonical workforce source: property-scoped `time_entries`.
- Existing task/urgent-task cards are preserved because their badge totals and rows already use one property-scoped query.
- `db/reporting-insights.ts` is duplicate legacy ownership and must become a compatibility wrapper only.
- Event/fact tables remain an audit/event projection; they are not permitted to overwrite or silently infer canonical property identity during a report read.

## Findings register

### RPT-001 — report reads mutate storage

- Severity: Critical
- Category: data integrity / workflow
- Evidence: `reportDashboardSummary()` and `universalReport()` call `synchronizeLegacyReportFacts()`. That function inserts facts and events during GET requests. `recordQuery()` also inserts telemetry on every report read.
- Impact: refreshing a screen changes business evidence; a read cannot be reproduced as a read-only operation.
- Repair: remove all synchronization and telemetry writes from report GET paths. Keep writes only for explicit saved-view, export, task-click, and report-run actions.

### RPT-002 — active-property reads can misassign records

- Severity: Critical
- Category: data isolation
- Evidence: `synchronizeLegacyReportFacts()` copies every organization `time_entries` and `front_desk_items` row into the property currently being viewed. Legacy front-desk records have no property column.
- Impact: records from one hotel can be represented as belonging to another.
- Repair: never project organization-wide legacy rows into a selected property. Read only canonical property-scoped sources. Unsupported legacy-only records remain unavailable until reconciled.

### RPT-003 — event cursor crosses property boundaries

- Severity: Critical
- Category: RBAC / data isolation
- Evidence: `reportEventCursor()` filters only by organization and cursor.
- Impact: event metadata from another authorized or unauthorized property can appear in the current property screen.
- Repair: require an authorized property scope and filter every event cursor query by `property_id`.

### RPT-004 — saved views collide across properties

- Severity: High
- Category: data model
- Evidence: `report_saved_views` is unique on organization, user, and name; it has no `property_id`.
- Impact: saving “Morning report” at one property can overwrite the other property's filters.
- Repair: additive forward migration adds `property_id`, backfills from a canonical property, and replaces the unique index with organization/property/user/name.

### RPT-005 — summary refresh creates expiring token rows

- Severity: High
- Category: reliability
- Evidence: each metric produced by `reportDashboardSummary()` inserts a new `report_drilldown_tokens` row. Live event refresh can invoke the summary repeatedly.
- Impact: unbounded storage growth and drill-down behavior tied to an expiring snapshot rather than the visible filters.
- Repair: new reports use direct, authorized metric drill-down queries. Legacy token reads remain compatibility-only and become property-scoped.

### RPT-006 — duplicate reporting services disagree

- Severity: High
- Category: duplication
- Evidence: `db/reporting-layer.ts` and `db/reporting-insights.ts` both implement totals, tokens, and drill-down queries. The drill-down route imports the older service while the summary route imports the newer service.
- Impact: totals and drill-down records can come from different rules and tables.
- Repair: one canonical service. The old file may only re-export compatibility functions from it.

### RPT-007 — report catalog controls are shells

- Severity: High
- Category: UI / workflow
- Evidence: catalog buttons in `app/reports/pms-reporting-center.tsx` only set notices; revenue reports are disabled and no source-availability contract is shown.
- Impact: users see report names that do not produce a report.
- Repair: every enabled catalog item must select and run a real report. Reports without a property-scoped source must be visibly unavailable with the exact connection/configuration needed.

### RPT-008 — displayed totals and drill-down rows are separable

- Severity: High
- Category: reporting correctness
- Evidence: group rows try to match `factType` values against dashboard metric identifiers. Several rows have no working drill-down. The “source record” drawer re-displays normalized output instead of opening the canonical source.
- Impact: a user cannot prove what was counted.
- Repair: totals and rows must be produced by the same adapter and filters. Every returned record includes source table/id, a human label, and an owning workflow route.

### RPT-009 — comparison and trends are placeholders

- Severity: High
- Category: reporting correctness
- Evidence: the UI sends `compare=prior`; `universalReport()` ignores it and dashboard trends are hardcoded `FLAT`.
- Impact: trend claims are not source-backed.
- Repair: calculate the immediately preceding equal-length period using the same query contract and return current value, prior value, absolute change, percentage change, and a truthful trend state.

### RPT-010 — report title is hardcoded to one property

- Severity: Medium
- Category: UI
- Evidence: the report interface contains Wyndham Garden Salina wording regardless of active property.
- Impact: a Days Inn report can appear under the wrong hotel name.
- Repair: render canonical property name/code/address from the authorized report response.

### RPT-011 — department and employee access is inconsistent

- Severity: Critical
- Category: RBAC
- Evidence: summary filters non-admin users by `employee_email`, while tasks allow assigned employee or department. Several report routes omit UAT/module authorization entirely.
- Impact: a supervisor can see empty totals despite valid department scope, while other routes can bypass the reporting authorization pattern.
- Repair: all report routes use the same reporting access gate. Admin sees the property; non-admin sees assigned records plus their authorized department. Employee filters are admin-only.

### RPT-012 — source projections become stale

- Severity: High
- Category: reporting correctness
- Evidence: labor facts are emitted at clock-in with zero hours and are not updated on clock-out; source status changes do not update old facts.
- Impact: stored facts disagree with canonical records.
- Repair: operational reports calculate from current canonical source rows. Event/fact projections remain audit evidence, not the authoritative operational total.

### RPT-013 — event writers omit property identity

- Severity: Critical
- Category: data isolation
- Evidence: `emitReportEvent()` defaults absent property to `primary`; canonical front-desk and workforce writers have property context but omit it.
- Impact: events can be attributed to a false property.
- Repair: missing property becomes `UNASSIGNED`, never a real property. Canonical property-aware writers must pass the explicit property id.

### RPT-014 — legacy operations emitters are misplaced

- Severity: Critical
- Category: function
- Evidence: report-event blocks currently appear in `updateEmployeeProfile()` and `createEmployeeShift()` while referencing variables belonging to front-desk functions. The actual front-desk create/update functions do not emit.
- Impact: affected functions can fail at runtime or emit corrupt evidence.
- Repair: remove the misplaced blocks. Do not treat unscoped legacy front-desk records as property-report sources.

### RPT-015 — date boundary is ambiguous

- Severity: Medium
- Category: reporting correctness
- Evidence: UI/endpoints mix end-of-day timestamps with a `< to` query.
- Impact: records at the end boundary can be omitted or double-counted.
- Repair: use an inclusive start and exclusive next-day end everywhere; display the user-selected inclusive calendar dates.

### RPT-016 — unsupported business reports appear equivalent to zero

- Severity: High
- Category: truthfulness
- Evidence: finance, revenue, restaurant, banquet, sales, inventory, market, and external-channel sources are not all property-scoped, reconciled, or connected, but generic metrics are reused across areas.
- Impact: an empty result can be misread as a real zero and used for a business decision.
- Repair: expose per-report coverage as `AVAILABLE`, `PARTIAL`, or `CONNECTION_REQUIRED`, including source names and missing prerequisites. Never invent market or revenue data.

### RPT-017 — legacy print compiler is not property-scoped

- Severity: Critical
- Category: data isolation / reporting correctness
- Evidence: `app/server/report-generator.ts` resolves only an organization staff context. Its time, schedule, room, night-audit, and audit queries omit the active canonical property. Several named report types also return the same generic time-entry rows.
- Impact: two-property pilot records can be mixed in a printable report, and a report title can claim a calculation that was never performed.
- Repair: require an authorized property for every compilation, filter every supported source by that property, record the property in the audit receipt, and label any report whose canonical source is not property-scoped as `CONNECTION_REQUIRED` instead of returning a misleading dataset.

### RPT-018 — Digital Front Desk exports are browser-generated

- Severity: High
- Category: export integrity
- Evidence: `DigitalFrontDeskClient.downloadCsv()` builds a CSV from browser state, while `ReportDrilldownTable` downloads a second browser CSV after merely notifying the export audit endpoint.
- Impact: the downloaded bytes are not necessarily the rows authorized, checksummed, and recorded by the server.
- Repair: all report CSV downloads must use the server-generated governed export response. Remove the duplicate browser export control.

## Repair contract

1. Add migration `0080_enterprise_reporting_property_scope.sql` and rollback.
2. Make reporting reads read-only and property-scoped.
3. Produce operational metrics and exact rows from canonical source adapters.
4. Add real prior-period comparison and source coverage metadata.
5. Add direct drill-down and canonical source links; preserve legacy token compatibility.
6. Apply one RBAC/property gate to every reporting route.
7. Scope saved views, event cursors, tokens, and exports to the authorized property.
8. Replace duplicate ownership with a compatibility wrapper.
9. Repair property-aware event writers and remove misplaced emitters.
10. Make every enabled catalog control functional; mark unsupported sources truthfully.
11. Add regression tests for read-only behavior, row/count reconciliation, property isolation, route authorization, prior-period comparison, and CSV export.

## Non-goals for this repair

- No invented revenue, market, competitor, weather, or channel data.
- No new reporting product or duplicate dashboard.
- No financial write actions.
- No HNE core or HNE GitHub repository changes.
- No `working_verified` claim without a human completing the seven-question evidence gate.

## Definition of done

- A report GET does not insert, update, or delete any row.
- Wyndham Garden and Days Inn data remain isolated by canonical property id.
- Every displayed available total opens the exact rows counted using the same filters.
- Every row identifies and links to its owning workflow.
- Prior-period values are computed, not hardcoded.
- Unsupported reports show missing-source guidance rather than a false zero.
- Saved views and event cursors cannot cross property boundaries.
- CSV content matches the visible drill-down and carries an audited SHA-256 receipt.
- All targeted tests, migration replay, capability collision check, production build, and full test suite pass.
