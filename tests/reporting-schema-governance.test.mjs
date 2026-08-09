import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const root = new URL("../", import.meta.url);

test("Enterprise Reporting never creates or alters schema during a report request", async () => {
  const service = await readFile(new URL("db/reporting-insights.ts", root), "utf8");
  assert.doesNotMatch(service, /\bCREATE\s+TABLE\b/i);
  assert.doesNotMatch(service, /\bALTER\s+TABLE\b/i);
  assert.doesNotMatch(service, /\bDROP\s+TABLE\b/i);
});

test("the authoritative Release 68 migration owns reporting work-order prerequisites", async () => {
  const migration = await readFile(
    new URL("migrations/baselines/release68_operational_work_orders.sql", root),
    "utf8",
  );
  const database = new DatabaseSync(":memory:");
  database.exec(migration);

  const tables = database
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all()
    .map((row) => row.name);

  assert.ok(tables.includes("operational_work_orders"));
  assert.ok(tables.includes("work_order_attachments"));

  database.prepare(`INSERT INTO operational_work_orders
    (id,organization_id,department,work_type,title,description,status,progress,priority,created_by,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      "reporting-governance-check",
      "test-org",
      "MAINTENANCE",
      "REPAIR",
      "Migration-owned work order",
      "Reporting reads this record without changing schema",
      "OPEN",
      0,
      "MEDIUM",
      "test@example.com",
      "2026-08-02T00:00:00.000Z",
      "2026-08-02T00:00:00.000Z",
    );

  const preserved = database
    .prepare("SELECT id,status FROM operational_work_orders WHERE id=?")
    .get("reporting-governance-check");
  assert.equal(preserved.id, "reporting-governance-check");
  assert.equal(preserved.status, "OPEN");
});
