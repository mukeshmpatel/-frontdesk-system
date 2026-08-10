import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const root = process.cwd();
const read = file => readFile(path.join(root, file), "utf8");

test("Enterprise Operations never mutates schema while resolving property context", async () => {
  const service = await read("db/enterprise-operations.ts");
  assert.doesNotMatch(service, /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX)\b/i);
  assert.match(service, /async function ensureTables\(\) \{\s*db\(\);\s*\}/);
});

test("Enterprise Operations migration chain owns canonical property and front-desk records", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(await read("migrations/baselines/release68_operational_work_orders.sql"));
  const drizzle = (await readdir(path.join(root, "drizzle"))).filter(file => file.endsWith(".sql")).sort();
  for (const file of drizzle) db.exec((await read(path.join("drizzle", file))).replaceAll("--> statement-breakpoint", ";"));
  db.prepare("INSERT INTO property_contexts VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
    .run("property-1", "org-1", "WG-SALINA", "Wyndham Garden Salina Conference Center", "2110 W Crawford St, Salina, KS 67401", "America/Chicago", "SHARED_SCHEMA", null, "ACTIVE", "owner@example.com", "2026-08-02T00:00:00Z", "2026-08-02T00:00:00Z");
  db.prepare(`INSERT INTO front_desk_operational_records
    (id,organization_id,property_id,correlation_id,record_type,category,title,description,priority,status,
     source_type,details_json,ai_status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run("record-1", "org-1", "property-1", "pilot-record-1", "HANDOFF", "SHIFT", "Pilot handoff", "Preserve this handoff", "HIGH", "RECEIVED", "MANUAL", "{}", "NOT_REQUESTED", "owner@example.com", "2026-08-02T00:00:00Z", "2026-08-02T00:00:00Z");
  assert.equal(db.prepare("SELECT address FROM property_contexts WHERE id=?").get("property-1").address, "2110 W Crawford St, Salina, KS 67401");
  assert.equal(db.prepare("SELECT title FROM front_desk_operational_records WHERE id=?").get("record-1").title, "Pilot handoff");
  for (const table of ["property_assignments", "user_context_preferences", "operational_status_history", "domain_outbox_events", "automation_exceptions"]) {
    assert.equal(db.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name=?").get(table).count, 1);
  }
});
