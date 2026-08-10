import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("Sample Lab never mutates schema while listing or cloning environments", async () => {
  const service = await read("../db/sample-environments.ts");
  assert.doesNotMatch(service, /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX)\b/i);
  assert.doesNotMatch(service, /PRAGMA table_info/);
  assert.match(service, /async function ensure\(\) \{\s*db\(\);/);
});

test("Sample Lab migration is repeatable and preserves cloned environments", async () => {
  const migration = await read("../migrations/0056_sample_environment_schema_governance.sql");
  const db = new DatabaseSync(":memory:");
  db.exec(migration);
  db.prepare("INSERT INTO sample_environment_clones VALUES (?,?,?,?,?,?,?,?,?,?,?)")
    .run("clone-1", "template-1", 1, "org-1", "property-1", "SAMPLE-1", "Pilot Clone", "READY", "{}", "owner@example.com", "2026-08-02T00:00:00Z");
  db.exec(migration);
  assert.equal(db.prepare("SELECT status FROM sample_environment_clones WHERE id=?").get("clone-1").status, "READY");
  for (const table of ["sample_environment_templates", "sample_environment_clones", "sample_environment_audit", "ai_agent_registry", "sample_social_accounts", "sample_report_facts"]) {
    assert.equal(db.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name=?").get(table).count, 1);
  }
});
