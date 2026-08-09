import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Pilot Launch provides a complete governed path when no Days Inn root exists", async () => {
  const [client, service, route] = await Promise.all([
    read("app/aaiq-pilot-launch/pilot-launch-client.tsx"),
    read("db/pilot-launch.ts"),
    read("app/api/v1/pilot-launch/route.ts"),
  ]);
  assert.match(client, /Add Days Inn to pilot/);
  assert.match(client, /CONFIRM_DAYS_INN_PROPERTY/);
  assert.match(service, /confirmDaysInnPilotProperty/);
  assert.match(service, /PILOT_PROPERTY_IDENTITY_CONFIRMED/);
  assert.match(route, /confirmDaysInnPilotProperty/);
});

test("Website Factory proposes the exact canonical Days Inn pilot code", async () => {
  const service = await read("db/website-factory.ts");
  assert.match(service, /DI-SALINA-SOUTH/);
  assert.doesNotMatch(service, /"DI-SALINA-S"/);
  assert.match(service, /632 Westport Boulevard, Salina, KS 67401/);
});
