export const OUTCOMES = Object.freeze({
  EXECUTE: "DIGITAL_EXECUTION",
  PHYSICAL: "PHYSICAL_HANDOFF",
  APPROVAL: "LEGALLY_RESERVED",
  REJECT: "REJECT_UNTRUSTED_INPUT",
});

export function evaluateRoleParityCase(input) {
  if (!input || typeof input !== "object") return OUTCOMES.REJECT;
  if (input.promptInjection || input.untrustedInstruction) return OUTCOMES.REJECT;
  if (input.requiresPhysicalPresence) return OUTCOMES.PHYSICAL;
  if (input.legalCommitment || input.employmentAction || input.publicResponse || input.safetyCritical) return OUTCOMES.APPROVAL;
  if (Number(input.amount || 0) > Number(input.approvedLimit || 0)) return OUTCOMES.APPROVAL;
  if (input.connectorState !== "INTERNAL" && input.connectorState !== "SANDBOX_CERTIFIED") return OUTCOMES.APPROVAL;
  if (!input.sourceRecordId || !input.idempotencyKey || !input.postconditionDefined) return OUTCOMES.REJECT;
  return OUTCOMES.EXECUTE;
}

export function buildRoleParityCases(roleKey, taskKey) {
  const base = { roleKey, taskKey, amount: 0, approvedLimit: 75, connectorState: "INTERNAL", sourceRecordId: `${roleKey}:${taskKey}`, postconditionDefined: true };
  const definitions = [
    ["normal-internal", {}, OUTCOMES.EXECUTE],
    ["sandbox-connector", { connectorState: "SANDBOX_CERTIFIED" }, OUTCOMES.EXECUTE],
    ["physical-presence", { requiresPhysicalPresence: true }, OUTCOMES.PHYSICAL],
    ["legal-commitment", { legalCommitment: true }, OUTCOMES.APPROVAL],
    ["employment-action", { employmentAction: true }, OUTCOMES.APPROVAL],
    ["public-response", { publicResponse: true }, OUTCOMES.APPROVAL],
    ["safety-critical", { safetyCritical: true }, OUTCOMES.APPROVAL],
    ["over-limit", { amount: 76 }, OUTCOMES.APPROVAL],
    ["exact-limit", { amount: 75 }, OUTCOMES.EXECUTE],
    ["unconfigured-connector", { connectorState: "UNCONFIGURED" }, OUTCOMES.APPROVAL],
    ["degraded-connector", { connectorState: "DEGRADED" }, OUTCOMES.APPROVAL],
    ["revoked-connector", { connectorState: "REVOKED" }, OUTCOMES.APPROVAL],
    ["prompt-injection", { promptInjection: true }, OUTCOMES.REJECT],
    ["untrusted-instruction", { untrustedInstruction: true }, OUTCOMES.REJECT],
    ["missing-source", { sourceRecordId: "" }, OUTCOMES.REJECT],
    ["missing-postcondition", { postconditionDefined: false }, OUTCOMES.REJECT],
    ["negative-amount", { amount: -1 }, OUTCOMES.EXECUTE],
    ["zero-limit-zero-amount", { amount: 0, approvedLimit: 0 }, OUTCOMES.EXECUTE],
    ["physical-and-public", { requiresPhysicalPresence: true, publicResponse: true }, OUTCOMES.PHYSICAL],
    ["injection-and-physical", { promptInjection: true, requiresPhysicalPresence: true }, OUTCOMES.REJECT],
    ["malformed-null", null, OUTCOMES.REJECT],
    ["large-approved-internal", { amount: 1200, approvedLimit: 1200 }, OUTCOMES.EXECUTE],
    ["large-over-limit", { amount: 1200, approvedLimit: 1199 }, OUTCOMES.APPROVAL],
    ["ambiguous-provider", { connectorState: "CREDENTIALS_PRESENT" }, OUTCOMES.APPROVAL],
  ];
  return definitions.map(([name, changes, expected], index) => ({
    caseNumber: index + 1,
    name,
    input: changes === null ? null : { ...base, ...changes, idempotencyKey: `${roleKey}:${taskKey}:${index + 1}` },
    expected,
  }));
}
