import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("Governed Integrations never mutates schema while handling credentials or runs", async () => {
  const service = await read("../db/open-source-integrations.ts");
  assert.doesNotMatch(service, /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX)\b/i);
  assert.match(service, /ensureIntegrationPlatform\(\) \{\s*db\(\);\s*\}/);
  assert.match(service, /secret\.length < 32/);
  assert.match(service, /AES-GCM/);
});

test("Governed Integration migration is repeatable and preserves connector evidence", async () => {
  const migration = await read("../drizzle/0024_access_ai_integrations.sql");
  const db = new DatabaseSync(":memory:");
  db.exec(migration);
  db.prepare("INSERT INTO integration_runs VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run("run-1", "org-1", "property-1", "UNIFI", "HEALTH_CHECK", "SUCCEEDED", "owner@example.com", "{}", "{}", "APPROVED", 25, null, "2026-08-02T00:00:00Z", "2026-08-02T00:00:01Z");
  db.exec(migration);
  assert.equal(db.prepare("SELECT status FROM integration_runs WHERE id=?").get("run-1").status, "SUCCEEDED");
  for (const table of ["governed_integrations", "integration_credentials", "integration_runs", "organizational_memory_records", "social_publication_requests"]) {
    assert.equal(db.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name=?").get(table).count, 1);
  }
});
