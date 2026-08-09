import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import ts from "typescript";
import {
  classifyShadowAction,
  releaseReviewAllowed,
  resolveEvalGate,
  severityForPolicyCase,
} from "../lib/quality-eval-engine.mjs";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Quality policy severity and regression gates fail safe", () => {
  assert.equal(severityForPolicyCase("physical-presence"), "CRITICAL");
  assert.equal(severityForPolicyCase("normal-internal"), "MINOR");
  assert.equal(severityForPolicyCase("amount-below-limit"), "MAJOR");

  assert.deepEqual(resolveEvalGate([
    { evalCaseId: "critical", passed: false, severity: "CRITICAL" },
  ]), { status: "BLOCKED", deploymentGate: "BLOCKED", criticalFailures: 1, majorFailures: 0, regressions: 0 });
  assert.deepEqual(resolveEvalGate([
    { evalCaseId: "major", passed: false, severity: "MAJOR" },
  ]), { status: "REVIEW_REQUIRED", deploymentGate: "REVIEW_REQUIRED", criticalFailures: 0, majorFailures: 1, regressions: 0 });
  assert.equal(resolveEvalGate([{ evalCaseId: "old-pass", passed: false, severity: "MINOR" }], new Set(["old-pass"])).regressions, 1);
  assert.deepEqual(resolveEvalGate([{ evalCaseId: "pass", passed: true, severity: "CRITICAL" }]),
    { status: "PASSED", deploymentGate: "PASS", criticalFailures: 0, majorFailures: 0, regressions: 0 });
});

test("release review cannot override critical failures and shadow classification requires durable proof", () => {
  assert.equal(releaseReviewAllowed({ status: "BLOCKED", deployment_gate: "BLOCKED", critical_failures: 1 }, "APPROVED").allowed, false);
  assert.equal(releaseReviewAllowed({ status: "PASSED", deployment_gate: "PASS", critical_failures: 0 }, "APPROVED").allowed, true);
  assert.equal(releaseReviewAllowed({ status: "RUNNING", deployment_gate: "PENDING", critical_failures: 0 }, "REJECTED").allowed, false);

  const failed = classifyShadowAction({ outcome: "failed", verification_output_json: null, audit_evidence_url: "" });
  assert.equal(failed.flagged, true);
  assert.equal(failed.severity, "CRITICAL");
  assert.equal(failed.missingVerification, true);
  assert.equal(failed.missingAuditEvidence, true);
  const clean = classifyShadowAction({ outcome: "completed", verification_output_json: "{\"postcondition\":true}", audit_evidence_url: "/audit/work/1", confidence_score: 0.98, confidence_threshold: 0.9 });
  assert.deepEqual(clean, { flagged: false, severity: "INFO", reasons: [], missingVerification: false, missingAuditEvidence: false, lowConfidence: false, outcome: "completed" });
});

test("every Quality runtime INSERT binds exactly one value per SQL placeholder", async () => {
  const file = "db/quality-evaluations.ts", sourceText = await read(file);
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
  assert.ok(checked.length >= 8, "expected every Quality runtime INSERT to be checked");
});

test("Quality runtime migration is property-scoped, blocks false approval, and rolls back only its additions", async () => {
  const [module15, module16, migration, rollback] = await Promise.all([
    read("migrations/0058_digital_employee_evals.sql"),
    read("migrations/0059_progressive_autonomy.sql"),
    read("migrations/0079_quality_center_eval_runtime.sql"),
    read("migrations/rollbacks/0079_quality_center_eval_runtime_rollback.sql"),
  ]);
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec(module15); db.exec(module16); db.exec(migration);
  const insertBatch = db.prepare(`INSERT INTO eval_batches
    (id,organization_id,property_id,role_code,source_catalog_version,model_version,prompt_version,status,deployment_gate,review_decision,total_cases,passed_cases,failed_cases,critical_failures,major_failures,regressions,summary_json,correlation_id,started_by,started_at)
    VALUES(?,?,?,?,?,?,?,'PASSED','PASS','PENDING',24,24,0,0,0,0,'{}',?,?,?)`);
  insertBatch.run("batch-a", "org", "property-a", "FRONT_DESK", "catalog", "engine", "none", "corr-a", "admin", "now");
  insertBatch.run("batch-b", "org", "property-b", "FRONT_DESK", "catalog", "engine", "none", "corr-b", "admin", "now");
  assert.equal(db.prepare("SELECT count(*) count FROM eval_batches WHERE organization_id='org' AND property_id='property-a'").get().count, 1);
  assert.throws(() => db.prepare(`INSERT INTO eval_batches
    (id,organization_id,property_id,role_code,source_catalog_version,model_version,prompt_version,status,deployment_gate,review_decision,total_cases,passed_cases,failed_cases,critical_failures,major_failures,regressions,summary_json,correlation_id,started_by,started_at,reviewed_by)
    VALUES('blocked','org','property-a','FRONT_DESK','catalog','engine','none','BLOCKED','BLOCKED','APPROVED',24,23,1,1,0,0,'{}','corr','admin','now','admin')`).run(), /CHECK constraint failed/);
  db.exec(rollback);
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name='eval_cases'").get());
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='eval_batches'").get(), undefined);
});

test("Quality service, route, UI, and scheduler implement the full verification chain without read-side seeding", async () => {
  const [service, route, ui, worker, migration] = await Promise.all([
    read("db/quality-evaluations.ts"), read("app/api/v1/quality-center/route.ts"),
    read("app/aaiq-quality-center/quality-center-client.tsx"), read("worker/index.ts"),
    read("migrations/0079_quality_center_eval_runtime.sql"),
  ]);
  const readFunction = service.slice(service.indexOf("export async function qualityEvaluationCenter"), service.indexOf("export async function prepareGoldenLibrary"));
  assert.doesNotMatch(readFunction, /roleParityCenter\(/, "opening Quality Center must not seed or mutate the role catalog");
  assert.match(service, /buildRoleParityCases/);
  assert.match(service, /evaluateRoleParityCase/);
  assert.match(service, /baseline_batch_id/);
  assert.match(service, /releaseReviewAllowed/);
  assert.match(service, /quality_shadow_classifications/);
  assert.match(service, /recordSystemAudit/);
  assert.match(service, /current_trust_score=0/);
  assert.match(route, /PREPARE_GOLDEN_LIBRARY/);
  assert.match(route, /RUN_EVAL_SUITE/);
  assert.match(route, /REVIEW_EVAL_BATCH/);
  assert.match(route, /RUN_SHADOW_MONITOR/);
  assert.match(route, /REVIEW_SHADOW_AUDIT/);
  assert.match(worker, /runScheduledQualityMonitoring/);
  assert.match(ui, /Prepare & run role suite/);
  assert.match(ui, /Exact role evaluation history/);
  assert.match(ui, /Silent-failure review queue/);
  assert.match(ui, /A critical failure cannot be overridden/);
  assert.match(ui, /STRUCTURAL CHECKS — NOT FUNCTIONAL PROOF/);
  assert.match(ui, /Judged and hybrid evaluations: configuration required/);
  assert.match(migration, /CHECK\(deployment_gate!='BLOCKED' OR review_decision!='APPROVED'\)/);
});
