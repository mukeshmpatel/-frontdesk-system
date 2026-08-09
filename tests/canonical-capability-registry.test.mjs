import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("all visible AAIQ modules are governed by one capability registry", async () => {
  const [registry, navigation, access] = await Promise.all([
    read("../lib/aaiq-capabilities.ts"),
    read("../app/components/aaiq-navigation.ts"),
    read("../db/access-management.ts"),
  ]);
  const keys = [...registry.matchAll(/\{ key: "(AAIQ_[A-Z_]+)", href: "([^"]+)"/g)];
  assert.equal(keys.length, 33);
  assert.equal(new Set(keys.map(match => match[1])).size, 33);
  assert.equal(new Set(keys.map(match => match[2])).size, 33);
  assert.match(navigation, /AAIQ_CAPABILITIES as AAIQ_NAVIGATION/);
  assert.match(access, /AAIQ_CAPABILITIES,AAIQ_CAPABILITY_KEYS/);
  assert.doesNotMatch(access, /CREATE TABLE|ALTER TABLE|DROP TABLE/i);
});
