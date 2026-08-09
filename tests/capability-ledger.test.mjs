import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { CAPABILITY_LEDGER_BASELINE } from "../lib/capability-ledger-baseline.ts";

function sourceButtonCount(directory = "app") {
  let count = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === ".next" || entry.name === "node_modules") continue;
    const location = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      count += sourceButtonCount(location);
      continue;
    }
    if (!entry.name.endsWith(".tsx")) continue;
    const tree = ts.createSourceFile(location, readFileSync(location, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(node) {
      if (ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === "button") count++;
      if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(tree) === "button") count++;
      ts.forEachChild(node, visit);
    }
    visit(tree);
  }
  return count;
}

test("truthful baseline inventories every required item class without self-verification", () => {
  const types = new Set(CAPABILITY_LEDGER_BASELINE.map(row => row.itemType));
  assert.deepEqual([...types].sort(), ["button", "digital_employee_duty", "integration", "module", "report"]);
  assert.equal(CAPABILITY_LEDGER_BASELINE.some(row => row.status === "working_verified"), false);
  assert.equal(CAPABILITY_LEDGER_BASELINE.filter(row => row.itemType === "module").length, 33);
  assert.equal(CAPABILITY_LEDGER_BASELINE.filter(row => row.itemType === "button").length, sourceButtonCount());
  assert.equal(CAPABILITY_LEDGER_BASELINE.filter(row => row.itemType === "digital_employee_duty").length, 23);
  assert.equal(CAPABILITY_LEDGER_BASELINE.filter(row => row.itemType === "integration").length, 34);
  assert.equal(CAPABILITY_LEDGER_BASELINE.filter(row => row.itemType === "report").length, 20);
  assert.equal(new Set(CAPABILITY_LEDGER_BASELINE.map(row => row.itemKey)).size, CAPABILITY_LEDGER_BASELINE.length);
});

test("verified ledger state is constrained to human-reviewed stored evidence", () => {
  const migration = readFileSync("migrations/0073_strict_capability_verification.sql", "utf8");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS capability_ledger/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS workflow_verification_runs/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS digital_employee_duties/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS digital_employee_work_queue/);
  assert.match(migration, /status!='working_verified' OR/);
  assert.match(migration, /reviewed_by IS NOT NULL/);
  assert.match(migration, /failure_case_tested/);
  const service = readFileSync("db/capability-ledger.ts", "utf8");
  assert.match(service, /run\.verification_result !== "pass"/);
  assert.match(service, /Number\(run\.failure_case_tested\) !== 1/);
  assert.match(service, /CAPABILITY_LEDGER_HUMAN_REVIEWED/);
});

test("structural checks are visibly and numerically separated from functional proof", () => {
  const client = readFileSync("app/aaiq-quality-center/quality-center-client.tsx", "utf8");
  assert.match(client, /STRUCTURAL CHECKS — NOT FUNCTIONAL PROOF/);
  assert.match(client, /STRUCTURAL HEALTH SCORE/);
  assert.match(client, /not a release score/);
  assert.match(client, /Stored seven-question verification runs/);
  assert.doesNotMatch(client, /RELEASE SCORE/);
  assert.doesNotMatch(client, /Run autonomous QA/);
});

test("ordinary navigation no longer advertises unverified modules as live", () => {
  const capabilities = readFileSync("lib/aaiq-capabilities.ts", "utf8");
  assert.doesNotMatch(capabilities, /badge: "LIVE"/);
  assert.doesNotMatch(capabilities, /badge: "AI"/);
  const shell = readFileSync("app/components/aaiq-app-shell.tsx", "utf8");
  assert.match(shell, /capability-ledger\?itemType=module/);
  assert.match(shell, /status==="working_verified"\?"VERIFIED"/);
});
