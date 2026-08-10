import assert from "node:assert/strict";
import test from "node:test";
import { Department, RoleTier } from "@prisma/client";
import { hasRoleAccess, tierWeight } from "../src/middleware/authorizeRole.js";

test("role tiers preserve the required hierarchy", () => {
  assert.ok(tierWeight.ASSOCIATE < tierWeight.SUPERVISOR);
  assert.ok(tierWeight.SUPERVISOR < tierWeight.MANAGER);
  assert.ok(tierWeight.MANAGER < tierWeight.CORPORATE);
});

test("executive managers can access deep reports", () => {
  assert.equal(
    hasRoleAccess(
      { department: Department.EXECUTIVE, tier: RoleTier.MANAGER },
      [Department.EXECUTIVE],
      RoleTier.MANAGER,
    ),
    true,
  );
});

test("associates, supervisors, and non-executive managers are denied", () => {
  for (const staff of [
    { department: Department.EXECUTIVE, tier: RoleTier.ASSOCIATE },
    { department: Department.EXECUTIVE, tier: RoleTier.SUPERVISOR },
    { department: Department.FRONT_DESK, tier: RoleTier.MANAGER },
    { department: Department.MAINTENANCE, tier: RoleTier.MANAGER },
  ]) {
    assert.equal(
      hasRoleAccess(staff, [Department.EXECUTIVE], RoleTier.MANAGER),
      false,
    );
  }
});

test("corporate tier bypasses departmental boundaries", () => {
  assert.equal(
    hasRoleAccess(
      { department: Department.HOUSEKEEPING, tier: RoleTier.CORPORATE },
      [Department.EXECUTIVE],
      RoleTier.MANAGER,
    ),
    true,
  );
});
