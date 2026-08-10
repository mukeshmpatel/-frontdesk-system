import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("offboarding cannot be closed while a credential or asset remains outstanding", async () => {
  const service = await read("db/workforce-lifecycle.ts");
  assert.match(service, /action==="CLOSE_SEPARATION"/);
  const gate = service.match(/if\(action==="CLOSE_SEPARATION"\)\{[\s\S]*?throw new Error\(`Offboarding cannot be closed[^`]*`\);/);
  assert.ok(gate, "expected a blocking gate inside the CLOSE_SEPARATION action");
  assert.match(gate[0], /status!='DONE'/, "must count offboarding tasks that are not yet DONE");
  assert.match(gate[0], /status!='RETURNED'/, "must count custody assets that are not yet RETURNED");
  assert.match(gate[0], /non-bypassable safety gate/i);
});

test("the CLOSED update only appears after the blocking gate's throw, never before it", async () => {
  const service = await read("db/workforce-lifecycle.ts");
  const action = service.match(/if\(action==="CLOSE_SEPARATION"\)\{[\s\S]*?\n throw new Error\("Unsupported/)[0];
  const throwIndex = action.indexOf("non-bypassable safety gate");
  const closeIndex = action.indexOf("status='CLOSED'");
  assert.ok(throwIndex > -1 && closeIndex > -1 && throwIndex < closeIndex, "the gate's throw must execute before any CLOSED status is written");
});

test("credential revocation and asset return require recorded evidence, not a status flip alone", async () => {
  const service = await read("db/workforce-lifecycle.ts");
  assert.match(service, /action==="COMPLETE_OFFBOARDING_TASK"/);
  assert.match(service, /Enter verification evidence/);
  assert.match(service, /evidence_json=\?/);
  assert.match(service, /workforce_access_locker SET status='REVOKED',revoked_at=\?/);
  assert.match(service, /action==="RETURN_CUSTODY_ASSET"/);
  assert.match(service, /workforce_property_custody SET status='RETURNED'/);
});

test("only an administrator can complete offboarding tasks, return assets, or close a separation", async () => {
  const service = await read("db/workforce-lifecycle.ts");
  for (const action of ["COMPLETE_OFFBOARDING_TASK", "RETURN_CUSTODY_ASSET", "CLOSE_SEPARATION"]) {
    const block = service.match(new RegExp(`action==="${action}"\\)\\{if\\(context\\.role!=="admin"\\)return null;`));
    assert.ok(block, `${action} must be admin-gated`);
  }
});

test("the closure gate is reachable from the UI, not a backend-only shell", async () => {
  const client = await read("app/aaiq-workforce-lifecycle/workforce-lifecycle-client.tsx");
  assert.match(client, /COMPLETE_OFFBOARDING_TASK/);
  assert.match(client, /RETURN_CUSTODY_ASSET/);
  assert.match(client, /CLOSE_SEPARATION/);
  assert.match(client, /openTasks\.length>0\|\|heldAssets\.length>0/);
});
