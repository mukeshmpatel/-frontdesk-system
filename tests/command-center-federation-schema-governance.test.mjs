import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("Command Center federation never mutates schema during a request", async () => {
  const service = await read("../db/command-center-federation.ts");
  assert.doesNotMatch(service, /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX)\b/i);
  assert.match(service, /async function ensure\(\)\{db\(\)\}/);
});

test("Command Center migration is repeatable and preserves property mappings", async () => {
  const migration = await read("../migrations/0043_command_center_federation.sql");
  const db = new DatabaseSync(":memory:");
  db.exec(migration);
  db.prepare("INSERT INTO property_federation_mappings VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
    .run("map-1", "org-1", "property-1", "HOTEL_COMMAND_CENTER", "external-1", "Hotel One", "VERIFIED", "owner@example.com", "2026-08-02T00:00:00Z", "owner@example.com", "2026-08-02T00:00:00Z", "2026-08-02T00:00:00Z");
  db.exec(migration);
  assert.equal(db.prepare("SELECT external_property_name FROM property_federation_mappings WHERE id=?").get("map-1").external_property_name, "Hotel One");
});
