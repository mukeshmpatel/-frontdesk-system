import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("configured rollout with no tasks exposes the one-time workspace setup action", async () => {
  const client = await read("app/aaiq-pilot-launch/pilot-launch-client.tsx");
  assert.match(client, /!data\.rollout\|\|data\.summary\.total===0/);
  assert.match(client, /Complete Pilot Launch setup/);
  assert.match(client, /Complete pilot setup/);
  assert.match(client, /action:"INITIALIZE"/);
  assert.match(client, /data\.rollout&&data\.summary\.total>0/);
});

test("Pilot Launch actions recover from network and unreadable-response failures", async () => {
  const client = await read("app/aaiq-pilot-launch/pilot-launch-client.tsx");
  assert.match(client, /The server returned an unreadable response/);
  assert.match(client, /finally\{setBusy\(""\)\}/);
  assert.match(client, /Pilot workspace is ready/);
});

test("configured Governed Integrations has a direct functional path to Pilot Launch", async () => {
  const client = await read("app/aaiq-integration-center/integration-center-client.tsx");
  assert.match(client, /import Link from "next\/link"/);
  assert.match(client, /href="\/aaiq-pilot-launch"/);
  assert.match(client, /Open Pilot Launch Center/);
});
