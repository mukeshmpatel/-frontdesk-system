import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("groundedOperationsSchema captures decision ownership, business impact, and before/after action evidence", async () => {
  const runtime = await read("app/server/agents/agent-runtime.ts");
  assert.match(runtime, /nextOwner: z\.string\(\)/);
  assert.match(runtime, /businessImpact: z\.string\(\)/);
  assert.match(runtime, /beforeState: z\.string\(\)\.nullable\(\)/);
  assert.match(runtime, /afterState: z\.string\(\)\.nullable\(\)/);
});

test("buildOutcomeRecord assembles the full blueprint Outcome Record from existing run + output data", async () => {
  const runtime = await read("app/server/agents/agent-runtime.ts");
  assert.match(runtime, /export function buildOutcomeRecord/);
  for (const field of [
    "runId", "requestedBy", "intent", "organizationId", "propertyId", "propertyName",
    "sourcesConsulted", "findings", "decision", "confidence", "actionStatus", "actionsTaken",
    "businessImpact", "exceptions", "nextOwner", "nextAction", "correlationId",
  ]) assert.match(runtime, new RegExp(`\\b${field}\\b`), `OutcomeRecord is missing field ${field}`);
  assert.match(runtime, /runGroundedOperationsAgent[\s\S]*outcomeRecord: buildOutcomeRecord\(run, intent, status, output\)/);
});

test("the maintenance dispatcher's separate schema is normalized into the same Outcome Record contract", async () => {
  const service = await read("app/server/agents/maintenance-briefing-agent.ts");
  assert.match(service, /export function normalizeMaintenanceBriefing/);
  assert.match(service, /nextOwner: "Maintenance Coordinator"/);
  assert.match(service, /businessImpact:/);
  assert.match(service, /outcomeRecord: buildOutcomeRecord\(run, intent, status, normalizeMaintenanceBriefing\(output\)\)/);
});

test("the chat command surface persists and returns nextOwner, businessImpact, and the outcome record", async () => {
  const command = await read("app/server/agents/digital-employee-command.ts");
  assert.match(command, /nextOwner: briefing\?\.nextOwner/);
  assert.match(command, /businessImpact: briefing\?\.businessImpact/);
  assert.match(command, /outcomeRecord,/);
  assert.match(command, /nextOwner: briefing\.nextOwner, businessImpact: briefing\.businessImpact/);
});

test("registry governance instructs every agent to name a real owner and ground business impact in cited findings", async () => {
  const registry = await read("app/server/agents/digital-employee-registry.ts");
  assert.match(registry, /Name the specific\nrole or queue who should own that next action in nextOwner/);
  assert.match(registry, /never a fabricated named individual/);
  assert.match(registry, /businessImpact, grounded only in the findings/);
});

test("nextOwner and businessImpact are rendered, not silently discarded", async () => {
  const [studio, home] = await Promise.all([
    read("app/aaiq-agent-studio/agent-studio-client.tsx"),
    read("app/components/aaiq-daily-briefing.tsx"),
  ]);
  assert.match(studio, /output\.nextOwner/);
  assert.match(studio, /output\.businessImpact/);
  assert.match(home, /result\.nextOwner/);
  assert.match(home, /result\.businessImpact/);
});
