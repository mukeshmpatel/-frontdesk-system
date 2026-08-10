import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const root = process.cwd();
const service = fs.readFileSync(path.join(root, "db/customer-intelligence.ts"), "utf8");
const migration = fs.readFileSync(path.join(root, "migrations/0050_customer_intelligence_schema_governance.sql"), "utf8");
const expectedTables = [
  "cdp_source_registry", "cdp_customer_profiles", "cdp_tracking_events", "cdp_transactions",
  "cdp_activation_requests", "cdp_geo_audiences", "cdp_audit_events",
];

test("Customer Intelligence request path contains no runtime DDL", () => {
  assert.doesNotMatch(service, /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX)\b/i);
});

test("Customer Intelligence migration owns every CDP table and preserves data on reapplication", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(migration);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'cdp_%'").all().map(row => row.name);
  for (const table of expectedTables) assert.ok(tables.includes(table), `${table} was not created`);

  db.prepare("INSERT INTO cdp_customer_profiles (id,organization_id,property_id,customer_ref,cohort_tags_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?)")
    .run("guest-1", "org-1", "property-1", "GUEST-001", "[]", "2026-08-02T00:00:00Z", "2026-08-02T00:00:00Z");
  db.exec(migration);
  assert.equal(db.prepare("SELECT customer_ref FROM cdp_customer_profiles WHERE id=?").get("guest-1").customer_ref, "GUEST-001");
});
