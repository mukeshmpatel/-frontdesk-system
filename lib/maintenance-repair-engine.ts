export const MAINTENANCE_POLICY_VERSION = "MAINTENANCE_DEFECT_CHAIN_V1";

export const MAINTENANCE_EVIDENCE = [
  { area: "BEFORE", stage: "BEFORE", label: "Defect before work" },
  { area: "REPAIR_DETAIL", stage: "DURING", label: "Repair detail" },
  { area: "AFTER", stage: "AFTER", label: "Condition after repair" },
  { area: "SAFETY_CHECK", stage: "AFTER", label: "Final safety check" },
] as const;

export type MaintenanceHazard =
  | "NONE" | "FIRE_SMOKE_GAS" | "ELECTRICAL_SHOCK" | "ACTIVE_FLOOD"
  | "STRUCTURAL" | "MEDICAL_SECURITY" | "WATER_LEAK" | "LOCK_SECURITY" | "OTHER";

export type MaintenancePriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type MaintenanceState =
  | "UNASSIGNED" | "ASSIGNED" | "ACKNOWLEDGED" | "DIAGNOSING" | "AWAITING_PART"
  | "REPAIRING" | "TESTING" | "AWAITING_VERIFICATION" | "RETURNED_TO_SERVICE"
  | "REWORK_REQUIRED" | "SAFETY_HOLD" | "CANCELLED";

const HARD_SAFETY_HAZARDS = new Set<MaintenanceHazard>([
  "FIRE_SMOKE_GAS", "ELECTRICAL_SHOCK", "ACTIVE_FLOOD", "STRUCTURAL", "MEDICAL_SECURITY",
]);

export function classifyMaintenanceRisk(input: {
  hazardType?: string | null;
  guestImpact?: boolean;
  roomOutage?: boolean;
  activeLeak?: boolean;
}) {
  const hazard = String(input.hazardType || "NONE").toUpperCase() as MaintenanceHazard;
  const safetyHold = HARD_SAFETY_HAZARDS.has(hazard);
  const facts: string[] = [];
  if (hazard !== "NONE") facts.push(`hazard:${hazard.toLowerCase()}`);
  if (input.activeLeak) facts.push("active water leak");
  if (input.roomOutage) facts.push("room or equipment unavailable");
  if (input.guestImpact) facts.push("current guest impact");
  if (safetyHold) return {
    priority: "CRITICAL" as MaintenancePriority, responseTargetMinutes: 0, safetyHold: true,
    reason: "Life-safety or major property hazard requires immediate trained-human control.", facts,
  };
  if (input.activeLeak || input.roomOutage && input.guestImpact || hazard === "LOCK_SECURITY") return {
    priority: "HIGH" as MaintenancePriority, responseTargetMinutes: 15, safetyHold: false,
    reason: "Active damage, security, or an occupied-room outage requires urgent response.", facts,
  };
  if (input.roomOutage) return {
    priority: "HIGH" as MaintenancePriority, responseTargetMinutes: 30, safetyHold: false,
    reason: "The room or equipment is unavailable and requires priority restoration.", facts,
  };
  if (input.guestImpact || hazard === "WATER_LEAK") return {
    priority: "MEDIUM" as MaintenancePriority, responseTargetMinutes: 60, safetyHold: false,
    reason: "The defect affects service but does not meet the recorded emergency threshold.", facts,
  };
  return {
    priority: "LOW" as MaintenancePriority, responseTargetMinutes: 240, safetyHold: false,
    reason: "No emergency, active damage, room outage, or current guest impact was recorded.", facts,
  };
}

const TRANSITIONS: Record<MaintenanceState, MaintenanceState[]> = {
  UNASSIGNED: ["ASSIGNED", "CANCELLED", "SAFETY_HOLD"],
  ASSIGNED: ["ACKNOWLEDGED", "CANCELLED", "SAFETY_HOLD"],
  ACKNOWLEDGED: ["DIAGNOSING", "CANCELLED", "SAFETY_HOLD"],
  DIAGNOSING: ["REPAIRING", "AWAITING_PART", "SAFETY_HOLD", "CANCELLED"],
  AWAITING_PART: ["REPAIRING", "SAFETY_HOLD", "CANCELLED"],
  REPAIRING: ["TESTING", "AWAITING_PART", "SAFETY_HOLD", "CANCELLED"],
  TESTING: ["AWAITING_VERIFICATION", "REWORK_REQUIRED", "SAFETY_HOLD"],
  AWAITING_VERIFICATION: ["RETURNED_TO_SERVICE", "REWORK_REQUIRED", "SAFETY_HOLD"],
  RETURNED_TO_SERVICE: [],
  REWORK_REQUIRED: ["DIAGNOSING", "REPAIRING", "SAFETY_HOLD", "CANCELLED"],
  SAFETY_HOLD: ["DIAGNOSING", "CANCELLED"],
  CANCELLED: [],
};

export function assertMaintenanceTransition(from: string, to: string, options: { safetyCleared?: boolean } = {}) {
  const current = from as MaintenanceState, next = to as MaintenanceState;
  if (!TRANSITIONS[current]?.includes(next)) throw new Error(`Maintenance transition ${from} → ${to} is not allowed.`);
  if (current === "SAFETY_HOLD" && next === "DIAGNOSING" && !options.safetyCleared) {
    throw new Error("A qualified human safety clearance is required before diagnosis can resume.");
  }
  return next;
}

export function maintenanceProgress(state: MaintenanceState) {
  return ({ UNASSIGNED: 0, ASSIGNED: 5, ACKNOWLEDGED: 15, DIAGNOSING: 30, AWAITING_PART: 45,
    REPAIRING: 60, TESTING: 80, AWAITING_VERIFICATION: 95, RETURNED_TO_SERVICE: 100,
    REWORK_REQUIRED: 65, SAFETY_HOLD: 10, CANCELLED: 0 } as Record<MaintenanceState, number>)[state];
}

export function maintenanceWorkOrderStatus(state: MaintenanceState) {
  if (state === "RETURNED_TO_SERVICE") return "VERIFIED";
  if (state === "CANCELLED") return "CANCELLED";
  if (state === "AWAITING_VERIFICATION") return "AWAITING_EVIDENCE_REVIEW";
  if (state === "REWORK_REQUIRED") return "REWORK_REQUIRED";
  if (state === "UNASSIGNED") return "UNASSIGNED";
  if (state === "SAFETY_HOLD") return "SAFETY_HOLD";
  if (state === "ASSIGNED") return "ASSIGNED";
  return "IN_PROGRESS";
}
