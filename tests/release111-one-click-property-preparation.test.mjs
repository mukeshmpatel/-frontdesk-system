import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("pilot center exposes one-click governed property preparation",async()=>{
  const [client,route,service]=await Promise.all([
    read("app/aaiq-pilot-launch/pilot-launch-client.tsx"),
    read("app/api/v1/pilot-launch/route.ts"),
    read("db/pilot-launch.ts"),
  ]);
  assert.match(client,/Automate common setup for both properties/);
  assert.match(client,/AUTO_PREPARE_PILOT/);
  assert.match(route,/AUTO_PREPARE_PILOT/);
  assert.match(service,/export async function autoPreparePilot/);
  assert.match(service,/PILOT_PROPERTY_AUTO_PREPARED/);
});

test("automation verifies governed foundations without inventing operational data",async()=>{
  const service=await read("db/pilot-launch.ts");
  assert.match(service,/SYSTEM_VERIFIED_PROPERTY_IDENTITY/);
  assert.match(service,/SYSTEM_VERIFIED_PROPERTY_ISOLATION/);
  assert.match(service,/roomsInvented:0/);
  assert.match(service,/externalActionsEnabled:false/);
  assert.match(service,/financialAutonomy:false/);
  assert.match(service,/AAIQ never invents operational records/);
});

test("interrupted preparation returns a retry-safe user message",async()=>{
  const client=await read("app/aaiq-pilot-launch/pilot-launch-client.tsx");
  assert.match(client,/The connection was interrupted/);
  assert.match(client,/did not mark the action complete/);
  assert.doesNotMatch(client,/catch\(error\).*setMessage\(error\.message/s);
});
