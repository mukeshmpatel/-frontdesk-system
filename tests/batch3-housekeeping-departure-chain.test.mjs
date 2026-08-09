import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import {
  decideHousekeepingInspection,
  parseDepartureReport,
  planHousekeepingAssignments,
  REQUIRED_HOUSEKEEPING_EVIDENCE,
  scoreDeparture,
} from "../lib/housekeeping-departure-engine.ts";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const departure = (overrides = {}) => ({
  sourceRowNumber: 2,
  roomNumber: "218",
  departureStatus: "DEPARTED",
  guestReference: "CONF-218",
  departedAt: "2026-08-03T15:00:00.000Z",
  expectedArrivalAt: null,
  earlyArrival: false,
  vip: false,
  rawRowText: "218,Departed",
  parseConfidence: 1,
  ...overrides,
});
const completeEvidence = REQUIRED_HOUSEKEEPING_EVIDENCE.map(required => ({ ...required, status: "PENDING_SUPERVISOR_REVIEW" }));
const passingChecklist = ["ENTRY_DOOR", "BEDS_LINENS", "BATHROOM", "VANITY_AMENITIES", "FLOOR_CORNERS", "FINAL_ROOM_STANDARD"]
  .map(key => ({ key, passed: true, note: "" }));

test("departure parser accepts factual CSV rows and preserves rejected-row evidence", () => {
  const result = parseDepartureReport([
    "room,status,confirmation,departed_at,next_arrival_at,early_arrival,vip",
    "218,Checked Out,CONF-218,2026-08-03T15:00:00Z,2026-08-03T19:00:00Z,yes,no",
    "219,Vacant Dirty,CONF-219,,,,VIP",
    "not-a-room,In House,CONF-BAD,,,,",
  ].join("\n"));
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].roomNumber, "218");
  assert.equal(result.rows[0].departureStatus, "DEPARTED");
  assert.equal(result.rows[0].earlyArrival, true);
  assert.equal(result.rows[1].departureStatus, "DIRTY");
  assert.equal(result.rows[1].vip, true);
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].sourceRowNumber, 4);
  assert.equal(result.issues[0].reason, "ROOM_NUMBER_INVALID");
});

test("priority and assignment policy is deterministic, explainable, roster-aware, and balanced", () => {
  const critical = scoreDeparture(departure({ earlyArrival: true, vip: true }));
  assert.deepEqual(critical, { score: 90, priority: "CRITICAL", facts: ["guest_departed:+40", "early_arrival_pressure:+30", "vip:+20"] });
  const plans = planHousekeepingAssignments([
    departure({ roomNumber: "218", earlyArrival: true, vip: true }),
    departure({ roomNumber: "220", sourceRowNumber: 3, departureStatus: "DIRTY" }),
  ], [
    { email: "clocked@example.com", displayName: "Clocked", openLoad: 1, clockedIn: true },
    { email: "offline@example.com", displayName: "Offline", openLoad: 0, clockedIn: false },
  ], new Date("2026-08-03T16:00:00Z"));
  assert.equal(plans[0].departure.roomNumber, "218");
  assert.equal(plans[0].assignedToEmail, "clocked@example.com");
  assert.equal(plans[0].rosterSource, "CLOCKED_IN");
  assert.match(plans[0].decisionReason.assignment, /lowest_open_load/);
  assert.equal(plans[1].assignedToEmail, "clocked@example.com", "offline staff are not selected while a clocked-in roster exists");
});

test("no eligible roster remains unassigned for escalation instead of inventing an employee", () => {
  const [plan] = planHousekeepingAssignments([departure()], [], new Date("2026-08-03T16:00:00Z"));
  assert.equal(plan.assignedToEmail, null);
  assert.equal(plan.rosterSource, "NO_ELIGIBLE_ROSTER");
  assert.equal(plan.decisionReason.assignment, "no_eligible_housekeeping_roster");
});

test("inspection gate requires complete evidence and a separate supervisor decision", () => {
  const missing = decideHousekeepingInspection({ evidence: completeEvidence.slice(1), checklist: passingChecklist, confidence: 1, supervisorDecision: true });
  assert.equal(missing.outcome, "MISSING_EVIDENCE");
  assert.deepEqual(missing.missing[0], { area: "ENTRY", stage: "BEFORE" });
  const submitted = decideHousekeepingInspection({ evidence: completeEvidence, checklist: passingChecklist, confidence: null, supervisorDecision: false });
  assert.equal(submitted.outcome, "SUPERVISOR_REVIEW");
  const lowConfidence = decideHousekeepingInspection({ evidence: completeEvidence, checklist: passingChecklist, confidence: 0.79, supervisorDecision: true });
  assert.equal(lowConfidence.outcome, "SUPERVISOR_REVIEW");
  const verified = decideHousekeepingInspection({ evidence: completeEvidence, checklist: passingChecklist, confidence: 1, supervisorDecision: true });
  assert.equal(verified.outcome, "VERIFIED");
});

test("failed brand-standard checklist creates a maintenance-hold decision", () => {
  const checklist = passingChecklist.map(item => item.key === "BATHROOM" ? { ...item, passed: false, note: "Sink is leaking." } : item);
  const result = decideHousekeepingInspection({ evidence: completeEvidence, checklist, confidence: 1, supervisorDecision: true });
  assert.equal(result.outcome, "MAINTENANCE_HOLD");
  assert.deepEqual(result.failed, [{ key: "BATHROOM", passed: false, note: "Sink is leaking." }]);
});

test("migration preserves prior evidence, isolates properties, and rolls back only its layer", async () => {
  const [baseline, migration, rollback] = await Promise.all([
    read("migrations/baselines/release68_operational_work_orders.sql"),
    read("migrations/0075_housekeeping_departure_chain.sql"),
    read("migrations/rollbacks/0075_housekeeping_departure_chain_rollback.sql"),
  ]);
  const db = new DatabaseSync(":memory:");
  db.exec(baseline);
  db.prepare(`INSERT INTO operational_work_orders
    (id,organization_id,property_id,department,work_type,title,description,status,progress,priority,created_by,created_at,updated_at)
    VALUES('work-before','org','property-a','HOUSEKEEPING','ROOM_TURN','Preserved','Existing record','ASSIGNED',0,'HIGH','seed','now','now')`).run();
  db.prepare(`INSERT INTO work_order_attachments
    (id,organization_id,property_id,work_order_id,object_key,file_name,content_type,size_bytes,uploaded_by,created_at)
    VALUES('evidence-before','org','property-a','work-before','private/key','before.jpg','image/jpeg',100,'employee@example.com','now')`).run();
  db.exec(migration);
  for (const table of ["housekeeping_departure_batches", "housekeeping_departures", "housekeeping_assignments", "housekeeping_assignment_inspections", "housekeeping_maintenance_handoffs"])
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table), `${table} missing`);
  assert.equal(db.prepare("SELECT id FROM work_order_attachments WHERE id='evidence-before'").get().id, "evidence-before");
  const insertBatch = db.prepare(`INSERT INTO housekeeping_departure_batches
    (id,organization_id,property_id,business_date,source_type,source_reference,content_sha256,status,imported_by,imported_at)
    VALUES(?,?,?,?,?,?,?,?,?,?)`);
  insertBatch.run("batch-a", "org", "property-a", "2026-08-03", "MANUAL_UPLOAD", "report.csv", "same-hash", "PARSED", "manager@example.com", "now");
  insertBatch.run("batch-b", "org", "property-b", "2026-08-03", "MANUAL_UPLOAD", "report.csv", "same-hash", "PARSED", "manager@example.com", "now");
  assert.throws(() => insertBatch.run("batch-duplicate", "org", "property-a", "2026-08-03", "MANUAL_UPLOAD", "again.csv", "same-hash", "PARSED", "manager@example.com", "now"), /UNIQUE constraint failed/);
  db.exec(rollback);
  assert.equal(db.prepare("SELECT id FROM work_order_attachments WHERE id='evidence-before'").get().id, "evidence-before");
  assert.ok(!db.prepare("PRAGMA table_info(work_order_attachments)").all().some(row => row.name === "content_sha256"));
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='housekeeping_assignments'").get(), undefined);
});

test("housekeeping chain is property-scoped, audited, scheduled, reassignment-capable, and not self-certified", async () => {
  const [service, engine, page, ui, worker, ingestRoute, migration, legacy] = await Promise.all([
    read("db/housekeeping-departures.ts"),
    read("lib/housekeeping-departure-engine.ts"),
    read("app/housekeeping/page.tsx"),
    read("app/housekeeping/housekeeping-departure-client.tsx"),
    read("worker/index.ts"),
    read("app/api/housekeeping/departures/ingest/route.ts"),
    read("migrations/0075_housekeeping_departure_chain.sql"),
    read("db/property-workflows.ts"),
  ]);
  for (const path of [
    "app/api/housekeeping/departures/ingest/route.ts",
    "app/api/housekeeping/assignments/today/route.ts",
    "app/api/housekeeping/assignments/[id]/verify/route.ts",
    "app/api/housekeeping/assignments/[id]/evidence/route.ts",
    "app/api/housekeeping/assignments/[id]/handoff-trace/route.ts",
  ]) assert.ok((await read(path)).length > 0, `${path} missing`);
  assert.match(service, /organization_id=\? AND property_id=\?/);
  assert.match(service, /operational_work_orders/);
  assert.match(service, /housekeeping_maintenance_handoffs/);
  assert.match(service, /recordSystemAudit/);
  assert.match(service, /workflow_verification_runs/);
  assert.match(service, /action === "REASSIGN"/);
  assert.match(service, /status='CLOSED'/);
  assert.match(service, /working_incomplete/);
  assert.doesNotMatch(service, /working_verified/);
  assert.match(worker, /runHousekeepingEscalations/);
  assert.match(page, /HousekeepingDepartureClient/);
  assert.doesNotMatch(page, /PropertyOperationsClient/);
  assert.match(ui, /AAIQ DIGITAL HOUSEKEEPING SUPERVISOR/);
  assert.match(ui, /Open full trace/);
  assert.match(ui, /Save reassignment|Assign now/);
  assert.match(ingestRoute, /sourceType: "MANUAL_UPLOAD"/);
  assert.doesNotMatch(ingestRoute, /sourceType: String/);
  assert.match(engine, /NO_ELIGIBLE_ROSTER/);
  assert.match(migration, /UNIQUE\(organization_id,property_id,content_sha256\)/);
  assert.doesNotMatch(legacy, /demo-housekeeping|demo-maintenance|await seed\(/);
  assert.doesNotMatch(legacy, /SET property_id=\? WHERE organization_id=\? AND property_id IS NULL/);
  assert.doesNotMatch(legacy, /file\.size\s*>=\s*\d+/);
  assert.match(legacy, /UPLOAD_INTEGRITY_ONLY_V1/);
  assert.match(legacy, /PENDING_SUPERVISOR_REVIEW/);
});

test("legacy property workflows enforce the active property on every mutation, evidence read, and reporting projection", async () => {
  const [service, route, attachmentRoute, reporting] = await Promise.all([
    read("db/property-workflows.ts"),
    read("app/api/operations/workflows/route.ts"),
    read("app/api/operations/workflows/attachments/[id]/route.ts"),
    read("db/reporting-layer.ts"),
  ]);
  assert.match(service, /workflowScope/);
  assert.match(service, /mayOperateDepartment/);
  assert.match(service, /recordSystemAudit/);
  for (const table of ["operational_work_orders", "work_order_steps", "work_order_attachments", "work_evidence_reviews", "night_room_report_imports"])
    assert.match(service, new RegExp(`${table}[\\s\\S]{0,500}property_id=\\?`), `${table} mutation/read lacks nearby property scope`);
  assert.match(route, /const propertyId=\(await cookies\(\)\)\.get\("aaiq_active_property"\)/);
  assert.match(route, /saveAttachment\([^\n]+propertyId\)/);
  assert.match(route, /importNightRoomReport\([^\n]+propertyId\)/);
  assert.match(attachmentRoute, /attachmentForUser\(user\.email,id,propertyId\)/);
  assert.match(reporting, /FROM operational_work_orders WHERE organization_id=\? AND property_id=\?/);
  assert.match(reporting, /WHERE a\.organization_id=\? AND a\.property_id=\?/);
});

test("compliance template migration permits the same governed template per property", async () => {
  const [baseline, migration, rollback] = await Promise.all([
    read("migrations/baselines/release68_operational_work_orders.sql"),
    read("migrations/0076_property_workflow_scope_hardening.sql"),
    read("migrations/rollbacks/0076_property_workflow_scope_hardening_rollback.sql"),
  ]);
  const db = new DatabaseSync(":memory:");
  db.exec(baseline);
  db.prepare(`INSERT INTO maintenance_compliance_templates
    (id,organization_id,property_id,code,name,description,frequency,required_evidence,active,next_due_at)
    VALUES('legacy','org',NULL,'POOL-DAILY','Pool','Legacy','DAILY','Checklist',1,'2026-08-04')`).run();
  db.exec(migration);
  const insert = db.prepare(`INSERT INTO maintenance_compliance_templates
    (id,organization_id,property_id,code,name,description,frequency,required_evidence,active,next_due_at)
    VALUES(?,?,?,?,?,?,?,?,?,?)`);
  insert.run("property-a-template","org","property-a","POOL-DAILY","Pool","Property A","DAILY","Checklist",1,"2026-08-04");
  insert.run("property-b-template","org","property-b","POOL-DAILY","Pool","Property B","DAILY","Checklist",1,"2026-08-04");
  assert.equal(db.prepare("SELECT COUNT(*) count FROM maintenance_compliance_templates WHERE organization_id='org' AND code='POOL-DAILY'").get().count,3);
  assert.throws(()=>insert.run("duplicate","org","property-a","POOL-DAILY","Pool","Duplicate","DAILY","Checklist",1,"2026-08-04"),/UNIQUE constraint failed/);
  db.exec(rollback);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM maintenance_compliance_templates WHERE organization_id='org' AND code='POOL-DAILY'").get().count,1);
});
