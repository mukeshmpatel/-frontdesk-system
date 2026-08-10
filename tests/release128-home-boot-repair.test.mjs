import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("home boot never provisions or mutates the canonical workspace", async () => {
  const [home, route] = await Promise.all([
    read("app/page.tsx"),
    read("app/api/v1/sample-environments/route.ts"),
  ]);
  assert.doesNotMatch(home, /activateCanonicalSampleWorkspace/);
  assert.match(route, /ACTIVATE_CANONICAL_SAMPLE/);
  assert.match(route, /activateCanonicalSampleWorkspace/);
});

test("home and route failures produce visible recovery surfaces instead of a blank screen", async () => {
  const [home, errorBoundary, loading] = await Promise.all([
    read("app/page.tsx"),
    read("app/error.tsx"),
    read("app/loading.tsx"),
  ]);
  assert.match(home, /AAIQ_HOME_BOOT_FAILURE/);
  assert.match(home, /Your data was not changed/);
  assert.match(errorBoundary, /This screen could not finish loading/);
  assert.match(errorBoundary, /Try again/);
  assert.match(loading, /Opening your workspace/);
});
