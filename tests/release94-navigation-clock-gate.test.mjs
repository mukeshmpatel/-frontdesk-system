import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Release 94 groups the left menu and keeps the active function highlighted", async () => {
  const shell = await readFile(new URL("../app/components/aaiq-app-shell.tsx", import.meta.url), "utf8");
  assert.match(shell, /shell-group-toggle/);
  assert.match(shell, /active-group/);
  assert.match(shell, /aria-expanded/);
  assert.match(shell, /setOpenGroup\(activeGroup\)/);
  assert.match(shell, /aaiq-module-context/);
});

test("Release 94 requires clock-in and returns the user to the requested module", async () => {
  const shell = await readFile(new URL("../app/components/aaiq-app-shell.tsx", import.meta.url), "utf8");
  const clock = await readFile(new URL("../app/workforce-time-clock/time-clock-client.tsx", import.meta.url), "utf8");
  assert.match(shell, /operations\?\.currentOpenEntry/);
  assert.match(shell, /workforce-time-clock\?returnTo=/);
  assert.match(shell, /Clock-in required/);
  assert.match(clock, /requested\?\.startsWith\("\/"\)/);
  assert.match(clock, /pending\.member\.email\.toLowerCase\(\) === data\.currentUserEmail\.toLowerCase\(\)/);
  assert.match(clock, /window\.location\.assign\(returnTo\)/);
  assert.match(clock, /Your clock-in/);
});

test("AAIQ Home uses the canonical sidebar only once", async () => {
  const home = await readFile(new URL("../app/daymark-client.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(home, /className="side-rail"/);
  assert.doesNotMatch(home, /AAIQ_NAVIGATION_GROUPS/);
  assert.match(home, /className="home-view-tabs"/);
  assert.match(home, /className="daymark-shell embedded-home"/);
});
