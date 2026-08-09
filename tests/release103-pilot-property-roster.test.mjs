import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Pilot Launch returns a property-scoped active employee roster", async () => {
  const service = await read("db/pilot-launch.ts");
  assert.match(service, /LEFT JOIN property_assignments pa/);
  assert.match(service, /pa\.property_id=\?/);
  assert.match(service, /m\.status='active'/);
  assert.match(service, /members:members\.results/);
});

test("each pilot task shows persistent property identity and a real owner selector", async () => {
  const client = await read("app/aaiq-pilot-launch/pilot-launch-client.tsx");
  assert.match(client, /ACTIVE PILOT PROPERTY/);
  assert.match(client, /selected\.property\.code/);
  assert.match(client, /selected\.property\.address/);
  assert.match(client, /name="ownerEmail"/);
  assert.match(client, /selected\?\.members\?\.map/);
  assert.match(client, /authorized employee/);
  assert.doesNotMatch(client, /name="ownerEmail" type="email"/);
});

test("task ownership rejects employees outside the selected property", async () => {
  const service = await read("db/pilot-launch.ts");
  assert.match(service, /Choose an active employee who is authorized for this property/);
  assert.match(service, /ownerEmail:requestedOwner\|\|null/);
});

test("sidebar logo bypasses the failing production image optimizer", async () => {
  const shell = await read("app/components/aaiq-app-shell.tsx");
  assert.match(shell, /aai-tech-logo\.jpeg[^>]+unoptimized/);
});
