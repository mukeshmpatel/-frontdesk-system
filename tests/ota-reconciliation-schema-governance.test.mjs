import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("OTA reconciliation never mutates schema during import or reporting", async () => {
  const service = await read("../db/ota-reconciliation.ts");
  assert.doesNotMatch(service, /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX)\b/i);
  assert.match(service, /async function ensure\(\)\{\s*db\(\);\s*\}/);
});

test("OTA reconciliation migration is repeatable and preserves reservation records", async () => {
  const migration = await read("../drizzle/0017_reviews_ota_website_factory.sql");
  const db = new DatabaseSync(":memory:");
  db.exec(migration);
  db.prepare("INSERT INTO distribution_reservation_records VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run("reservation-1", "org-1", "PMS", "external-1", "CONF-1", "Test Guest", "2026-08-02", "2026-08-03", "KING", "RESERVED", 149, 0, "USD", "test.csv", "owner@example.com", "2026-08-02T00:00:00Z");
  db.exec(migration);
  assert.equal(db.prepare("SELECT confirmation_number FROM distribution_reservation_records WHERE id=?").get("reservation-1").confirmation_number, "CONF-1");
});
