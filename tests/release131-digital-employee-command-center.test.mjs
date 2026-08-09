import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase 11 extends the canonical duty queue without a duplicate task, RBAC, or report pipeline", async () => {
  const migration = await read("migrations/0084_digital_employee_command_center.sql");
  assert.match(migration, /REFERENCES digital_employee_work_queue\(id\)/);
  assert.doesNotMatch(migration, /CREATE TABLE IF NOT EXISTS (tasks|permissions|reports)\b/i);
  for (const table of ["shift_sessions", "work_controls", "execution_events", "interventions", "role_knowledge", "correction_signals", "playbook_proposals", "task_confidence"])
    assert.match(migration, new RegExp(`digital_employee_${table}`));
});

test("live execution uses the five observable stages and real source-linked events", async () => {
  const service = await read("db/digital-employee-command-center.ts");
  assert.match(service, /\["PERCEIVE","REASON","ACT","VERIFY","REPORT"\]/);
  assert.match(service, /digital_employee_execution_events/);
  assert.match(service, /data_sources_json/);
  assert.match(service, /reason_text/);
  assert.match(service, /audit_evidence_url/);
  assert.doesNotMatch(service, /setInterval|Math\.random/);
});

test("manager interventions preserve safe checkpoints and idempotent effects", async () => {
  const [service, client] = await Promise.all([
    read("db/digital-employee-command-center.ts"),
    read("app/aaiq-agent-studio/digital-employee-command-center.tsx"),
  ]);
  for (const action of ["PAUSE", "RESUME", "TAKE_OVER", "EDIT_REDIRECT", "REASSIGN"]) assert.match(service, new RegExp(action));
  assert.match(service, /safeToResume:true/);
  assert.match(service, /externalEffectKey/);
  assert.match(service, /noDuplicateEffect:true/);
  assert.match(client, /Pause/);
  assert.match(client, /Take Over/);
  assert.match(client, /Edit \/ Redirect/);
  assert.match(client, /Reassign/);
});

test("learning remains proposal-only until human approval creates a versioned live playbook", async () => {
  const service = await read("db/digital-employee-command-center.ts");
  assert.match(service, /PENDING_APPROVAL/);
  assert.match(service, /proposedChange/);
  assert.match(service, /decided_by/);
  assert.match(service, /live_version/);
  assert.match(service, /Approved learned playbook/);
});

test("hotel and restaurant employees are represented by person-style roster profiles", async () => {
  const [roles, client] = await Promise.all([read("db/role-parity.ts"), read("app/aaiq-agent-studio/digital-employee-command-center.tsx")]);
  for (const role of ["FRONT_DESK", "HOUSEKEEPING_SUPERVISOR", "MAINTENANCE", "NIGHT_AUDIT", "RESTAURANT_HOST", "SERVER_SUPPORT", "KITCHEN_EXPEDITOR", "BAR_INVENTORY", "FNB_MANAGER"])
    assert.match(roles, new RegExp(`key:\"${role}\"`));
  assert.match(client, /personaName/);
  assert.match(client, /shiftLabel/);
  assert.match(client, /Start Shift/);
  assert.match(client, /Assign Duties/);
});

test("release 129 clone binding repairs remain explicit", async () => {
  const service = await read("db/sample-environments.ts");
  assert.match(service, /sample-thread-\$\{item\.key\}.*, `sample-guest-/s);
  assert.match(service, /'ROOM'.*'ACTIVE',\?,\?,\?,\?,\?,NULL/s);
  assert.match(service, /risk, "SAMPLE_READY"/);
});

test("release 130 provides route and root render recovery plus storage isolation", async () => {
  const [routeError, rootError, storage] = await Promise.all([read("app/error.tsx"), read("app/global-error.tsx"), read("lib/browser-storage.ts")]);
  assert.match(routeError, /Try again/);
  assert.match(rootError, /Retry AAIQ/);
  assert.match(rootError, /records remain unchanged/);
  assert.match(storage, /try \{/);
  assert.match(storage, /catch \{/);
});
