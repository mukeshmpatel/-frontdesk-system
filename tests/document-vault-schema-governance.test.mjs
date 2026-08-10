import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const root = process.cwd();
const read = file => readFile(path.join(root, file), "utf8");

test("Document Vault never creates custody schema during a user request", async () => {
  const service = await read("db/document-vault.ts");
  assert.doesNotMatch(service, /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX)\b/i);
  assert.match(service, /export async function ensureDocumentVault\(\) \{\s*database\(\);\s*\}/);
});

test("Document Vault migrations own the complete custody and retention lifecycle", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(await read("migrations/baselines/release68_operational_work_orders.sql"));
  const drizzle = (await readdir(path.join(root, "drizzle"))).filter(file => file.endsWith(".sql")).sort();
  for (const file of drizzle) db.exec((await read(path.join("drizzle", file))).replaceAll("--> statement-breakpoint", ";"));
  const migrations = (await readdir(path.join(root, "migrations"))).filter(file => /^\d{4}_.+\.sql$/.test(file)).sort();
  for (const file of migrations) db.exec(await read(path.join("migrations", file)));
  for (const table of ["document_records", "document_blobs", "document_versions", "document_derivatives", "document_ai_decisions", "document_retention_policies", "document_legal_holds", "document_access_events", "document_jobs", "document_signature_envelopes", "document_destruction_requests", "document_retention_overrides", "document_custody_certification_runs"]) {
    assert.equal(db.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name=?").get(table).count, 1, `missing ${table}`);
  }
  const destructionSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='document_destruction_requests'").get().sql;
  assert.match(destructionSql, /approved_by\s*<>\s*requested_by/i);
});
