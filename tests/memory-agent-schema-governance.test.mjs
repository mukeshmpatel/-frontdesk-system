import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("Organizational Memory never mutates schema during recall or save", async () => {
  const service = await read("../db/memory-agent.ts");
  assert.doesNotMatch(service, /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX)\b/i);
  assert.match(service, /async function ensure\(\)\{\s*db\(\);\s*\}/);
});

test("Organizational Memory migration is repeatable and preserves recalled records", async () => {
  const migration = await read("../drizzle/0011_memory_agent_and_briefing_preferences.sql");
  const db = new DatabaseSync(":memory:");
  db.exec(migration);
  db.prepare("INSERT INTO agent_memories VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run("memory-1", "org-1", "owner@example.com", "Pilot note", "Preserve this record", "MANUAL", "", null, "2026-08-02T00:00:00Z", "2029-08-02T00:00:00Z", "[]", "2026-08-02T00:00:00Z", "2026-08-02T00:00:00Z");
  db.exec(migration);
  assert.equal(db.prepare("SELECT content FROM agent_memories WHERE id=?").get("memory-1").content, "Preserve this record");
});
