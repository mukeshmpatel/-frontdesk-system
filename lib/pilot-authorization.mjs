const ROLE_ALIASES = Object.freeze({
  ADMIN: "ADMINISTRATOR",
  ADMINISTRATOR: "ADMINISTRATOR",
  GENERAL_MANAGER: "GENERAL_MANAGER",
  GM: "GENERAL_MANAGER",
  MANAGER: "GENERAL_MANAGER",
  SUPERVISOR: "SUPERVISOR",
  FRONT_DESK: "FRONT_DESK",
  FRONT_DESK_AGENT: "FRONT_DESK",
  HOUSEKEEPING: "HOUSEKEEPING",
  HOUSEKEEPER: "HOUSEKEEPING",
});

export function canonicalPilotRole(value) {
  const key = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return ROLE_ALIASES[key] ?? "";
}

export function authorizePilotUat({ staffRole, assignmentRole, requestedRole }) {
  if (staffRole === "admin") return { allowed: true, reason: "ADMINISTRATOR" };
  const assigned = canonicalPilotRole(assignmentRole);
  const requested = canonicalPilotRole(requestedRole);
  if (!assigned) return { allowed: false, reason: "PROPERTY_ASSIGNMENT_REQUIRED" };
  if (!requested || assigned !== requested) {
    return { allowed: false, reason: "ROLE_SCENARIO_MISMATCH" };
  }
  return { allowed: true, reason: "ASSIGNED_ROLE_MATCH" };
}
