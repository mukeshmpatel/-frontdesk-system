import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("Workforce kiosk never mutates schema during a punch", async () => {
  const service = await read("../db/workforce-kiosk.ts");
  assert.doesNotMatch(service, /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX)\b/i);
  assert.doesNotMatch(service, /PRAGMA table_info/);
  assert.match(service, /async function ensure\(\) \{\s*db\(\);\s*\}/);
});

test("Workforce migration property-scopes entries and breaks while preserving punches", async () => {
  const foundation = (await read("../drizzle/0003_chemical_reptil.sql")).replaceAll("--> statement-breakpoint", ";");
  const kiosk = await read("../drizzle/0025_workforce_kiosk.sql");
  const propertyScope = await read("../migrations/0054_workforce_property_scope.sql");
  const db = new DatabaseSync(":memory:");
  db.exec(foundation);
  db.exec(kiosk);
  db.exec("CREATE TABLE property_contexts(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,code TEXT NOT NULL,created_at TEXT NOT NULL)");
  db.prepare("INSERT INTO property_contexts VALUES (?,?,?,?)").run("property-1", "org-1", "WG-SALINA", "2026-08-02T00:00:00Z");
  db.prepare(`INSERT INTO time_entries
    (id,organization_id,user_email,clock_in_at,clock_out_at,clock_in_ip,clock_out_ip,location_name,note,status,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run("entry-1", "org-1", "employee@example.com", "2026-08-02T00:00:00Z", null, "127.0.0.1", "", "Hotel", "Pilot shift", "open", "2026-08-02T00:00:00Z", "2026-08-02T00:00:00Z");
  db.exec(propertyScope);
  assert.equal(db.prepare("SELECT status FROM time_entries WHERE id=?").get("entry-1").status, "open");
  const entryColumns = db.prepare("PRAGMA table_info(time_entries)").all().map(row => row.name);
  const breakColumns = db.prepare("PRAGMA table_info(time_breaks)").all().map(row => row.name);
  assert.ok(entryColumns.includes("property_id"));
  assert.ok(breakColumns.includes("property_id"));
});
