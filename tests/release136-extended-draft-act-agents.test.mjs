import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("proposeApprovalCase writes into the existing shared approval queue, not a new table", async () => {
  const service = await read("db/agent-platform.ts");
  assert.match(service, /export async function proposeApprovalCase/);
  assert.match(service, /INSERT INTO ai_approval_cases/);
  assert.match(service, /VALUES \(\?,\?,\?,\?,\?,\?,'PENDING',\?,'MANAGER',\?,\?\)/);
  assert.doesNotMatch(service, /CREATE TABLE/i);
});

test("GroundedActionTool.execute receives the active run so it can bind run_id correctly", async () => {
  const runtime = await read("app/server/agents/agent-runtime.ts");
  assert.match(runtime, /execute: \(userEmail: string, params: Record<string, unknown>, run: any\) => Promise<unknown>;/);
  assert.match(runtime, /output = await action\.execute\(userEmail, params, run\);/);
});

test("housekeeping-coordinator and cash-auditor can now propose, not just diagnose", async () => {
  const registry = await read("app/server/agents/digital-employee-registry.ts");
  assert.match(registry, /const proposeHousekeepingTaskAction: GroundedActionTool/);
  assert.match(registry, /const proposeCashVarianceEscalationAction: GroundedActionTool/);
  assert.match(registry, /"housekeeping-coordinator": \{[\s\S]*?actions: \[proposeHousekeepingTaskAction\]/);
  assert.match(registry, /"cash-auditor": \{[\s\S]*?actions: \[proposeCashVarianceEscalationAction\]/);
  // Every propose tool must route through the shared, non-executing approval helper.
  assert.match(registry, /proposeHousekeepingTaskAction[\s\S]*?execute: async \(userEmail, params, run\) => proposeApprovalCase\(run,/);
  assert.match(registry, /proposeCashVarianceEscalationAction[\s\S]*?execute: async \(userEmail, params, run\) => proposeApprovalCase\(run,/);
});

test("the maintenance dispatcher gains a scoped dispatch proposal without losing its read-only guarantees", async () => {
  const service = await read("app/server/agents/maintenance-briefing-agent.ts");
  assert.match(service, /const proposeDispatchTool = tool\(\{/);
  assert.match(service, /name: "propose_maintenance_dispatch"/);
  assert.match(service, /it never assigns a technician, changes a work order's status, or reserves parts/);
  assert.match(service, /tools: \[workTool, complianceTool, assetTool, documentVaultTool, proposeDispatchTool\]/);
  assert.match(service, /Never approve\nwork, order parts, or bypass safety rules yourself\./);
});

test("no proposal tool bypasses the shared approval queue with a direct dispatch/assignment write", async () => {
  const [registry, maintenance] = await Promise.all([
    read("app/server/agents/digital-employee-registry.ts"),
    read("app/server/agents/maintenance-briefing-agent.ts"),
  ]);
  for (const forbidden of ["createMaintenanceCase", "ingestDepartureReport", "actOnHousekeepingAssignment", "actOnMaintenanceCase"]) {
    assert.doesNotMatch(registry, new RegExp(forbidden));
    assert.doesNotMatch(maintenance, new RegExp(forbidden));
  }
});

test("the maintenance schema now requires reporting every proposal in actionsTaken", async () => {
  const service = await read("app/server/agents/maintenance-briefing-agent.ts");
  assert.match(service, /actionsTaken: z\.array\(actionTakenSchema\)\.default\(\[\]\)/);
  assert.match(service, /actionsTaken: briefing\.actionsTaken \?\? \[\]/);
});
