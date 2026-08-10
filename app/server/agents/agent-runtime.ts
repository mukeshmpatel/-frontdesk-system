/**
 * Shared runtime for governed, tool-grounded AAIQ Digital Employees.
 *
 * Every agent built on this runtime follows the same contract proven out by
 * the maintenance dispatcher: it may only answer from data returned by its
 * own read-only tools, it must cite what it used, it must say what is
 * missing instead of inventing it, and low confidence or missing data routes
 * the run to human review instead of a confident-sounding guess.
 */
import { Agent, OpenAIProvider, Runner, tool } from "@openai/agents";
import { z } from "zod";
import {
  activeProperty,
  agentDatabase,
  beginAgentRun,
  createAgentFallback,
  finishAgentRun,
  recentAgentCorrections,
  recordToolCall,
} from "../../../db/agent-platform";
import { getIntegrationCredential } from "../../../db/open-source-integrations";
import { activeStaffContext } from "../../../db/staff";

export const groundedOperationsSchema = z.object({
  headline: z.string(),
  executiveSummary: z.string(),
  recommendedNextAction: z.string(),
  /** Who should act on recommendedNextAction next — a role or queue (e.g. "General
   * Manager", "Front Desk Supervisor"), never a fabricated named individual. */
  nextOwner: z.string(),
  /** Plain-language statement of what is at stake if recommendedNextAction is not
   * taken, grounded only in the findings/risk levels already cited below — never a
   * fabricated dollar figure or metric the tools did not return. */
  businessImpact: z.string(),
  findings: z.array(z.object({
    title: z.string(),
    detail: z.string(),
    risk: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
    sourceIds: z.array(z.string()),
  })),
  watchItems: z.array(z.string()),
  missingInformation: z.array(z.string()),
  actionsTaken: z.array(z.object({
    tool: z.string(),
    summary: z.string(),
    referenceId: z.string().nullable(),
    /** State immediately before/after this action, when the tool changed a record
     * (e.g. a draft's prior status vs its new AWAITING_APPROVAL status). Null for
     * read-only tools or when no prior state exists. */
    beforeState: z.string().nullable(),
    afterState: z.string().nullable(),
  })).default([]),
  confidence: z.number().min(0).max(1),
});

export type GroundedOperationsOutput = z.infer<typeof groundedOperationsSchema>;

/**
 * The blueprint's "Outcome Record" contract: every governed run's request,
 * scope, decision, evidence, and next step in one canonical shape, assembled
 * from the two places this data already lives — the LLM's structured output
 * (groundedOperationsSchema) and the ai_agent_runs row created by
 * beginAgentRun/finishAgentRun. Nothing here is invented by this function;
 * it only relabels and combines fields that were already captured.
 */
export type OutcomeRecord = {
  runId: string;
  requestedBy: string;
  intent: string;
  organizationId: string;
  propertyId: string;
  propertyName: string;
  sourcesConsulted: string[];
  findings: GroundedOperationsOutput["findings"];
  decision: string;
  confidence: number;
  actionStatus: "SUCCEEDED" | "NEEDS_REVIEW" | "MANUAL_FALLBACK";
  actionsTaken: GroundedOperationsOutput["actionsTaken"];
  businessImpact: string;
  exceptions: { watchItems: string[]; missingInformation: string[] };
  nextOwner: string;
  nextAction: string;
  correlationId: string;
};

export function buildOutcomeRecord(
  run: { id: string; context: { organizationId: string; email: string }; property: Record<string, unknown> },
  intent: string,
  status: "SUCCEEDED" | "NEEDS_REVIEW" | "MANUAL_FALLBACK",
  output: GroundedOperationsOutput,
): OutcomeRecord {
  return {
    runId: run.id,
    requestedBy: run.context.email,
    intent,
    organizationId: run.context.organizationId,
    propertyId: String(run.property.id ?? ""),
    propertyName: String(run.property.name ?? ""),
    sourcesConsulted: [...new Set(output.findings.flatMap(item => item.sourceIds))],
    findings: output.findings,
    decision: output.recommendedNextAction,
    confidence: output.confidence,
    actionStatus: status,
    actionsTaken: output.actionsTaken,
    businessImpact: output.businessImpact,
    exceptions: { watchItems: output.watchItems, missingInformation: output.missingInformation },
    nextOwner: output.nextOwner,
    nextAction: output.recommendedNextAction,
    correlationId: run.id,
  };
}

/** A read-only data source an agent may cite. Never mutates state. */
export type GroundedTool = {
  name: string;
  description: string;
  fetch: (userEmail: string) => Promise<unknown>;
};

/**
 * A tool that writes something, scoped tightly to creating an
 * AWAITING_APPROVAL-style draft record. It must never send, publish, charge,
 * or otherwise reach a guest or the outside world on its own — the same
 * human-approval boundary every other write path in AAIQ already enforces.
 */
export type GroundedActionTool = {
  name: string;
  description: string;
  parameters: z.ZodObject<z.ZodRawShape>;
  /** `run` is the same active agent run object beginAgentRun produced — pass it through
   * to proposeApprovalCase() (db/agent-platform.ts) when a module has no domain-specific
   * draft table of its own and needs to write into the shared ai_approval_cases queue. */
  execute: (userEmail: string, params: Record<string, unknown>, run: any) => Promise<unknown>;
};

export type GroundedAgentConfig = {
  agentName: string;
  instructions: string;
  tools: GroundedTool[];
  actions?: GroundedActionTool[];
};

export type GroundedAgentRunResult =
  | { status: "SUCCEEDED" | "NEEDS_REVIEW"; runId: string; briefing: GroundedOperationsOutput; outcomeRecord: OutcomeRecord }
  | { status: "MANUAL_FALLBACK"; runId: string; fallback: unknown };

const AGENT_MODEL = "gpt-5.4-mini";

/**
 * Turns recent manager rejections of this agent's proposals into a short
 * instructions addendum — the correction-signal learning loop. Each reason
 * is exactly what a manager already typed into the existing Approve/Reject
 * panel in Agent Studio; nothing here is invented or summarized by a model.
 * Returns "" when there's no correction history yet, so an agent with no
 * corrections behaves identically to before this existed.
 */
export async function correctionsInstructionAddendum(organizationId: string, propertyId: string, agentKey: string) {
  const corrections = await recentAgentCorrections(organizationId, propertyId, agentKey);
  if (!corrections.length) return "";
  const lines = corrections.map(item => `- (${item.action_type}) ${item.correction_reason}`).join("\n");
  return `\n\nRecent manager corrections for this role — weigh these, but do not apply one as a blanket rule if it clearly doesn't fit the current situation:\n${lines}`;
}

export async function runGroundedOperationsAgent(
  agentKey: string,
  config: GroundedAgentConfig,
  userEmail: string,
  intent: string,
): Promise<GroundedAgentRunResult | null> {
  const run = await beginAgentRun(userEmail, agentKey, intent);
  if (!run) return null;

  const apiKey = await getIntegrationCredential(
    run.context.organizationId, "OPENAI_AGENTS", "OPENAI_API_KEY",
  ) || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const fallback = await createAgentFallback(run, "INTEGRATION_UNAVAILABLE",
      "The model connection is not configured in this runtime. The request has been preserved for manual completion.");
    return { runId: run.id, status: "MANUAL_FALLBACK", fallback };
  }
  const correctionsAddendum = await correctionsInstructionAddendum(run.context.organizationId, String(run.property.id), agentKey);

  const runtimeTools = config.tools.map(source => tool({
    name: source.name,
    description: source.description,
    parameters: z.object({}),
    execute: async () => {
      let output: unknown;
      try {
        output = await source.fetch(userEmail);
      } catch (error) {
        output = { error: error instanceof Error ? error.message : "This source is unavailable right now." };
      }
      await recordToolCall(run, source.name, {}, output);
      return output;
    },
  }));
  const actionTools = (config.actions ?? []).map(action => tool({
    name: action.name,
    description: action.description,
    parameters: action.parameters,
    execute: async (params: Record<string, unknown>) => {
      let output: unknown;
      try {
        output = await action.execute(userEmail, params, run);
      } catch (error) {
        output = { error: error instanceof Error ? error.message : "This action could not be completed." };
      }
      await recordToolCall(run, action.name, params, output);
      return output;
    },
  }));

  try {
    const agent = new Agent({
      name: config.agentName,
      model: AGENT_MODEL,
      instructions: config.instructions + correctionsAddendum,
      tools: [...runtimeTools, ...actionTools],
      outputType: groundedOperationsSchema,
    });
    const runner = new Runner({
      modelProvider: new OpenAIProvider({ apiKey, useResponses: true }),
    });
    const result = await runner.run(agent,
      `${intent || "Prepare my briefing."}\nActive property: ${run.property.name} (${run.property.code}).`);
    const output = result.finalOutput;
    if (!output) throw new Error("The agent did not return a structured result.");
    const status = output.confidence < 0.7 || output.missingInformation.length ? "NEEDS_REVIEW" : "SUCCEEDED";
    await finishAgentRun(run, {
      status,
      confidence: output.confidence,
      sources: output.findings.flatMap(item => item.sourceIds),
      evidence: output.findings,
      plan: [output.recommendedNextAction],
      output,
      missing: output.missingInformation,
      approvalStatus: status === "NEEDS_REVIEW" ? "HUMAN_REVIEW_REQUIRED" : "NOT_REQUIRED",
    });
    return { runId: run.id, status, briefing: output, outcomeRecord: buildOutcomeRecord(run, intent, status, output) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent execution failed.";
    const fallback = await createAgentFallback(run, "FAILED", message);
    return { runId: run.id, status: "MANUAL_FALLBACK", fallback };
  }
}

/** Cross-module operating facts every digital employee may fall back on for grounding. */
export async function canonicalPropertyOperatingFacts(userEmail: string) {
  const db = agentDatabase();
  const context = await activeStaffContext(userEmail);
  if (!context) return { error: "No authorized workspace context." };
  const property = await activeProperty(context) as Record<string, unknown> | null;
  if (!property) return { error: "No authorized property context." };
  const scope = [context.organizationId, property.id] as const;
  const [openWork, urgentWork, inbox, inventory, cash] = await Promise.all([
    db.prepare(`SELECT COUNT(*) count FROM operational_work_orders WHERE organization_id=? AND property_id=? AND status NOT IN ('CLOSED','COMPLETED')`).bind(...scope).first<Record<string, unknown>>(),
    db.prepare(`SELECT COUNT(*) count FROM operational_work_orders WHERE organization_id=? AND property_id=? AND priority IN ('CRITICAL','HIGH') AND status NOT IN ('CLOSED','COMPLETED')`).bind(...scope).first<Record<string, unknown>>(),
    db.prepare(`SELECT COUNT(*) count FROM communication_threads WHERE organization_id=? AND property_id=? AND status NOT IN ('CLOSED','RESOLVED')`).bind(...scope).first<Record<string, unknown>>(),
    db.prepare(`SELECT COUNT(*) count,COALESCE(SUM(CASE WHEN quantity<=reorder_threshold THEN 1 ELSE 0 END),0) attention FROM supply_inventory WHERE organization_id=? AND property_id=?`).bind(...scope).first<Record<string, unknown>>(),
    db.prepare(`SELECT business_date,total_cash_cents,status FROM cash_source_batches WHERE organization_id=? AND property_id=? AND active=1 ORDER BY business_date DESC,imported_at DESC LIMIT 1`).bind(...scope).first<Record<string, unknown>>(),
  ]);
  return {
    property: property.name,
    propertyCode: property.code,
    openWorkOrders: Number(openWork?.count ?? 0),
    urgentWorkOrders: Number(urgentWork?.count ?? 0),
    openConversations: Number(inbox?.count ?? 0),
    inventoryItems: Number(inventory?.count ?? 0),
    inventoryNeedingAttention: Number(inventory?.attention ?? 0),
    latestCashCents: cash?.total_cash_cents ?? null,
    cashBusinessDate: cash?.business_date ?? null,
  };
}
