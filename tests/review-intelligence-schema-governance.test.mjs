import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("Review Intelligence never mutates schema during guest workflows", async () => {
  const service = await read("../db/review-intelligence.ts");
  assert.doesNotMatch(service, /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX)\b/i);
  assert.match(service, /async function ensureTables\(\) \{\s*db\(\);\s*\}/);
});

test("Review Intelligence migration chain owns complete response and recovery lifecycles", async () => {
  const taxFoundation = await read("../drizzle/0016_tax_and_evidence_intelligence.sql");
  const reviewFoundation = await read("../drizzle/0017_reviews_ota_website_factory.sql");
  const growthExtension = await read("../drizzle/0018_growth_tax_review_rules.sql");
  const lifecycle = await read("../migrations/0053_review_intelligence_lifecycle_columns.sql");
  const db = new DatabaseSync(":memory:");
  db.exec(taxFoundation);
  db.exec(reviewFoundation);
  db.exec(growthExtension);
  db.exec(lifecycle);
  const draftColumns = db.prepare("PRAGMA table_info(review_response_drafts)").all().map(row => row.name);
  const caseColumns = db.prepare("PRAGMA table_info(review_recovery_cases)").all().map(row => row.name);
  assert.ok(draftColumns.includes("posted_at"));
  assert.ok(caseColumns.includes("resolved_at"));
  db.prepare("INSERT INTO review_recovery_cases VALUES (?,?,?,?,?,?,?,?,?,?)")
    .run("case-1", "org-1", "review-1", "HIGH", "EXECUTIVE", "Guest recovery", "RESOLVED", "owner@example.com", "2026-08-02T00:00:00Z", "2026-08-02T01:00:00Z");
  assert.equal(db.prepare("SELECT status FROM review_recovery_cases WHERE id=?").get("case-1").status, "RESOLVED");
});
