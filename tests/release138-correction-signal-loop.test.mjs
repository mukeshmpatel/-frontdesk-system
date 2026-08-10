import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("ai_agent_correction_signals is a new, distinctly-keyed table, not a reuse of the older role_key system", async () => {
  const migration = await read("migrations/0086_ai_agent_correction_signals.sql");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS ai_agent_correction_signals/);
  assert.match(migration, /agent_key TEXT NOT NULL/);
  assert.match(migration, /run_id TEXT NOT NULL/);
  const createTable = migration.match(/CREATE TABLE IF NOT EXISTS ai_agent_correction_signals\([\s\S]*?\);/)[0];
  assert.doesNotMatch(createTable, /work_queue_id/);
});

test("migration 0086 applies cleanly", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(await read("migrations/0086_ai_agent_correction_signals.sql"));
  const columns = db.prepare("PRAGMA table_info(ai_agent_correction_signals)").all().map(c => c.name);
  for (const column of ["agent_key", "run_id", "approval_case_id", "action_type", "correction_reason", "corrected_by"])
    assert.ok(columns.includes(column), `missing column ${column}`);
});

test("rollback drops what the migration created", async () => {
  assert.match(await read("migrations/rollbacks/0086_ai_agent_correction_signals_rollback.sql"), /DROP TABLE IF EXISTS ai_agent_correction_signals/);
});

test("rejecting an approval case captures a correction signal traced back to its agent via the existing run/registry join", async () => {
  const service = await read("db/agent-platform.ts");
  assert.match(service, /if\(decision==="REJECTED"\)\{/);
  assert.match(service, /JOIN ai_runtime_agent_registry a ON a\.id=r\.agent_id WHERE r\.id=\?/);
  assert.match(service, /INSERT INTO ai_agent_correction_signals/);
  // Must not change decideAgentApproval's existing behavior for a case that isn't PENDING/found.
  assert.match(service, /WHERE id=\? AND organization_id=\? AND property_id=\? AND status='PENDING'/);
});

test("recentAgentCorrections is read-only and property/agent scoped", async () => {
  const service = await read("db/agent-platform.ts");
  assert.match(service, /export async function recentAgentCorrections\(organizationId: string, propertyId: string, agentKey: string, limit = 5\)/);
  assert.match(service, /WHERE organization_id=\? AND property_id=\? AND agent_key=\?/);
});

test("every registry agent and the maintenance dispatcher inject real correction history into their own instructions, never fabricated", async () => {
  const [runtime, maintenance] = await Promise.all([
    read("app/server/agents/agent-runtime.ts"),
    read("app/server/agents/maintenance-briefing-agent.ts"),
  ]);
  assert.match(runtime, /export async function correctionsInstructionAddendum/);
  assert.match(runtime, /if \(!corrections\.length\) return "";/);
  assert.match(runtime, /instructions: config\.instructions \+ correctionsAddendum,/);
  assert.match(maintenance, /correctionsInstructionAddendum\(run\.context\.organizationId, String\(run\.property\.id\), "maintenance-dispatcher"\)/);
  assert.match(maintenance, /\+ correctionsAddendum,/);
});

test("an agent with no correction history behaves exactly as before — empty addendum, no instructions change", async () => {
  const runtime = await read("app/server/agents/agent-runtime.ts");
  const fn = runtime.match(/export async function correctionsInstructionAddendum\([\s\S]*?\n\}/)[0];
  assert.match(fn, /if \(!corrections\.length\) return "";/);
});
