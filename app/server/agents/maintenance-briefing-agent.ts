import { Agent, OpenAIProvider, Runner, tool } from "@openai/agents";
import { z } from "zod";
import { agentDatabase, beginAgentRun, createAgentFallback, finishAgentRun, recordToolCall } from "../../../db/agent-platform";
import { getIntegrationCredential } from "../../../db/open-source-integrations";

const briefingSchema = z.object({
  headline: z.string(),
  executiveSummary: z.string(),
  recommendedNextAction: z.string(),
  priorities: z.array(z.object({
    title: z.string(), reason: z.string(), risk: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
    sourceIds: z.array(z.string()),
  })),
  complianceWatch: z.array(z.string()),
  partsAndWarrantyWatch: z.array(z.string()),
  missingInformation: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

export async function runMaintenanceBriefing(userEmail: string, intent: string) {
  const run = await beginAgentRun(userEmail, "maintenance-dispatcher", intent);
  if (!run) return null;
  const apiKey = await getIntegrationCredential(
    run.context.organizationId, "OPENAI_AGENTS", "OPENAI_API_KEY",
  ) || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const fallback = await createAgentFallback(run, "INTEGRATION_UNAVAILABLE",
      "The model connection is not configured in this runtime. The request has been preserved for manual completion.");
    return { runId: run.id, status: "MANUAL_FALLBACK", fallback };
  }

  const scope = { organizationId: run.context.organizationId, propertyId: String(run.property.id) };
  const workTool = tool({
    name: "read_maintenance_work",
    description: "Read property-scoped maintenance work orders. This tool is read-only.",
    parameters: z.object({ includeCompleted: z.boolean().default(false) }),
    execute: async ({ includeCompleted }) => {
      const rows = await agentDatabase().prepare(`SELECT id,title,description,room_number,status,priority,
        assigned_to,due_at,progress,asset_id FROM operational_work_orders
        WHERE organization_id=? AND property_id=? AND department='MAINTENANCE'
        ${includeCompleted ? "" : "AND status NOT IN ('COMPLETE','VERIFIED','CLOSED')"}
        ORDER BY CASE priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 ELSE 3 END,due_at LIMIT 50`)
        .bind(scope.organizationId, scope.propertyId).all();
      const output = rows.results;
      await recordToolCall(run, "read_maintenance_work", { includeCompleted }, output);
      return output;
    },
  });
  const complianceTool = tool({
    name: "read_compliance_due",
    description: "Read property-scoped preventive maintenance and compliance templates. Read-only.",
    parameters: z.object({ daysAhead: z.number().int().min(1).max(120).default(30) }),
    execute: async ({ daysAhead }) => {
      const cutoff = new Date(Date.now() + daysAhead * 86_400_000).toISOString();
      const rows = await agentDatabase().prepare(`SELECT id,code,name,description,frequency,
        required_evidence,next_due_at FROM maintenance_compliance_templates
        WHERE organization_id=? AND property_id=? AND active=1 AND next_due_at<=?
        ORDER BY next_due_at LIMIT 50`).bind(scope.organizationId, scope.propertyId, cutoff).all();
      await recordToolCall(run, "read_compliance_due", { daysAhead }, rows.results);
      return rows.results;
    },
  });
  const assetTool = tool({
    name: "read_asset_context",
    description: "Read asset details referenced by active maintenance work. Read-only.",
    parameters: z.object({ limit: z.number().int().min(1).max(50).default(25) }),
    execute: async ({ limit }) => {
      const rows = await agentDatabase().prepare(`SELECT DISTINCT a.id,a.code,a.name,a.asset_type,
        a.description,a.metadata_json FROM property_assets a JOIN operational_work_orders w ON w.asset_id=a.id
        WHERE a.organization_id=? AND a.property_id=? AND w.status NOT IN ('COMPLETE','VERIFIED','CLOSED')
        LIMIT ?`).bind(scope.organizationId, scope.propertyId, limit).all();
      await recordToolCall(run, "read_asset_context", { limit }, rows.results);
      return rows.results;
    },
  });

  try {
    const agent = new Agent({
      name: "AAIQ Maintenance Dispatcher",
      model: "gpt-5.4-mini",
      instructions: `You are a governed hotel maintenance briefing agent. Use only the supplied
property-scoped tools. Cite source record IDs in every priority. Never invent work, assets, warranties,
parts, safety facts, or compliance obligations. Distinguish missing data. Recommend exactly one next
action based on life safety, guest impact, SLA, due date, and available evidence. You are read-only:
never change records, approve work, order parts, return equipment to service, or bypass safety rules.`,
      tools: [workTool, complianceTool, assetTool],
      outputType: briefingSchema,
    });
    const runner = new Runner({
      modelProvider: new OpenAIProvider({ apiKey, useResponses: true }),
    });
    const result = await runner.run(agent,
      `${intent || "Prepare my maintenance briefing."}\nActive property: ${run.property.name} (${run.property.code}).`);
    const output = result.finalOutput;
    if (!output) throw new Error("The agent did not return a structured briefing.");
    const status = output.confidence < 0.7 || output.missingInformation.length ? "NEEDS_REVIEW" : "SUCCEEDED";
    await finishAgentRun(run, {
      status, confidence: output.confidence,
      sources: output.priorities.flatMap(item => item.sourceIds),
      evidence: output.priorities, plan: [output.recommendedNextAction],
      output, missing: output.missingInformation,
      approvalStatus: status === "NEEDS_REVIEW" ? "HUMAN_REVIEW_REQUIRED" : "NOT_REQUIRED",
    });
    return { runId: run.id, status, briefing: output };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent execution failed.";
    const fallback = await createAgentFallback(run, "FAILED", message);
    return { runId: run.id, status: "MANUAL_FALLBACK", fallback };
  }
}
