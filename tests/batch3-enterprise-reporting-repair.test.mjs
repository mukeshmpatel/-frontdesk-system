import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("enterprise reporting repair is documented and migration-owned", async () => {
  const [findings, migration, rollback, deployment] = await Promise.all([
    read("docs/BATCH3_ENTERPRISE_REPORTING_FINDINGS.md"),
    read("migrations/0080_enterprise_reporting_property_scope.sql"),
    read("migrations/rollbacks/0080_enterprise_reporting_property_scope_rollback.sql"),
    read("deployment/pilot-migrations/0080_enterprise_reporting_property_scope.sql"),
  ]);
  for (const id of ["RPT-001", "RPT-017", "RPT-018"]) assert.match(findings, new RegExp(id));
  for (const source of [migration, deployment]) {
    assert.match(source, /report_drilldown_tokens ADD COLUMN property_id/);
    assert.match(source, /report_saved_views ADD COLUMN property_id/);
    assert.match(source, /report_facts_property_source_idx/);
    assert.match(source, /CREATE TABLE IF NOT EXISTS report_run_receipts/);
  }
  assert.match(rollback, /report_facts_source_idx/);
  assert.match(rollback, /non-unique compatibility index/);
});

test("canonical reports are read-only, property scoped, role scoped, and directly drillable", async () => {
  const [layer, wrapper] = await Promise.all([
    read("db/reporting-layer.ts"),
    read("db/reporting-insights.ts"),
  ]);
  for (const table of ["operational_work_orders", "front_desk_operational_records", "time_entries", "work_order_attachments"]) {
    assert.match(layer, new RegExp(table));
  }
  assert.match(layer, /organization_id=\?","property_id=\?"/);
  assert.match(layer, /function roleClause/);
  assert.match(layer, /reportMetricDrilldown/);
  assert.match(layer, /sourceRoute:/);
  assert.match(layer, /previousRange/);
  assert.match(layer, /compileGovernedReportExport/);
  assert.match(layer, /x-content-checksum|content_sha256|SHA-256/i);
  assert.doesNotMatch(layer, /synchronizeLegacyReportFacts/);
  assert.doesNotMatch(layer, /legacy-time|legacy-desk/);
  assert.doesNotMatch(layer, /\|\|\s*["']primary["']/i);
  assert.doesNotMatch(wrapper, /CREATE\s+TABLE|ALTER\s+TABLE|INSERT\s+INTO/i);
  assert.match(wrapper, /reporting-layer/);
});

test("every report route applies the shared reporting authorization gate", async () => {
  const paths = [
    "app/api/v1/reports/summary/route.ts",
    "app/api/v1/reports/drilldown/route.ts",
    "app/api/v1/reports/events/route.ts",
    "app/api/v1/reports/tasks/route.ts",
    "app/api/v1/reports/views/route.ts",
    "app/api/v1/reports/exports/route.ts",
    "app/api/v1/reports/runs/route.ts",
    "app/api/v1/reports/sources/route.ts",
    "app/api/v1/reports/[reportId]/route.ts",
    "app/api/v1/reports/compile/route.ts",
  ];
  for (const path of paths) {
    const source = await read(path);
    assert.match(source, /reportingAccessError/);
    assert.match(source, /getChatGPTUser/);
  }
  const gate = await read("lib/reporting-route-access.ts");
  assert.match(gate, /hasModuleAccess\(user\.email,"AAIQ_REPORTING"\)/);
  assert.match(gate, /authorizeUatRole/);
  assert.match(gate, /recordUatAccessEvidence/);
});

test("summary reads never create audit rows and explicit report runs do", async () => {
  const [summary, runs, layer] = await Promise.all([
    read("app/api/v1/reports/summary/route.ts"),
    read("app/api/v1/reports/runs/route.ts"),
    read("db/reporting-layer.ts"),
  ]);
  assert.doesNotMatch(summary, /recordReportRun|INSERT\s+INTO/i);
  assert.match(runs, /recordReportRun/);
  assert.match(layer, /INSERT INTO report_run_receipts/);
});

test("report UI reconciles badges to exact rows and downloads server-governed CSV", async () => {
  const [center, frontDesk, table, exportRoute] = await Promise.all([
    read("app/reports/pms-reporting-center.tsx"),
    read("app/digital-front-desk/workforce-client.tsx"),
    read("app/components/report-drilldown-table.tsx"),
    read("app/api/v1/reports/exports/route.ts"),
  ]);
  assert.match(center, /taskSnapshot\?\.totalCount/);
  assert.match(center, /taskSnapshot\?\.rows\.filter\(row=>row\.priority==="CRITICAL"\)/);
  assert.match(center, /Open task →/);
  assert.match(center, /Open owning workflow →/);
  assert.match(center, /server-verified rows/);
  assert.match(center, /CONNECTION_REQUIRED/);
  assert.match(frontDesk, /await response\.blob\(\)/);
  assert.match(frontDesk, /reportPropertyId/);
  assert.doesNotMatch(frontDesk, /function downloadCsv/);
  assert.doesNotMatch(frontDesk, /drillDownToken/);
  assert.match(table, /metric\.recordCount/);
  assert.match(table, /await onExport/);
  assert.match(exportRoute, /x-aaiq-row-count/);
  assert.match(exportRoute, /x-content-checksum-sha256/);
});

test("legacy printable reports fail closed on property and source coverage", async () => {
  const [generator, route] = await Promise.all([
    read("app/server/report-generator.ts"),
    read("app/api/v1/reports/compile/route.ts"),
  ]);
  assert.match(generator, /authorizedPropertyScope\(userEmail, input\.propertyId\)/);
  assert.match(generator, /t\.property_id=\?/);
  assert.match(generator, /property_id=\? AND asset_type='ROOM'/);
  assert.match(generator, /front_desk_operational_records/);
  assert.match(generator, /system_audit_trail WHERE organization_id=\? AND property_id=\?/);
  assert.match(generator, /CONNECTION_REQUIRED/);
  assert.match(generator, /propertyId: property\.id/);
  assert.match(route, /propertyId: payload\.propertyId/);
});

test("workforce reporting cannot absorb another property's time entries", async () => {
  const [operations, kiosk] = await Promise.all([
    read("db/operations.ts"),
    read("db/workforce-kiosk.ts"),
  ]);
  assert.match(operations, /property_id/);
  assert.match(operations, /authorizedPropertyScope/);
  assert.match(kiosk, /t\.property_id=\?/);
  assert.doesNotMatch(kiosk, /property_id IS NULL/);
});
