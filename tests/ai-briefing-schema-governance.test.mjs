import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("Automated Briefing never mutates schema during generation or scheduling", async () => {
  const service = await read("../db/ai-briefing.ts");
  assert.doesNotMatch(service, /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX)\b/i);
  assert.match(service, /async function ensureTables\(\) \{\s*db\(\);\s*\}/);
});

test("Briefing migrations are repeatable and preserve generated role briefings", async () => {
  const briefing = (await read("../drizzle/0010_ai_rules_role_briefings.sql")).replaceAll("--> statement-breakpoint", ";");
  const preferences = (await read("../drizzle/0011_memory_agent_and_briefing_preferences.sql")).replaceAll("--> statement-breakpoint", ";");
  const db = new DatabaseSync(":memory:");
  db.exec(briefing);
  db.exec(preferences);
  db.prepare("INSERT INTO daily_briefings VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run("briefing-1", "org-1", "manager@example.com", "Manager", "EXECUTIVE", "MANAGER", "2026-08-02", "Daily briefing", "Pilot summary", "[]", "READY", "2026-08-02T00:00:00Z", null);
  db.exec(briefing);
  db.exec(preferences);
  assert.equal(db.prepare("SELECT summary FROM daily_briefings WHERE id=?").get("briefing-1").summary, "Pilot summary");
  for (const table of ["ai_automation_rules", "briefing_policies", "daily_briefings", "briefing_preferences"]) {
    assert.equal(db.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name=?").get(table).count, 1);
  }
});
