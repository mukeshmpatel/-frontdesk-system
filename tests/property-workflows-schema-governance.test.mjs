import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const root = process.cwd();
const read = file => readFile(path.join(root, file), "utf8");

test("Property Workflows never mutates schema during operational requests", async () => {
  const service = await read("db/property-workflows.ts");
  assert.doesNotMatch(service, /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX)\b/i);
  assert.doesNotMatch(service, /PRAGMA table_info/);
  assert.match(service, /async function ensureTables\(\) \{\s*db\(\);\s*\}/);
});

test("Property Workflow migration chain owns asset and property scope without losing work orders", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(await read("migrations/baselines/release68_operational_work_orders.sql"));
  db.exec(`INSERT INTO operational_work_orders(id,organization_id,department,work_type,title,description,status,progress,priority,created_by,created_at,updated_at)
    VALUES('order-1','org-1','MAINTENANCE','REPAIR','PTAC repair','Guest room PTAC','OPEN',0,'HIGH','owner@example.com','2026-08-02T00:00:00Z','2026-08-02T00:00:00Z')`);
  const drizzle = (await readdir(path.join(root, "drizzle"))).filter(file => file.endsWith(".sql")).sort();
  for (const file of drizzle) db.exec((await read(path.join("drizzle", file))).replaceAll("--> statement-breakpoint", ";"));
  const columns = db.prepare("PRAGMA table_info(operational_work_orders)").all().map(row => row.name);
  assert.ok(columns.includes("asset_id"));
  assert.ok(columns.includes("property_id"));
  assert.equal(db.prepare("SELECT title FROM operational_work_orders WHERE id=?").get("order-1").title, "PTAC repair");
  for (const table of ["work_order_attachments", "maintenance_compliance_templates", "work_order_steps", "night_room_report_imports", "work_evidence_reviews"]) {
    assert.ok(db.prepare(`PRAGMA table_info(${table})`).all().some(row => row.name === "property_id"), `${table} lacks property scope`);
  }
});
