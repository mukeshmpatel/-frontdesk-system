import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import {
  computeCashReconciliation,
  parseCashReport,
} from "../lib/cash-reconciliation-engine.ts";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const source = (shiftCode, amountCents, sourceRowNumber = 1) => ({
  businessDate: "2026-08-03",
  shiftCode,
  amountCents,
  sourceReference: `${shiftCode}-${sourceRowNumber}`,
  occurredAt: null,
  sourceRowNumber,
  rawRowText: `${shiftCode},${amountCents}`,
});
const session = (shiftCode, employeeCountedCents, managerReceivedCents, status = "VERIFIED") => ({
  id: `${shiftCode}-session`,
  shiftCode,
  employeeEmail: `${shiftCode.toLowerCase()}@example.com`,
  status,
  employeeCountedCents,
  managerReceivedCents,
  submittedAt: "2026-08-04T03:00:00.000Z",
  verifiedAt: status === "VERIFIED" ? "2026-08-04T03:15:00.000Z" : null,
});

test("cash report parser uses exact authorized rows and rejects wrong dates or malformed amounts", () => {
  const rows = parseCashReport(
    "business_date,shift,cash_amount,reference,occurred_at\n2026-08-03,AM,$125.25,FOLIO-1,2026-08-03T15:00:00Z\n2026-08-03,PM,(5.25),REFUND-2,",
    "2026-08-03",
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0].amountCents, 12_525);
  assert.equal(rows[1].amountCents, -525);
  assert.equal(rows[0].sourceReference, "FOLIO-1");
  assert.throws(() => parseCashReport("shift,cash_amount\nAM,not-money", "2026-08-03"), /Invalid cash amount/);
  assert.throws(() => parseCashReport("business_date,shift,cash_amount\n2026-08-02,AM,1.00", "2026-08-03"), /does not match selected date/);
});

test("exact source and independently manager-verified drops reconcile clean", () => {
  const result = computeCashReconciliation({
    expectedShiftCodes: ["AM", "PM"],
    sourceRows: [source("AM", 10_000), source("PM", 5_000, 2)],
    sessions: [session("AM", 10_000, 10_000), session("PM", 5_000, 5_000)],
  });
  assert.equal(result.expectedTotalCents, 15_000);
  assert.equal(result.countedTotalCents, 15_000);
  assert.equal(result.varianceCents, 0);
  assert.equal(result.unresolvedGapCount, 0);
  assert.equal(result.reconciliationStatus, "RECONCILED_CLEAN");
});

test("missing PMS/email source never guesses an expected total", () => {
  const result = computeCashReconciliation({
    expectedShiftCodes: ["AM", "PM"],
    sourceRows: [source("AM", 10_000)],
    sessions: [session("AM", 10_000, 10_000)],
  });
  assert.equal(result.sourceStatus, "INVALID");
  assert.equal(result.expectedTotalCents, null);
  assert.equal(result.varianceCents, null);
  assert.equal(result.reconciliationStatus, "SOURCE_UNAVAILABLE");
  assert.deepEqual(result.shifts.find(row => row.shiftCode === "PM").gaps, ["MISSING_SOURCE", "MISSING_DROP"]);
});

test("missing physical drop and missing manager recount remain pending instead of ready", () => {
  const missingDrop = computeCashReconciliation({
    expectedShiftCodes: ["AM", "PM"],
    sourceRows: [source("AM", 10_000), source("PM", 5_000, 2)],
    sessions: [session("AM", 10_000, 10_000)],
  });
  assert.equal(missingDrop.reconciliationStatus, "PENDING_REVIEW");
  assert.ok(missingDrop.shifts.find(row => row.shiftCode === "PM").gaps.includes("MISSING_DROP"));

  const missingManager = computeCashReconciliation({
    expectedShiftCodes: ["AM"],
    sourceRows: [source("AM", 10_000)],
    sessions: [session("AM", 10_000, null, "SUBMITTED")],
  });
  assert.equal(missingManager.reconciliationStatus, "PENDING_REVIEW");
  assert.deepEqual(missingManager.shifts[0].gaps, ["MISSING_MANAGER_VERIFICATION"]);
});

test("verified shortage remains a visible variance for task and escalation handling", () => {
  const result = computeCashReconciliation({
    expectedShiftCodes: ["AM"],
    sourceRows: [source("AM", 10_000)],
    sessions: [session("AM", 9_000, 9_000)],
  });
  assert.equal(result.reconciliationStatus, "RECONCILED_WITH_VARIANCE");
  assert.equal(result.varianceCents, -1_000);
  assert.equal(result.unresolvedGapCount, 0);
});

test("migration preserves existing custody rows, creates reconciliation storage, and rolls back its own layer", async () => {
  const [base, custodyExtension, migration, rollback] = await Promise.all([
    read("migrations/0064_cash_check_custody.sql"),
    read("migrations/0072_cash_check_custody_workflow.sql"),
    read("migrations/0074_cash_daily_reconciliation.sql"),
    read("migrations/rollbacks/0074_cash_daily_reconciliation_rollback.sql"),
  ]);
  const db = new DatabaseSync(":memory:");
  db.exec(base);
  db.exec(custodyExtension);
  db.prepare(`INSERT INTO shift_cash_sessions
    (id,organization_id,property_id,employee_email,expected_cash_cents,counted_cash_cents,variance_cents,status,created_at,updated_at)
    VALUES('preserved','org','property','employee@example.com',1000,1000,0,'VERIFIED','now','now')`).run();
  db.exec(migration);
  for (const name of ["cash_reconciliation_policies", "cash_source_batches", "cash_source_transactions", "daily_cash_reconciliation"])
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name), `${name} missing`);
  assert.equal(db.prepare("SELECT id FROM shift_cash_sessions WHERE id='preserved'").get().id, "preserved");
  const columns = db.prepare("PRAGMA table_info(shift_cash_sessions)").all().map(row => row.name);
  for (const column of ["business_date", "shift_code", "source_batch_id"]) assert.ok(columns.includes(column));
  const batchColumns = db.prepare("PRAGMA table_info(cash_source_batches)").all().map(row => row.name);
  assert.ok(batchColumns.includes("active"));
  const insertBatch = db.prepare(`INSERT INTO cash_source_batches
    (id,organization_id,property_id,business_date,source_type,source_reference,file_name,content_sha256,row_count,total_cash_cents,active,status,parse_error,imported_by,imported_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  insertBatch.run("active-1", "org", "property", "2026-08-03", "EMAIL_REPORT", "daily-cash-v1", "v1.csv", "hash-1", 1, 1000, 1, "PARSED", null, "manager@example.com", "now");
  assert.throws(
    () => insertBatch.run("active-2", "org", "property", "2026-08-03", "EMAIL_REPORT", "daily-cash-v2", "v2.csv", "hash-2", 1, 1000, 1, "PARSED", null, "manager@example.com", "now"),
    /UNIQUE constraint failed/,
    "only one parsed source batch may be active for a property business date",
  );
  insertBatch.run("history-2", "org", "property", "2026-08-03", "EMAIL_REPORT", "daily-cash-v2", "v2.csv", "hash-2", 1, 1000, 0, "PARSED", null, "manager@example.com", "now");
  db.exec(rollback);
  assert.equal(db.prepare("SELECT id FROM shift_cash_sessions WHERE id='preserved'").get().id, "preserved");
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='daily_cash_reconciliation'").get(), undefined);
  const rolledBackColumns = db.prepare("PRAGMA table_info(shift_cash_sessions)").all().map(row => row.name);
  assert.ok(!rolledBackColumns.includes("business_date"));
});

test("cash workflow is property-scoped, audited, scheduled, task-producing, escalated, and not self-certified", async () => {
  const [service, ui, worker, wrangler, runRoute, escalationRoute] = await Promise.all([
    read("db/cash-reconciliation.ts"),
    read("app/aaiq-cash-custody/cash-custody-client.tsx"),
    read("worker/index.ts"),
    read("deployment/wrangler.pilot.template.jsonc"),
    read("app/api/frontdesk/cash-reconciliation/run/route.ts"),
    read("app/api/frontdesk/cash-reconciliation/escalations/run/route.ts"),
  ]);
  assert.match(service, /organization_id=\? AND property_id=\?/);
  assert.match(service, /operational_work_orders/);
  assert.match(service, /notification_escalations/);
  assert.match(service, /notification_outbox/);
  assert.match(service, /recordSystemAudit/);
  assert.match(service, /workflow_verification_runs/);
  assert.match(service, /Separate D1 re-query \+ deterministic checksum comparison/);
  assert.match(service, /verifyStoredCashReconciliation/);
  assert.doesNotMatch(service, /working_verified/);
  assert.match(worker, /runScheduledCashReconciliations/);
  assert.match(wrangler, /\*\/15 \* \* \* \*/);
  assert.match(runRoute, /hasModuleAccess/);
  assert.match(escalationRoute, /runCashReconciliationEscalationsForUser/);
  assert.match(ui, /LEVEL 1 · SHIFT DRILL-DOWN/);
  assert.match(ui, /LEVEL 2 · EXACT EVIDENCE/);
  assert.match(ui, /batch\.status === "PARSED" && Number\(batch\.active\) === 1/);
  assert.match(ui, /No user-selectable Ready state exists/);
});
