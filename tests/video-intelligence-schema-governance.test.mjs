import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const root = process.cwd();
const read = file => readFile(path.join(root, file), "utf8");

test("Video Intelligence never creates governance schema during a request", async () => {
  const service = await read("db/video-intelligence.ts");
  assert.doesNotMatch(service, /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX)\b/i);
  assert.match(service, /export async function ensureVideoIntelligence\(\)\{\s*database\(\);\s*\}/);
});

test("Video Intelligence migrations own the complete governed operating lifecycle", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(await read("migrations/baselines/release68_operational_work_orders.sql"));
  const drizzle = (await readdir(path.join(root, "drizzle"))).filter(file => file.endsWith(".sql")).sort();
  for (const file of drizzle) db.exec((await read(path.join("drizzle", file))).replaceAll("--> statement-breakpoint", ";"));
  const migrations = (await readdir(path.join(root, "migrations"))).filter(file => /^\d{4}_.+\.sql$/.test(file)).sort();
  for (const file of migrations) db.exec(await read(path.join("migrations", file)));
  for (const table of ["video_audits", "video_findings", "video_camera_registry", "video_model_registry", "express_checkin_sessions", "video_provider_adapters", "video_job_events", "video_evidence_checks", "video_action_proposals", "video_analysis_rules", "video_edge_nodes", "video_inventory_observations", "video_evidence_objects", "video_review_events", "identity_verification_cases", "express_checkin_steps", "video_model_metrics", "video_privacy_governance_profiles", "video_pilot_certification_runs", "express_checkin_compensation_events"]) {
    assert.equal(db.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name=?").get(table).count, 1, `missing ${table}`);
  }
  const governanceSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='video_privacy_governance_profiles'").get().sql;
  assert.match(governanceSql, /retention_days BETWEEN 1 AND 90/i);
});
