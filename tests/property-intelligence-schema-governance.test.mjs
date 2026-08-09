import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const root = process.cwd();
const read = file => readFile(path.join(root, file), "utf8");

test("Property Intelligence never mutates inventory schema at request time", async () => {
  const service = await read("db/property-intelligence.ts");
  assert.doesNotMatch(service, /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX)\b/i);
  assert.match(service, /async function ensureTables\(\) \{\s*db\(\);\s*\}/);
});

test("Inventory and Procurement migration chain owns every workflow table and item field", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(await read("migrations/baselines/release68_operational_work_orders.sql"));
  const drizzle = (await readdir(path.join(root, "drizzle"))).filter(file => file.endsWith(".sql")).sort();
  for (const file of drizzle) db.exec((await read(path.join("drizzle", file))).replaceAll("--> statement-breakpoint", ";"));
  const migrations = (await readdir(path.join(root, "migrations"))).filter(file => /^\d{4}_.+\.sql$/.test(file)).sort();
  for (const file of migrations) db.exec(await read(path.join("migrations", file)));
  const columns = db.prepare("PRAGMA table_info(supply_inventory)").all().map(column => column.name);
  for (const column of ["property_id", "location_id", "par_quantity", "committed_quantity", "on_order_quantity", "preferred_vendor_id", "hazardous"]) {
    assert.ok(columns.includes(column), `missing supply_inventory.${column}`);
  }
  for (const table of ["supply_order_drafts", "inventory_transactions", "inventory_requisitions", "inventory_vendors", "inventory_locations", "inventory_purchase_orders", "inventory_purchase_order_lines", "inventory_count_sessions", "inventory_count_lines"]) {
    assert.equal(db.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name=?").get(table).count, 1, `missing ${table}`);
  }
});
