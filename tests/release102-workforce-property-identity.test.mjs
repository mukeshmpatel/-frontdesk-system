import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("workforce kiosk uses the canonical property returned by enterprise operations", async () => {
  const service = await read("db/workforce-kiosk.ts");
  assert.match(service, /!operations\.property/);
  assert.match(service, /return operations\.property/);
  assert.doesNotMatch(service, /operations\.activeProperty/);
});

test("workforce retains the canonical desktop header and left navigation", async () => {
  const css = await read("app/globals.css");
  assert.match(css, /@media \(min-width: 901px\)/);
  assert.match(css, /:has\(\.time-clock-kiosk\) > aside \{ display: flex !important; \}/);
  assert.match(css, /:has\(\.time-clock-kiosk\) > \.aaiq-shell-body > header \{ display: flex !important; \}/);
});

test("Days Inn comparison property is repaired without replacing its identity", async () => {
  const migration = await read("migrations/0046_repair_two_property_identity.sql");
  assert.match(migration, /DI-SALINA-SOUTH/);
  assert.match(migration, /632 Westport Blvd, Salina, KS 67401/);
  assert.match(migration, /UPDATE property_contexts/);
  assert.doesNotMatch(migration, /DELETE FROM property_contexts/);
});
