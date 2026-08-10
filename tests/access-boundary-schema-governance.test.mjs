import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("Access Boundary never mutates security schema during authorization", async () => {
  const service = await read("../db/access-boundary.ts");
  assert.doesNotMatch(service, /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX)\b/i);
  assert.match(service, /ensureAccessBoundary\(\) \{\s*db\(\);\s*\}/);
});

test("Access Boundary and continuity migrations are repeatable and preserve security evidence", async () => {
  const access = await read("../drizzle/0024_access_ai_integrations.sql");
  const continuity = await read("../migrations/0039_security_continuity_drills.sql");
  const db = new DatabaseSync(":memory:");
  db.exec(access);
  db.exec(continuity);
  db.prepare("INSERT INTO access_boundary_events VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run("event-1", "org-1", "property-1", "employee@example.com", "POLICY_CHECK", "ALLOW", "127.0.0.1", null, null, null, "Verified", "/", "2026-08-02T00:00:00Z");
  db.exec(access);
  db.exec(continuity);
  assert.equal(db.prepare("SELECT decision FROM access_boundary_events WHERE id=?").get("event-1").decision, "ALLOW");
  for (const table of ["property_access_policies", "access_boundary_events", "continuity_drill_data", "continuity_drill_runs", "privileged_change_alerts"]) {
    assert.equal(db.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name=?").get(table).count, 1);
  }
});
