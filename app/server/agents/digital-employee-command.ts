/**
 * Entry point for the AAIQ Digital Employee chat surface. Every agent key
 * now runs a real, tool-grounded LLM call (maintenance dispatcher keeps its
 * own dedicated implementation; every other agent uses the shared runtime
 * with its registry-configured tools) instead of a canned template string.
 */
import {
  activeProperty,
  agentDatabase,
  ensureAgentPlatform,
  seedAgents,
} from "../../../db/agent-platform";
import { activeStaffContext } from "../../../db/staff";
import { runMaintenanceBriefing } from "./maintenance-briefing-agent";
import { runGroundedOperationsAgent, type GroundedAgentRunResult, type GroundedOperationsOutput } from "./agent-runtime";
import { DIGITAL_EMPLOYEE_REGISTRY } from "./digital-employee-registry";

const CONSEQUENTIAL_TERMS = [
  "refund", "charge", "payment", "publish", "delete", "terminate", "fire ", "hire ",
  "purchase", "order parts", "rate override", "issue key", "unlock", "call police", "shut down",
];

/** The maintenance dispatcher keeps its own dedicated schema (priorities, compliance/parts
 * watch lists); normalize it into the shared shape so the chat surface can treat every
 * Digital Employee's answer the same way. */
function normalizeMaintenanceBriefing(briefing: {
  headline: string; executiveSummary: string; recommendedNextAction: string;
  priorities: { title: string; reason: string; risk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; sourceIds: string[] }[];
  complianceWatch: string[]; partsAndWarrantyWatch: string[]; missingInformation: string[]; confidence: number;
}): GroundedOperationsOutput {
  return {
    headline: briefing.headline,
    executiveSummary: briefing.executiveSummary,
    recommendedNextAction: briefing.recommendedNextAction,
    findings: briefing.priorities.map(item => ({ title: item.title, detail: item.reason, risk: item.risk, sourceIds: item.sourceIds })),
    watchItems: [...briefing.complianceWatch, ...briefing.partsAndWarrantyWatch],
    missingInformation: briefing.missingInformation,
    confidence: briefing.confidence,
  };
}

async function runAgentForKey(agentKey: string, userEmail: string, prompt: string): Promise<GroundedAgentRunResult | null> {
  if (agentKey === "maintenance-dispatcher") {
    const result = await runMaintenanceBriefing(userEmail, prompt);
    if (!result) return null;
    if (result.status === "MANUAL_FALLBACK") return { runId: result.runId, status: "MANUAL_FALLBACK", fallback: result.fallback };
    const status: "SUCCEEDED" | "NEEDS_REVIEW" = result.status === "NEEDS_REVIEW" ? "NEEDS_REVIEW" : "SUCCEEDED";
    return { runId: result.runId, status, briefing: normalizeMaintenanceBriefing(result.briefing!) };
  }
  const config = DIGITAL_EMPLOYEE_REGISTRY[agentKey];
  if (!config) throw new Error("The selected Digital Employee is not configured yet.");
  return runGroundedOperationsAgent(agentKey, config, userEmail, prompt);
}

export async function runDigitalEmployeeCommand(userEmail: string, input: Record<string, unknown>) {
  const agentKey = String(input.agentKey || "front-desk").trim().slice(0, 80);
  const prompt = String(input.prompt || input.intent || "").trim().slice(0, 4000);
  const inputMode = String(input.inputMode || "TEXT") === "VOICE_TRANSCRIPT" ? "VOICE_TRANSCRIPT" : "TEXT";
  if (prompt.length < 3) throw new Error("Tell the Digital Employee what outcome you need.");

  const context = await activeStaffContext(userEmail);
  if (!context) return null;
  await ensureAgentPlatform();
  await seedAgents(context.organizationId);
  const property = await activeProperty(context) as { id: string; name: string; code: string } | null;
  if (!property) return null;

  const db = agentDatabase();
  const now = new Date().toISOString();
  const agentRow = await db.prepare(`SELECT id FROM ai_runtime_agent_registry WHERE organization_id=? AND agent_key=?`)
    .bind(context.organizationId, agentKey).first<{ id: string }>();

  const priorSession = String(input.sessionId || "");
  let sessionId = priorSession;
  if (sessionId) {
    const valid = await db.prepare(`SELECT id FROM digital_employee_command_sessions
      WHERE id=? AND organization_id=? AND property_id=? AND agent_key=?`).bind(sessionId,
      context.organizationId, property.id, agentKey).first<{ id: string }>();
    if (!valid) sessionId = "";
  }
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    await db.prepare(`INSERT INTO digital_employee_command_sessions
      (id,organization_id,property_id,agent_registry_id,agent_key,title,status,created_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?, 'OPEN',?,?,?)`).bind(sessionId, context.organizationId, property.id,
      agentRow?.id ?? null, agentKey, prompt.slice(0, 100), context.email, now, now).run();
  }
  await db.prepare(`INSERT INTO digital_employee_command_messages
    (id,session_id,organization_id,property_id,sender_type,input_mode,body,run_id,outcome_type,
     evidence_json,created_by,created_at) VALUES (?,?,?,?, 'USER',?,?,NULL,'MESSAGE','[]',?,?)`)
    .bind(crypto.randomUUID(), sessionId, context.organizationId, property.id, inputMode, prompt, context.email, now).run();

  const agentResult = await runAgentForKey(agentKey, userEmail, prompt);
  if (!agentResult) return null;

  const isFallback = agentResult.status === "MANUAL_FALLBACK";
  const briefing = isFallback ? null : agentResult.briefing;
  const responseText = isFallback
    ? "I could not reach the model connection for this request. It has been preserved for manual completion in the fallback queue."
    : briefing?.executiveSummary || `I reviewed the available ${property.name} records and could not produce a confident summary.`;
  const recommendedNextAction = isFallback
    ? "Review the manual fallback queue."
    : briefing?.recommendedNextAction || "Open the related module to continue.";

  const normalized = prompt.toLowerCase();
  const keywordApprovalRequired = CONSEQUENTIAL_TERMS.some(term => normalized.includes(term));
  const lowConfidenceReview = agentResult.status === "NEEDS_REVIEW";
  const approvalRequired = keywordApprovalRequired || lowConfidenceReview;

  let approvalId: string | null = null;
  if (approvalRequired) {
    approvalId = crypto.randomUUID();
    await db.prepare(`INSERT INTO ai_approval_cases
      (id,organization_id,property_id,run_id,action_type,risk_level,status,requested_by,assigned_role,reason,created_at)
      VALUES (?,?,?,?,?,'HIGH','PENDING',?,'MANAGER',?,?)`).bind(approvalId, context.organizationId,
      property.id, agentResult.runId, "DIGITAL_EMPLOYEE_COMMAND", context.email,
      keywordApprovalRequired
        ? "The request may create an external, financial, access, employment, or irreversible action."
        : "The Digital Employee flagged low confidence or missing information and requests human review.",
      now).run();
  }

  const outcome = approvalRequired ? "APPROVAL_REQUIRED" : "COMPLETED";
  const evidence = briefing
    ? [{ source: "GROUNDED_AGENT_FINDINGS", findings: briefing.findings, watchItems: briefing.watchItems, missingInformation: briefing.missingInformation }]
    : [{ source: "MANUAL_FALLBACK" }];
  await db.prepare(`INSERT INTO digital_employee_command_messages
    (id,session_id,organization_id,property_id,sender_type,input_mode,body,run_id,outcome_type,
     evidence_json,created_by,created_at) VALUES (?,?,?,?, 'DIGITAL_EMPLOYEE','SYSTEM',?,?,?,?, 'AAIQ_DIGITAL_EMPLOYEE',?)`)
    .bind(crypto.randomUUID(), sessionId, context.organizationId, property.id, responseText, agentResult.runId,
      outcome, JSON.stringify(evidence), now).run();
  await db.prepare(`UPDATE digital_employee_command_sessions SET status=?,updated_at=? WHERE id=?`)
    .bind(approvalRequired ? "WAITING_FOR_HUMAN" : "OPEN", now, sessionId).run();

  return {
    status: approvalRequired ? "NEEDS_REVIEW" : (isFallback ? "MANUAL_FALLBACK" : "SUCCEEDED"),
    runId: agentResult.runId,
    sessionId,
    approvalId,
    response: responseText,
    recommendedNextAction,
    confidence: briefing?.confidence ?? null,
    findings: briefing?.findings ?? [],
  };
}
