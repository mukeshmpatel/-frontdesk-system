import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("Quality Center requests contain no runtime DDL", async () => {
  const service = await read("../db/quality-center.ts");
  assert.doesNotMatch(service, /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX)\b/i);
  assert.match(service, /async function ensure\(\)\{db\(\)\}/);
});

test("Quality Center migration is repeatable and preserves QA evidence", async () => {
  const migration = await read("../migrations/0052_quality_center_schema_governance.sql");
  const db = new DatabaseSync(":memory:");
  db.exec(migration);
  db.prepare("INSERT INTO autonomous_qa_runs VALUES (?,?,?,?,?,?,?,?,?)")
    .run("run-1", "org-1", "property-1", "owner@example.com", "PASSED", 100, "{}", "2026-08-02T00:00:00Z", "2026-08-02T00:01:00Z");
  db.exec(migration);
  assert.equal(db.prepare("SELECT score FROM autonomous_qa_runs WHERE id=?").get("run-1").score, 100);
});
