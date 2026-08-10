import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import ts from "typescript";
import {
  assertMaintenanceTransition,
  classifyMaintenanceRisk,
  MAINTENANCE_EVIDENCE,
  maintenanceProgress,
  maintenanceWorkOrderStatus,
} from "../lib/maintenance-repair-engine.ts";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("every Maintenance INSERT binds exactly one value per SQL placeholder", async () => {
  const file = "db/maintenance-repairs.ts", sourceText = await read(file);
  const tree = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const checked = [];
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "bind") {
      const prepare = node.expression.expression;
      if (ts.isCallExpression(prepare) && ts.isPropertyAccessExpression(prepare.expression) && prepare.expression.name.text === "prepare") {
        const template = prepare.arguments[0];
        const sql = ts.isNoSubstitutionTemplateLiteral(template) || ts.isStringLiteral(template) ? template.text : "";
        if (/INSERT INTO/.test(sql)) {
          const placeholders = (sql.match(/\?/g) || []).length;
          const table = sql.match(/INSERT INTO\s+(\w+)/)?.[1] || "unknown";
          checked.push(table);
          assert.equal(node.arguments.length, placeholders, `${table} has ${placeholders} placeholders but ${node.arguments.length} bound values`);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(checked.length >= 16, "expected every Maintenance INSERT statement to be checked");
});

test("risk classification is fact-driven, deterministic, and cannot be user-prioritized", () => {
  assert.deepEqual(classifyMaintenanceRisk({ hazardType: "FIRE_SMOKE_GAS", guestImpact: false, roomOutage: false, activeLeak: false }), {
    priority: "CRITICAL", responseTargetMinutes: 0, safetyHold: true,
    reason: "Life-safety or major property hazard requires immediate trained-human control.", facts: ["hazard:fire_smoke_gas"],
  });
  assert.equal(classifyMaintenanceRisk({ activeLeak: true }).priority, "HIGH");
  assert.equal(classifyMaintenanceRisk({ roomOutage: true }).responseTargetMinutes, 30);
  assert.equal(classifyMaintenanceRisk({ guestImpact: true }).priority, "MEDIUM");
  assert.equal(classifyMaintenanceRisk({}).priority, "LOW");
});

test("state machine requires the diagnosis-repair-test-verification chain and qualified safety clearance", () => {
  assert.equal(assertMaintenanceTransition("ASSIGNED", "ACKNOWLEDGED"), "ACKNOWLEDGED");
  assert.equal(assertMaintenanceTransition("ACKNOWLEDGED", "DIAGNOSING"), "DIAGNOSING");
  assert.throws(() => assertMaintenanceTransition("REPAIRING", "RETURNED_TO_SERVICE"), /not allowed/);
  assert.throws(() => assertMaintenanceTransition("SAFETY_HOLD", "DIAGNOSING"), /qualified human/);
  assert.equal(assertMaintenanceTransition("SAFETY_HOLD", "DIAGNOSING", { safetyCleared: true }), "DIAGNOSING");
  assert.equal(maintenanceProgress("AWAITING_VERIFICATION"), 95);
  assert.equal(maintenanceWorkOrderStatus("RETURNED_TO_SERVICE"), "VERIFIED");
  assert.deepEqual(MAINTENANCE_EVIDENCE.map(item => `${item.area}:${item.stage}`),
    ["BEFORE:BEFORE", "REPAIR_DETAIL:DURING", "AFTER:AFTER", "SAFETY_CHECK:AFTER"]);
});

test("migration is property-isolated, idempotent, append-only, and rollback preserves prior work orders", async () => {
  const [baseline, migration, rollback] = await Promise.all([
    read("migrations/baselines/release68_operational_work_orders.sql"),
    read("migrations/0077_maintenance_defect_repair_chain.sql"),
    read("migrations/rollbacks/0077_maintenance_defect_repair_chain_rollback.sql"),
  ]);
  const db = new DatabaseSync(":memory:"); db.exec(baseline); db.exec(migration);
  db.prepare(`INSERT INTO operational_work_orders(id,organization_id,property_id,department,work_type,title,description,status,progress,priority,created_by,created_at,updated_at)
    VALUES('work-a','org','property-a','MAINTENANCE','CORRECTIVE_REPAIR','PTAC','No cooling','ASSIGNED',5,'HIGH','manager','now','now')`).run();
  const insert = db.prepare(`INSERT INTO maintenance_cases(id,organization_id,property_id,work_order_id,source_type,source_reference,idempotency_key,
    summary,description,hazard_type,priority,response_target_minutes,classification_reason,risk_facts_json,state,assignment_reason,due_at,created_by,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  insert.run("case-a","org","property-a","work-a","MANUAL","front desk","same-key","PTAC","No cooling","NONE","HIGH",30,"outage","[]","ASSIGNED","eligible roster","later","manager","now","now");
  db.prepare(`INSERT INTO operational_work_orders(id,organization_id,property_id,department,work_type,title,description,status,progress,priority,created_by,created_at,updated_at)
    VALUES('work-b','org','property-b','MAINTENANCE','CORRECTIVE_REPAIR','PTAC','No cooling','ASSIGNED',5,'HIGH','manager','now','now')`).run();
  insert.run("case-b","org","property-b","work-b","MANUAL","front desk","same-key","PTAC","No cooling","NONE","HIGH",30,"outage","[]","ASSIGNED","eligible roster","later","manager","now","now");
  assert.throws(() => insert.run("case-duplicate","org","property-a","work-a","MANUAL","again","same-key","PTAC","No cooling","NONE","HIGH",30,"outage","[]","ASSIGNED","eligible roster","later","manager","now","now"), /UNIQUE constraint failed/);
  db.prepare(`INSERT INTO maintenance_case_events(id,organization_id,property_id,case_id,event_type,actor_type,actor_id,detail_json,created_at)
    VALUES('event-a','org','property-a','case-a','CASE_CREATED_AND_TRIAGED','SYSTEM','AAIQ','{}','now')`).run();
  assert.throws(() => db.prepare("UPDATE maintenance_case_events SET event_type='TAMPERED' WHERE id='event-a'").run(), /append-only/);
  assert.throws(() => db.prepare("DELETE FROM maintenance_case_events WHERE id='event-a'").run(), /append-only/);
  db.exec(rollback);
  assert.equal(db.prepare("SELECT id FROM operational_work_orders WHERE id='work-a'").get().id, "work-a");
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='maintenance_cases'").get(), undefined);
});

test("service and routes enforce property scope, eligible assignment, safety, warranty, parts, audit, and independent verification", async () => {
  const [service, page, ui, worker, migration] = await Promise.all([
    read("db/maintenance-repairs.ts"), read("app/maintenance/page.tsx"), read("app/maintenance/maintenance-repair-client.tsx"),
    read("worker/index.ts"), read("migrations/0077_maintenance_defect_repair_chain.sql"),
  ]);
  for (const path of ["app/api/maintenance/cases/route.ts", "app/api/maintenance/cases/[id]/action/route.ts",
    "app/api/maintenance/cases/[id]/evidence/route.ts", "app/api/maintenance/cases/[id]/trace/route.ts"])
    assert.ok((await read(path)).length > 0, `${path} missing`);
  assert.match(service, /organization_id=\? AND property_id=\?/);
  assert.match(service, /property_assignments/);
  assert.match(service, /clocked_in DESC,open_load/);
  assert.match(service, /No eligible Maintenance employee/);
  assert.match(service, /Repair authority is paused until a qualified human clears the safety hold/);
  assert.match(service, /\["UNKNOWN", "CLAIM_RECOMMENDED"\]/);
  assert.match(service, /appears to be under warranty/);
  assert.match(service, /AAIQ did not order or financially commit/);
  assert.match(service, /repair performer cannot approve their own return-to-service decision/);
  assert.match(service, /system_audit_trail/);
  assert.match(service, /recordSystemAudit/);
  assert.match(service, /emitReportEvent/);
  assert.match(service, /UPLOAD_INTEGRITY_ONLY_V1/);
  assert.match(worker, /runMaintenanceEscalations/);
  assert.match(page, /MaintenanceRepairClient/);
  assert.doesNotMatch(page, /PropertyOperationsClient/);
  assert.match(ui, /Create, classify & assign/);
  assert.match(ui, /Physical repair, life-safety clearance/);
  assert.match(ui, /Independent return-to-service review/);
  assert.match(ui, /Open full trace/);
  assert.match(ui, /Prepare source-cited briefing/);
  assert.match(migration, /maintenance_case_events_append_only_update/);
});
