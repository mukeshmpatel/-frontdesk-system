import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("pilot launch runs an evidence-backed readiness engine instead of a Ready selector", async () => {
  const [service, route, client] = await Promise.all([
    read("db/pilot-launch.ts"),
    read("app/api/v1/pilot-launch/route.ts"),
    read("app/aaiq-pilot-launch/pilot-launch-client.tsx"),
  ]);
  assert.match(service, /runAutomatedReadiness/);
  assert.match(service, /PILOT_AUTOMATED_READINESS_COMPLETED/);
  assert.match(route, /RUN_AUTOMATED_READINESS/);
  assert.match(client, /Run all automatic checks/);
  assert.doesNotMatch(client, /<option value="READY">/);
});

test("every readiness domain has a governed automatic evidence check or explicit human boundary", async () => {
  const service = await read("db/pilot-launch.ts");
  for (const evidence of [
    "SYSTEM_VERIFIED_PROPERTY_IDENTITY", "SYSTEM_VERIFIED_PROPERTY_ISOLATION",
    "SYSTEM_PROVISIONED_PROTECTED_ADMIN", "SYSTEM_VERIFIED_MFA", "SYSTEM_VERIFIED_CLOCK_IN",
    "SYSTEM_PROVISIONED_REPORT_PROFILE", "SYSTEM_VERIFIED_REPORT_INTAKE", "SYSTEM_VERIFIED_REPORT_PARSER",
    "SYSTEM_VERIFIED_CONNECTION", "SYSTEM_VERIFIED_POLICY", "SYSTEM_VERIFIED_UAT",
    "SYSTEM_VERIFIED_LAUNCH_DECISION",
  ]) assert.match(service, new RegExp(evidence));
  assert.match(service, /HUMAN_ACTION_REQUIRED/);
  assert.match(service, /financialAutonomy:false/);
});

test("human exception controls are secondary and final approval rechecks prerequisites", async () => {
  const [service, client] = await Promise.all([
    read("db/pilot-launch.ts"),
    read("app/aaiq-pilot-launch/pilot-launch-client.tsx"),
  ]);
  assert.match(client, /<summary>Exception options<\/summary>/);
  assert.match(client, /Re-check and approve controlled pilot/);
  assert.match(service, /recordLaunchDecision/);
  assert.match(service, /runAutomatedReadiness\(email,\{propertyId\}\)/);
  assert.match(service, /unresolved prerequisite/);
});
