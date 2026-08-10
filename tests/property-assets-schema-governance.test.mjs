import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const root = process.cwd();
const read = file => readFile(path.join(root, file), "utf8");

test("Property Assets uses the migration-owned asset and operational schema", async () => {
  const service = await read("db/property-assets.ts");
  assert.doesNotMatch(service, /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX)\b/i);
  assert.match(service, /async function ensure\(\)\{\s*db\(\);\s*\}/);
});

test("Property Assets migration chain preserves a property-scoped room and evidence", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(await read("migrations/baselines/release68_operational_work_orders.sql"));
  const drizzle = (await readdir(path.join(root, "drizzle"))).filter(file => file.endsWith(".sql")).sort();
  for (const file of drizzle) db.exec((await read(path.join("drizzle", file))).replaceAll("--> statement-breakpoint", ";"));
  const migrations = (await readdir(path.join(root, "migrations"))).filter(file => /^\d{4}_.+\.sql$/.test(file)).sort();
  for (const file of migrations) db.exec(await read(path.join("migrations", file)));
  db.prepare(`INSERT INTO property_assets
    (id,organization_id,property_id,parent_id,asset_type,code,name,description,status,metadata_json,created_by_email,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run("room-101", "org-1", "property-1", "floor-1", "ROOM", "101", "Room 101", "Pilot room", "ACTIVE", "{}", "owner@example.com", "2026-08-02T00:00:00Z", "2026-08-02T00:00:00Z");
  db.prepare(`INSERT INTO property_asset_attachments
    (id,organization_id,asset_id,object_key,file_name,content_type,size_bytes,attachment_type,notes,uploaded_by,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run("evidence-1", "org-1", "room-101", "assets/evidence-1", "room.jpg", "image/jpeg", 100, "PHOTO", "Verified", "owner@example.com", "2026-08-02T00:00:00Z");
  assert.equal(db.prepare("SELECT property_id FROM property_assets WHERE id=?").get("room-101").property_id, "property-1");
  assert.equal(db.prepare("SELECT asset_id FROM property_asset_attachments WHERE id=?").get("evidence-1").asset_id, "room-101");
  for (const table of ["amenity_access_events", "cleaning_velocity_events", "supply_order_drafts"]) {
    assert.equal(db.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name=?").get(table).count, 1);
  }
});
