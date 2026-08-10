import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { authorizePilotUat, canonicalPilotRole } from "../lib/pilot-authorization.mjs";

test("pilot UAT role aliases normalize without broadening privileges", () => {
  assert.equal(canonicalPilotRole("GM"), "GENERAL_MANAGER");
  assert.equal(canonicalPilotRole("front desk agent"), "FRONT_DESK");
  assert.equal(canonicalPilotRole("unknown executive"), "");
});

test("staff may record only their assigned property role while administrators retain pilot authority", () => {
  assert.deepEqual(authorizePilotUat({ staffRole: "staff", assignmentRole: "FRONT_DESK", requestedRole: "FRONT_DESK" }), {
    allowed: true,
    reason: "ASSIGNED_ROLE_MATCH",
  });
  assert.equal(authorizePilotUat({ staffRole: "staff", assignmentRole: "FRONT_DESK", requestedRole: "GENERAL_MANAGER" }).allowed, false);
  assert.equal(authorizePilotUat({ staffRole: "staff", assignmentRole: "", requestedRole: "FRONT_DESK" }).allowed, false);
  assert.equal(authorizePilotUat({ staffRole: "admin", assignmentRole: "", requestedRole: "HOUSEKEEPING" }).allowed, true);
});

test("Pilot Launch enforces property access before returning data or recording UAT", async () => {
  const service = await readFile(new URL("../db/pilot-launch.ts", import.meta.url), "utf8");
  assert.match(service, /pilotPropertyAccess\(context,r\.id,item\.property\.id\)/);
  assert.match(service, /if\(!access\)throw new Error\("You are not authorized to record UAT evidence for this pilot property\."\)/);
  assert.match(service, /authorizePilotUat/);
});
