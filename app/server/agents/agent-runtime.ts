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
  recordToolCall,
} from "../../../db/agent-platform";
import { getIntegrationCredential } from "../../../db/open-source-integrations";
import { activeStaffContext } from "../../../db/staff";

export const groundedOperationsSchema = z.object({
  headline: z.string(),
  executiveSummary: z.string(),
  recommendedNextAction: z.string(),
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
  })).default([]),
  confidence: z.number().min(0).max(1),
});

export type GroundedOperationsOutput = z.infer<typeof groundedOperationsSchema>;

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
  execute: (userEmail: string, params: Record<string, unknown>) => Promise<unknown>;
};

export type GroundedAgentConfig = {
  agentName: string;
  instructions: string;
  tools: GroundedTool[];
  actions?: GroundedActionTool[];
};

export type GroundedAgentRunResult =
  | { status: "SUCCEEDED" | "NEEDS_REVIEW"; runId: string; briefing: GroundedOperationsOutput }
  | { status: "MANUAL_FALLBACK"; runId: string; fallback: unknown };

const AGENT_MODEL = "gpt-5.4-mini";

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
        output = await action.execute(userEmail, params);
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
      instructions: config.instructions,
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
    return { runId: run.id, status, briefing: output };
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
