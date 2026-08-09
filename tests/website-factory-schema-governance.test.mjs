import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const root = process.cwd();
const read = file => readFile(path.join(root, file), "utf8");

test("Website Factory never mutates schema while loading or publishing a site", async () => {
  const service = await read("db/website-factory.ts");
  assert.doesNotMatch(service, /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX)\b/i);
  assert.doesNotMatch(service, /PRAGMA table_info/);
  assert.match(service, /async function ensure\(\) \{\s*db\(\);\s*\}/);
});

test("Website Factory migration chain preserves projects and owns queue indexes", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(await read("migrations/baselines/release68_operational_work_orders.sql"));
  const drizzle = (await readdir(path.join(root, "drizzle"))).filter(file => file.endsWith(".sql")).sort();
  for (const file of drizzle) db.exec((await read(path.join("drizzle", file))).replaceAll("--> statement-breakpoint", ";"));
  const queryIndexes = await read("migrations/0055_website_factory_query_indexes.sql");
  db.exec(queryIndexes);
  db.prepare(`INSERT INTO website_factory_projects
    (id,organization_id,property_asset_id,name,slug,theme,status,content_json,seo_json,missing_fields_json,
     created_by,created_at,updated_at,published_at,property_context_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run("site-1", "org-1", "asset-1", "Pilot Hotel", "pilot-hotel", "MODERN", "DRAFT", "{}", "{}", "[]", "owner@example.com", "2026-08-02T00:00:00Z", "2026-08-02T00:00:00Z", null, "property-1");
  db.exec(queryIndexes);
  assert.equal(db.prepare("SELECT status FROM website_factory_projects WHERE id=?").get("site-1").status, "DRAFT");
  for (const index of ["property_reconciliation_status_idx", "website_project_property_idx"]) {
    assert.equal(db.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE type='index' AND name=?").get(index).count, 1);
  }
});
