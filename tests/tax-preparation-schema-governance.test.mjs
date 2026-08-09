import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("Tax Preparation never mutates schema while importing or preparing returns", async () => {
  const service = await read("../db/tax-preparation.ts");
  assert.doesNotMatch(service, /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX)\b/i);
  assert.match(service, /async function ensureTaxTables\(\) \{\s*db\(\);\s*\}/);
});

test("Tax Preparation migration chain owns the complete tax schema and preserves workpapers", async () => {
  const foundation = await read("../drizzle/0016_tax_and_evidence_intelligence.sql");
  const extension = await read("../drizzle/0018_growth_tax_review_rules.sql");
  const db = new DatabaseSync(":memory:");
  db.exec(foundation);
  db.exec(extension);
  const profileColumns = db.prepare("PRAGMA table_info(tax_preparation_profiles)").all().map(row => row.name);
  const factColumns = db.prepare("PRAGMA table_info(tax_financial_facts)").all().map(row => row.name);
  for (const name of ["liquor_tax_rate", "consumer_compensating_tax_rate"]) assert.ok(profileColumns.includes(name));
  for (const name of ["liquor_sales", "liquor_tax_collected", "taxable_out_of_state_purchases", "consumer_compensating_tax_paid"]) assert.ok(factColumns.includes(name));
  db.prepare("INSERT INTO tax_return_workpapers VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
    .run("paper-1", "org-1", "2026-07-01", "2026-07-31", "ACCRUAL", "{}", "DRAFT", "[]", "owner@example.com", "2026-08-02T00:00:00Z", null, null);
  assert.equal(db.prepare("SELECT status FROM tax_return_workpapers WHERE id=?").get("paper-1").status, "DRAFT");
});
