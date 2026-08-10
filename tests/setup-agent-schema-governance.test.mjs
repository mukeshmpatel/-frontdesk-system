import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("Setup Agent request path contains no runtime DDL", async () => {
  const service = await read("../db/setup-agent.ts");
  assert.doesNotMatch(service, /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX)\b/i);
  assert.match(service, /async function ensure\(\)\{db\(\)\}/);
});

test("Setup Agent migration is repeatable and preserves approved plans", async () => {
  const migration = await read("../migrations/0051_setup_agent_schema_governance.sql");
  const db = new DatabaseSync(":memory:");
  db.exec(migration);
  db.prepare("INSERT INTO ai_setup_sessions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run("plan-1", "org-1", "owner@example.com", "TEXT", "Create a hotel", "PROPERTY", "READY_FOR_APPROVAL", "{}", "[]", "[]", "2026-08-02T00:00:00Z", "2026-08-02T00:00:00Z", null, null);
  db.exec(migration);
  assert.equal(db.prepare("SELECT status FROM ai_setup_sessions WHERE id=?").get("plan-1").status, "READY_FOR_APPROVAL");
});
