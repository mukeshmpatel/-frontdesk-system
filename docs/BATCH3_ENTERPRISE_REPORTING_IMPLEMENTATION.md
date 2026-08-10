# Batch 3 — Enterprise Reporting Repair

## Outcome

AAIQ Enterprise Reports now has one canonical reporting owner and one truthful operational path:

`authorized property + authorized role → current canonical source rows → metric → exact drill-down rows → owning workflow → governed export`

This repair does not declare reporting `working_verified`. Automated evidence is green, but an authorized human must still complete the seven-question workflow review with representative property data.

## What changed

### Data and migration governance

- Added forward-only migration `0080_enterprise_reporting_property_scope.sql` and a preservation-first rollback.
- Scoped drill-down tokens, saved views, report events, report facts, and run receipts to canonical property ids.
- Changed fact uniqueness from organization-wide source identity to property + source identity.
- Added immutable `report_run_receipts` with filters, source coverage, row count, checksum, duration, user, property, and timestamp.
- Packaged the same migration under `deployment/pilot-migrations/`.

### Canonical reporting owner

- `db/reporting-layer.ts` is the only business owner for operational reporting.
- `db/reporting-insights.ts` is compatibility-only and contains no schema or reporting business logic.
- Current totals read current rows from:
  - `operational_work_orders`
  - `work_order_attachments`
  - `front_desk_operational_records`
  - property-scoped `time_entries`
- Stored report events/facts remain audit projections. They are not trusted as the live operational total.

### Correctness and isolation

- Read endpoints do not create tokens, facts, views, audit rows, or receipts.
- Explicit **Run & audit report** creates a receipt; ordinary refresh does not mutate storage.
- Every report query resolves an authorized canonical property.
- Non-admin rows are limited to the signed-in employee or their authorized department.
- Employee filtering is admin-only.
- Prior-period values use a real equal-length preceding interval.
- Dates use inclusive start and exclusive next-day end.
- Missing property identity is `UNASSIGNED`; it is never guessed as a real hotel.

### Functional drill-down

- Every enabled KPI shows both its value and exact canonical record count.
- Clicking a KPI requests the exact records using the same property, period, department, and metric.
- Open-task and urgent-task badges use one canonical work-order snapshot; the displayed number and listed rows cannot diverge.
- Each source row links to its owning workflow.
- Saved views are isolated by user and property.
- Event cursors are isolated by property.
- The report catalog again contains 20 truthful entries. Cash and check custody reconciliation opens its existing governed workflow instead of pretending to be a generic metric.

### Governed exports

- CSV is generated on the server from the same authorized source adapter.
- The server returns the actual row count and SHA-256 checksum.
- Export audit records contain property, user, filters, byte length, row count, and checksum.
- Spreadsheet formula injection is neutralized.
- Browser-generated duplicate CSV paths were removed from Digital Front Desk reporting.
- Digital Front Desk exposes CSV only for metrics backed by an exact canonical adapter; unsupported named analyses remain print-only or connection-required.

### Truthful source coverage

- Front Desk, Workforce, Housekeeping, Maintenance, and Compliance operational rows are available from current internal sources.
- Restaurant, Banquets, Sales, Inventory, Finance, Security, Technology, connected inbox, market, competitor, weather, PMS folio, settlement, and revenue claims remain `PARTIAL` or `CONNECTION_REQUIRED` until a canonical property-mapped provider exists.
- The UI shows the missing source and configuration route instead of displaying an invented zero.

### Legacy print compiler

- Every print compilation now requires an authorized property id.
- Time entries, room schedule, night-audit records, and system audit records are property-scoped.
- Housekeeping labor filters by the employee's recorded department.
- Overtime is calculated from the selected period instead of returning unchanged raw rows.
- Analyses that require occupancy/workload/forecast data fail closed with `CONNECTION_REQUIRED` coverage rather than relabeling time entries.
- Legacy shifts lack canonical property ids, so schedule coverage is deliberately blocked until that source is migrated or connected.

## Security controls

Every reporting route requires:

1. Signed-in ChatGPT/Cloudflare Access identity.
2. Staff workspace resolution.
3. `AAIQ_REPORTING` module access.
4. UAT role authorization for `READ` or `EXPORT`.
5. Canonical property authorization.

Exports and explicit report runs add auditable evidence. Read-only refreshes remain read-only.

## Verification performed

- Enterprise reporting focused regression suite: 17/17 passed.
- Reporting compatibility and rendered-workflow suite: 52/52 passed.
- Migration replay: 81 migrations passed from the Release 68 preservation baseline.
- Capability collision check: passed with 33 navigation entries, 178 migration tables, and 5 canonical owners.
- Production build: passed.
- Truthful capability ledger regenerated: 590 entries, including 480 buttons, 33 modules, 23 Digital Employee duties, 34 integrations, and 20 reports; zero items are self-labeled `working_verified`.
- Full repository suite: 281/281 passed after the migration, collision, and production-build gates.

## Human verification still required

For both Wyndham Garden Salina and Days Inn Salina South, an authorized tester must answer:

1. Was the intended report easy to find and run?
2. Did the total reconcile to a known source sample?
3. Did every total open the exact records counted?
4. Did each row open the correct owning workflow?
5. Did another property's records remain invisible?
6. Did CSV content and row count match the visible drill-down?
7. Did missing providers show a clear configuration requirement rather than a false zero?

Until those answers and evidence are stored, capability status remains `working_incomplete`.

## Preserved boundaries

- No HNE core repository or HNE GitHub repository was modified.
- No PMS, finance, market, weather, UniFi, GDMS, social, or external provider data was invented.
- No financial or external action authority was enabled.
