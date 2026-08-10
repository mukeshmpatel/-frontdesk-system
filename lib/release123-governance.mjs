export const HUMAN_ONLY = Object.freeze([
  "physical_labor", "life_safety_response", "legal_signature", "employment_termination_decision",
  "financial_disbursement", "surveillance_enforcement", "door_access_issuance", "alcohol_service_decision",
]);

export const DIGITAL_EVENT_ROLES = Object.freeze({
  DIGITAL_WEDDING_PLANNER: { mission: "Prepare a complete wedding portfolio, timeline, draft documents, communications and exception list.", approval: ["pricing", "contract", "deposit", "public_send"] },
  DIGITAL_EVENT_MANAGER: { mission: "Coordinate lead-to-close event work, dependencies, deadlines, evidence and handoffs.", approval: ["pricing", "contract", "vendor_commitment", "public_send"] },
  DIGITAL_BANQUET_COORDINATOR: { mission: "Maintain banquet packets, BEO drafts, room sets, menus, service timelines and change history.", approval: ["final_beo", "alcohol_terms", "vendor_commitment", "public_send"] },
});

export function resolveAction({ actionType, confidence = 0, external = false, irreversible = false, approved = false }) {
  if (HUMAN_ONLY.includes(actionType) || irreversible) return { decision: "BLOCK_AND_ESCALATE", execute: false };
  if (external && !approved) return { decision: "PREPARE_FOR_APPROVAL", execute: false };
  if (confidence < 0.8) return { decision: "ASK_FOR_MISSING_FACT", execute: false };
  return { decision: "AUTO_PREPARE", execute: !external };
}

export function presenceDecision({ insideGeofence, deviceTimeDeltaSeconds, mediaConfigured, livenessPassed, faceMatched }) {
  const reasons = [];
  if (!insideGeofence) reasons.push("OUTSIDE_GEOFENCE");
  if (Math.abs(deviceTimeDeltaSeconds) > 60) reasons.push("TIME_DISCREPANCY");
  if (!mediaConfigured) reasons.push("MANAGER_OBSERVED_ALTERNATIVE_REQUIRED");
  if (mediaConfigured && !livenessPassed) reasons.push("LIVENESS_NOT_VERIFIED");
  if (mediaConfigured && faceMatched !== true) reasons.push("FACE_NOT_VERIFIED");
  return { decision: reasons.length ? "MANAGER_REVIEW" : "VERIFIED", reasons, automaticDiscipline: false };
}

export function fairReviewJourney({ consent, serviceIssueOpen, score }) {
  return {
    publicInvitationEligible: Boolean(consent),
    recoveryCaseRequired: Boolean(serviceIssueOpen || (Number.isFinite(score) && score < 4)),
    suppressPublicInvitationBecauseOfScore: false,
  };
}

export function cashVariance(expectedCents, countedCents) {
  const varianceCents = countedCents - expectedCents;
  return { expectedCents, countedCents, varianceCents, exactMatch: varianceCents === 0, managerVerificationRequired: true };
}
