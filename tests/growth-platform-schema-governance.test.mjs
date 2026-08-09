import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("Growth Platform never mutates schema during marketing workflows", async () => {
  const service = await read("../db/growth-platform.ts");
  assert.doesNotMatch(service, /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX)\b/i);
  assert.match(service, /async function ensure\(\)\{db\(\);\}/);
});

test("Growth Platform migration owns credentials, content, audiences, profiles, and audit", async () => {
  const taxFoundation = await read("../drizzle/0016_tax_and_evidence_intelligence.sql");
  const growth = await read("../drizzle/0018_growth_tax_review_rules.sql");
  const db = new DatabaseSync(":memory:");
  db.exec(taxFoundation);
  db.exec(growth);
  const required = ["integration_credential_vault", "marketing_content_items", "guest_behavior_events", "audience_segments", "platform_profile_updates", "growth_platform_audit"];
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name);
  for (const table of required) assert.ok(tables.includes(table), `${table} is not migration-owned`);
  db.prepare("INSERT INTO marketing_content_items VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run("content-1", "org-1", "Pilot offer", "SOCIAL", "Book direct", null, "[]", "DRAFT", null, 1, null, "owner@example.com", "2026-08-02T00:00:00Z", "2026-08-02T00:00:00Z");
  assert.equal(db.prepare("SELECT status FROM marketing_content_items WHERE id=?").get("content-1").status, "DRAFT");
});
