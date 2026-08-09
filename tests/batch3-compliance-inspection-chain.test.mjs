import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import ts from "typescript";
import {
  assertComplianceTransition,
  evaluateResponse,
  nextDueAt,
  targetMatcher,
} from "../lib/compliance-inspection-engine.ts";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("every Compliance INSERT binds exactly one value per SQL placeholder", async () => {
  const file = "db/compliance-inspections.ts", sourceText = await read(file);
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
  assert.ok(checked.length >= 14, "expected every Compliance INSERT statement to be checked");
});

test("Compliance state and measured response rules block shortcuts and critical waivers", () => {
  assert.equal(assertComplianceTransition("ASSIGNED", "ACKNOWLEDGED"), "ACKNOWLEDGED");
  assert.equal(assertComplianceTransition("ACKNOWLEDGED", "INSPECTING"), "INSPECTING");
  assert.throws(() => assertComplianceTransition("INSPECTING", "COMPLIANT"), /not allowed/);
  assert.throws(() => assertComplianceTransition("FAILED_HOLD", "WAIVED"), /not allowed/);
  assert.equal(assertComplianceTransition("FAILED_HOLD", "REWORK_REQUIRED"), "REWORK_REQUIRED");
  const critical = { code:"PH", instruction:"Read pH", responseType:"NUMBER", required:true, critical:true, minimum:7.2, maximum:7.8 };
  assert.deepEqual(evaluateResponse(critical, { result:"PASS", numberValue:7.5 }),
    { result:"PASS", value:"7.5", note:"", rangeFailure:false, criticalFailure:false });
  assert.throws(() => evaluateResponse(critical, { result:"PASS", numberValue:8.2 }), /requires a factual deficiency note/);
  assert.deepEqual(evaluateResponse(critical, { result:"PASS", numberValue:8.2, note:"Measured above approved range." }),
    { result:"FAIL", value:"8.2", note:"Measured above approved range.", rangeFailure:true, criticalFailure:true });
  assert.throws(() => evaluateResponse(critical, { result:"NOT_APPLICABLE", numberValue:7.5 }), /requires a factual reason/);
});

test("recurrence and target selection are deterministic and never fabricate a property-wide target", () => {
  const start = new Date("2026-01-15T12:00:00.000Z");
  assert.equal(nextDueAt("DAILY", start), "2026-01-16T12:00:00.000Z");
  assert.equal(nextDueAt("QUARTERLY", start), "2026-04-15T12:00:00.000Z");
  assert.match(targetMatcher("FIRE_EXTINGUISHER"), /EXTINGUISHER/);
  assert.match(targetMatcher("ROOM"), /asset_type='ROOM'/);
  assert.equal(targetMatcher("UNKNOWN_ASSET_KIND"), null);
});

test("migration is property-isolated, idempotent, append-only, and rollback preserves work orders", async () => {
  const [baseline, migration, rollback] = await Promise.all([
    read("migrations/baselines/release68_operational_work_orders.sql"),
    read("migrations/0078_compliance_inspection_chain.sql"),
    read("migrations/rollbacks/0078_compliance_inspection_chain_rollback.sql"),
  ]);
  const db = new DatabaseSync(":memory:"); db.exec(baseline); db.exec(migration);
  db.prepare(`INSERT INTO operational_work_orders(id,organization_id,property_id,department,work_type,title,description,status,progress,priority,created_by,created_at,updated_at)
    VALUES('work-a','org','property-a','COMPLIANCE','COMPLIANCE_INSPECTION','Pool','Inspect','ASSIGNED',5,'HIGH','AAIQ','now','now')`).run();
  const insertProgram = db.prepare(`INSERT INTO compliance_programs(id,organization_id,property_id,template_id,program_code,target_kind,source_status,
    required_evidence_json,frequency,next_due_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`);
  insertProgram.run("program-a","org","property-a","template-a","POOL-DAILY","POOL","APPROVED","[]","DAILY","later","now","now");
  insertProgram.run("program-b","org","property-b","template-b","POOL-DAILY","POOL","APPROVED","[]","DAILY","later","now","now");
  assert.throws(() => insertProgram.run("program-duplicate","org","property-a","template-c","POOL-DAILY","POOL","APPROVED","[]","DAILY","later","now","now"), /UNIQUE constraint failed/);
  db.prepare(`INSERT INTO compliance_inspection_cases(id,organization_id,property_id,program_id,template_id,work_order_id,target_asset_id,target_label,due_instance_key,state,assignment_reason,due_at,created_by,created_at,updated_at)
    VALUES('case-a','org','property-a','program-a','template-a','work-a','pool-a','Pool','program-a:2026-01-15','ASSIGNED','eligible roster','later','AAIQ','now','now')`).run();
  db.prepare(`INSERT INTO compliance_case_events(id,organization_id,property_id,case_id,event_type,actor_type,actor_id,detail_json,created_at)
    VALUES('event-a','org','property-a','case-a','COMPLIANCE_CASE_CREATED','SYSTEM','AAIQ','{}','now')`).run();
  assert.throws(() => db.prepare("UPDATE compliance_case_events SET event_type='TAMPERED' WHERE id='event-a'").run(), /append-only/);
  assert.throws(() => db.prepare("DELETE FROM compliance_case_events WHERE id='event-a'").run(), /append-only/);
  db.exec(rollback);
  assert.equal(db.prepare("SELECT id FROM operational_work_orders WHERE id='work-a'").get().id, "work-a");
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='compliance_programs'").get(), undefined);
});

test("service, routes, UI, and worker implement a source-backed, property-scoped inspection chain", async () => {
  const [service, page, ui, worker, migration] = await Promise.all([
    read("db/compliance-inspections.ts"), read("app/compliance-center/page.tsx"), read("app/compliance-center/compliance-inspection-client.tsx"),
    read("worker/index.ts"), read("migrations/0078_compliance_inspection_chain.sql"),
  ]);
  for (const path of ["app/api/compliance/programs/route.ts", "app/api/compliance/cases/[id]/action/route.ts",
    "app/api/compliance/cases/[id]/evidence/route.ts", "app/api/compliance/cases/[id]/trace/route.ts"])
    assert.ok((await read(path)).length > 0, `${path} missing`);
  assert.match(service, /organization_id=\? AND property_id=\?/);
  assert.match(service, /source_status='APPROVED'/);
  assert.match(service, /Critical numeric item .* requires an approved minimum and maximum/);
  assert.match(service, /AAIQ did not invent a property-wide target/);
  assert.match(service, /property_assignments/);
  assert.match(service, /clocked_in DESC,open_load/);
  assert.match(service, /createMaintenanceCase/);
  assert.match(service, /linked Maintenance remediation must receive independent return-to-service approval/);
  assert.match(service, /cannot approve their own compliance result/);
  assert.match(service, /person who recorded inspection results cannot independently approve/);
  assert.match(service, /UPLOAD_INTEGRITY_ONLY_V1/);
  assert.match(service, /recordSystemAudit/);
  assert.match(service, /emitReportEvent/);
  assert.match(worker, /runScheduledComplianceAutomation/);
  assert.match(worker, /runComplianceEscalations/);
  assert.match(page, /ComplianceInspectionClient/);
  assert.doesNotMatch(page, /PropertyOperationsClient/);
  assert.match(ui, /Due detection, exact target selection, eligible assignment/);
  assert.match(ui, /Critical numeric checks also require the source-approved acceptable range/);
  assert.match(ui, /CRITICAL HOLD — NO WAIVER/);
  assert.match(ui, /Independent closure decision/);
  assert.match(ui, /Open full trace/);
  assert.match(migration, /compliance_case_events_append_only_update/);
});
