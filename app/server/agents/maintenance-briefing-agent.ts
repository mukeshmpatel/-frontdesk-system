import { Agent, OpenAIProvider, Runner, tool } from "@openai/agents";
import { z } from "zod";
import { agentDatabase, beginAgentRun, createAgentFallback, finishAgentRun, proposeApprovalCase, recordToolCall } from "../../../db/agent-platform";
import { getIntegrationCredential } from "../../../db/open-source-integrations";
import { documentVaultReferences } from "../../../db/document-vault";
import { buildOutcomeRecord, correctionsInstructionAddendum, type GroundedOperationsOutput } from "./agent-runtime";

const actionTakenSchema = z.object({
  tool: z.string(), summary: z.string(), referenceId: z.string().nullable(),
  beforeState: z.string().nullable(), afterState: z.string().nullable(),
});

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
  actionsTaken: z.array(actionTakenSchema).default([]),
  confidence: z.number().min(0).max(1),
});

/** The maintenance dispatcher keeps its own dedicated schema (priorities, compliance/parts
 * watch lists); normalize it into the shared shape so it can be reported and audited the
 * same way as every other Digital Employee's answer. */
export function normalizeMaintenanceBriefing(briefing: {
  headline: string; executiveSummary: string; recommendedNextAction: string;
  priorities: { title: string; reason: string; risk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; sourceIds: string[] }[];
  complianceWatch: string[]; partsAndWarrantyWatch: string[]; missingInformation: string[];
  actionsTaken?: GroundedOperationsOutput["actionsTaken"]; confidence: number;
}): GroundedOperationsOutput {
  const criticalCount = briefing.priorities.filter(item => item.risk === "CRITICAL").length;
  const highCount = briefing.priorities.filter(item => item.risk === "HIGH").length;
  return {
    headline: briefing.headline,
    executiveSummary: briefing.executiveSummary,
    recommendedNextAction: briefing.recommendedNextAction,
    nextOwner: "Maintenance Coordinator",
    businessImpact: criticalCount || highCount
      ? `${criticalCount} critical and ${highCount} high-risk maintenance item(s) may affect guest safety or service if not addressed.`
      : "No critical or high-risk maintenance items are currently open.",
    findings: briefing.priorities.map(item => ({ title: item.title, detail: item.reason, risk: item.risk, sourceIds: item.sourceIds })),
    watchItems: [...briefing.complianceWatch, ...briefing.partsAndWarrantyWatch],
    missingInformation: briefing.missingInformation,
    actionsTaken: briefing.actionsTaken ?? [],
    confidence: briefing.confidence,
  };
}

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
  const documentVaultTool = tool({
    name: "search_document_vault",
    description: "Read the property's Document Vault: verified document titles, types, departments, and any human-reviewed classification note — useful for WARRANTY and MAINTENANCE_RECORD documents. Full document text is not extracted (OCR is not configured), so this returns metadata only, never invented body content. Cite a document by its title and status, and tell the human to open it in the Document Vault to read the actual document.",
    parameters: z.object({}),
    execute: async () => {
      const output = await documentVaultReferences(userEmail);
      await recordToolCall(run, "search_document_vault", {}, output);
      return output;
    },
  });
  const proposeDispatchTool = tool({
    name: "propose_maintenance_dispatch",
    description: "Propose dispatching a specific open work order (or a newly needed repair grounded in read_maintenance_work/read_compliance_due/read_asset_context) to a technician. This only creates a PENDING approval case for a manager to review; it never assigns a technician, changes a work order's status, or reserves parts.",
    parameters: z.object({
      workOrderIdOrSummary: z.string().min(1).describe("The id of an existing work order from read_maintenance_work, or a short summary if proposing a repair not yet in the queue."),
      reason: z.string().min(10).describe("Why this needs dispatch now — cite the specific record, priority, or compliance due date."),
      priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).describe("Urgency, matching the same scale used by read_maintenance_work."),
    }),
    execute: async ({ workOrderIdOrSummary, reason, priority }) => {
      const output = await proposeApprovalCase(run, {
        actionType: "MAINTENANCE_DISPATCH_PROPOSAL", riskLevel: priority,
        reason: `${workOrderIdOrSummary} — ${reason}`,
      });
      await recordToolCall(run, "propose_maintenance_dispatch", { workOrderIdOrSummary, reason, priority }, output);
      return output;
    },
  });

  try {
    const correctionsAddendum = await correctionsInstructionAddendum(run.context.organizationId, String(run.property.id), "maintenance-dispatcher");
    const agent = new Agent({
      name: "AAIQ Maintenance Dispatcher",
      model: "gpt-5.4-mini",
      instructions: `You are a governed hotel maintenance briefing agent. Use only the supplied
property-scoped tools. Cite source record IDs in every priority. Never invent work, assets, warranties,
parts, safety facts, or compliance obligations. Distinguish missing data. Recommend exactly one next
action based on life safety, guest impact, SLA, due date, and available evidence. Your read tools never
change anything. When a specific work order or repair clearly needs to be dispatched to a technician
now and is not already assigned, call propose_maintenance_dispatch with a grounded reason and priority
— this only creates a manager approval case, it never assigns a technician, reserves parts, or returns
equipment to service on its own, and every such call must be listed in actionsTaken. Never approve
work, order parts, or bypass safety rules yourself. Use search_document_vault to check for a
relevant WARRANTY or MAINTENANCE_RECORD document before recommending a repair be sent out to a
third party.` + correctionsAddendum,
      tools: [workTool, complianceTool, assetTool, documentVaultTool, proposeDispatchTool],
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
    return { runId: run.id, status, briefing: output, outcomeRecord: buildOutcomeRecord(run, intent, status, normalizeMaintenanceBriefing(output)) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent execution failed.";
    const fallback = await createAgentFallback(run, "FAILED", message);
    return { runId: run.id, status: "MANUAL_FALLBACK", fallback };
  }
}
