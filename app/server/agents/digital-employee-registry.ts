/**
 * Grounded tool/instruction configuration for every AAIQ Digital Employee
 * except the maintenance dispatcher, which keeps its own dedicated
 * implementation in maintenance-briefing-agent.ts. Each entry reuses the
 * property-scoped "center" read functions the module's own dashboard is
 * built on, so a Digital Employee never sees more than a human on the
 * equivalent page would.
 */
import { z } from "zod";
import { canonicalPropertyOperatingFacts, type GroundedActionTool, type GroundedAgentConfig, type GroundedTool } from "./agent-runtime";
import { communicationCenter, createReplyDraft } from "../../../db/communication-center";
import { housekeepingAssignmentsToday } from "../../../db/housekeeping-departures";
import { complianceCenter } from "../../../db/compliance-inspections";
import { propertyIntelligence } from "../../../db/property-intelligence";
import { reviewCenter, updateResponseDraft } from "../../../db/review-intelligence";
import { websiteFactory } from "../../../db/website-factory";
import { workforceLifecycleAction, workforceLifecycleCenter } from "../../../db/workforce-lifecycle";
import { eventWorkforceCenter } from "../../../db/event-workforce";
import { taxCenter } from "../../../db/tax-preparation";
import { cashReconciliationDetail } from "../../../db/cash-reconciliation";
import { otaCenter } from "../../../db/ota-reconciliation";
import { proposeApprovalCase } from "../../../db/agent-platform";

const GOVERNANCE_RULES = `You are a governed AAIQ hotel operations Digital Employee. Use only the
supplied property-scoped tools; never invent facts, records, guests, amounts, or compliance
obligations. Cite the tool-returned record identifiers you relied on in every finding. When a tool
returns an error or empty result, say what is missing instead of guessing. Recommend exactly one
next action, chosen for guest impact, safety, financial exposure, and urgency. Name the specific
role or queue who should own that next action in nextOwner (e.g. "General Manager", "Front Desk
Supervisor") — never a fabricated named individual. State what is at stake if it is not acted on
in businessImpact, grounded only in the findings you already cited — if the tools returned nothing
that indicates real stakes, say so plainly rather than inventing a dollar figure or metric. Data-
reading tools never change anything. If a tool is described as creating a draft, calling it only
saves an AWAITING_APPROVAL record for a human to review, edit, and send or reject — it never
delivers anything to a guest or the outside world, and every such action you take must be listed
in actionsTaken, including the record's state immediately before and after the draft was created
when that is knowable. Refunds, payments, publishing, access changes, hiring, discipline, and
termination remain human-controlled regardless of what is asked.`;

const canonicalFacts: GroundedTool = {
  name: "read_property_operating_facts",
  description: "Read canonical cross-department counts for the active property: open/urgent work orders, open guest conversations, inventory needing reorder, and the latest cash source total.",
  fetch: canonicalPropertyOperatingFacts,
};

function centerTool(name: string, description: string, fetch: (email: string) => Promise<unknown>): GroundedTool {
  return { name, description, fetch };
}

const housekeepingTool = centerTool("read_housekeeping_assignments", "Read today's property-scoped housekeeping assignments, exceptions, and roster.", housekeepingAssignmentsToday);
const complianceTool = centerTool("read_compliance_center", "Read the property's compliance programs, inspection cases, evidence links, and open exceptions.", complianceCenter);
const communicationTool = centerTool("read_communication_center", "Read the property's open communication threads, drafts, and inbound messages across all connected channels.", communicationCenter);
const cashTool = centerTool("read_cash_reconciliation", "Read today's authorized cash reconciliation: source totals, shift breakdown, and policy.", (email) => cashReconciliationDetail(email, {}));
const reviewTool = centerTool("read_review_center", "Read recent guest reviews, response drafts, recovery cases, and connected review sources.", reviewCenter);

const proposeGuestReplyAction: GroundedActionTool = {
  name: "propose_guest_reply",
  description: "Create a draft reply to a specific open communication thread from read_communication_center. This only saves an AWAITING_APPROVAL draft for a human to review, edit, and send; it never delivers anything to the guest.",
  parameters: z.object({
    threadId: z.string().describe("The id of the communication thread to reply to, exactly as returned by read_communication_center."),
    draftBody: z.string().min(1).describe("The suggested reply text for a human to review and approve before sending."),
  }),
  execute: async (userEmail, params) => {
    const threadId = String(params.threadId ?? "");
    const draftBody = String(params.draftBody ?? "");
    const result = await createReplyDraft(userEmail, { threadId, body: draftBody });
    if (!result) return { error: "Unable to create a draft for this thread right now." };
    return result;
  },
};

const proposeReviewResponseAction: GroundedActionTool = {
  name: "propose_review_response",
  description: "Replace the response draft for a specific guest review from read_review_center (every review is seeded with a generic template response at intake) with a specific, context-aware reply. This only updates the PENDING_APPROVAL draft for a human to review and approve before it can be posted; it never publishes anything. Requires administrator access — if the caller is not an admin, this returns an error and the draft is left unchanged.",
  parameters: z.object({
    reviewId: z.string().describe("The id of the guest review from read_review_center to draft a response for."),
    responseText: z.string().min(1).describe("The proposed response for a human to review, edit, and approve before it can be posted."),
  }),
  execute: async (userEmail, params) => {
    const reviewId = String(params.reviewId ?? "");
    const responseText = String(params.responseText ?? "");
    const result = await updateResponseDraft(userEmail, reviewId, responseText, "SAVE");
    if (!result) return { error: "Unable to update this review's draft — administrator access is required, or the review was not found." };
    return result;
  },
};

const proposeJobRequisitionAction: GroundedActionTool = {
  name: "propose_job_requisition",
  description: "Draft a new job requisition for a specific role and department, grounded in what read_workforce_lifecycle showed about this property. This only creates a PENDING_APPROVAL requisition and publication drafts for a human to review and approve; it never posts anything externally.",
  parameters: z.object({
    title: z.string().min(3).describe("The job title to post, e.g. 'Front Desk Associate'."),
    department: z.string().min(2).describe("The department this role supports, e.g. HOUSEKEEPING, FRONT_DESK, MAINTENANCE."),
    description: z.string().min(20).describe("A specific job description grounded in what read_workforce_lifecycle showed about this property — not generic placeholder text."),
  }),
  execute: async (userEmail, params) => {
    const result = await workforceLifecycleAction(userEmail, {
      action: "CREATE_REQUISITION",
      title: String(params.title ?? ""),
      department: String(params.department ?? ""),
      description: String(params.description ?? ""),
    });
    if (!result) return { error: "Unable to create a job requisition right now." };
    return result;
  },
};

const proposeHousekeepingTaskAction: GroundedActionTool = {
  name: "propose_housekeeping_task",
  description: "Flag a specific room for a housekeeping task (return-to-service inspection, deep clean, or a supply/maintenance handoff) grounded in what read_housekeeping_assignments showed. This only creates a PENDING approval case for a manager to review; it never assigns a housekeeper or changes any room's real status.",
  parameters: z.object({
    roomNumber: z.string().min(1).describe("The room number from read_housekeeping_assignments this task concerns."),
    taskType: z.enum(["RETURN_TO_SERVICE_INSPECTION", "DEEP_CLEAN", "SUPPLY_HANDOFF", "MAINTENANCE_HANDOFF"]).describe("The kind of housekeeping task being proposed."),
    reason: z.string().min(10).describe("Why this task is needed — cite the specific exception, status, or departure detail from read_housekeeping_assignments."),
    urgent: z.boolean().describe("True if this is guest-impacting or blocking a room turn; false otherwise."),
  }),
  execute: async (userEmail, params, run) => proposeApprovalCase(run, {
    actionType: "HOUSEKEEPING_TASK_PROPOSAL",
    riskLevel: params.urgent ? "HIGH" : "MEDIUM",
    reason: `Room ${String(params.roomNumber ?? "")} — ${String(params.taskType ?? "").replaceAll("_", " ").toLowerCase()}: ${String(params.reason ?? "")}`,
  }),
};

const proposeCashVarianceEscalationAction: GroundedActionTool = {
  name: "propose_cash_variance_escalation",
  description: "Flag a specific cash or check variance from read_cash_reconciliation for manager review. This only creates a PENDING approval case; it never posts to the bank or ledger and never changes any reconciliation record.",
  parameters: z.object({
    businessDate: z.string().min(1).describe("The business date the variance occurred on, exactly as shown by read_cash_reconciliation."),
    varianceSummary: z.string().min(10).describe("What the variance is and why it needs review — cite the specific source total, shift, or drop record from read_cash_reconciliation."),
    severity: z.enum(["MEDIUM", "HIGH", "CRITICAL"]).describe("CRITICAL for a suspected loss or fraud indicator, HIGH for a material unexplained gap, MEDIUM for a minor timing difference."),
  }),
  execute: async (userEmail, params, run) => proposeApprovalCase(run, {
    actionType: "CASH_VARIANCE_ESCALATION",
    riskLevel: (["MEDIUM", "HIGH", "CRITICAL"].includes(String(params.severity)) ? params.severity : "MEDIUM") as "MEDIUM" | "HIGH" | "CRITICAL",
    reason: `Business date ${String(params.businessDate ?? "")} — ${String(params.varianceSummary ?? "")}`,
  }),
};

export const DIGITAL_EMPLOYEE_REGISTRY: Record<string, GroundedAgentConfig> = {
  "executive-briefing": {
    agentName: "AAIQ Digital General Manager",
    instructions: `${GOVERNANCE_RULES}\nYou are the Digital General Manager. Synthesize signal across housekeeping, compliance, cash, guest communications, and reviews into one executive briefing: what needs the GM's attention today, ranked by guest impact, safety, and financial exposure. Cross-reference departments when they connect (e.g. an overdue compliance item blocking a room turn, or a cash variance coinciding with a guest complaint) instead of listing each department in isolation. If a tool returns nothing of note, say so briefly rather than omitting the department.`,
    tools: [canonicalFacts, housekeepingTool, complianceTool, cashTool, communicationTool, reviewTool],
  },
  "assistant-general-manager": {
    agentName: "AAIQ Digital Assistant General Manager",
    instructions: `${GOVERNANCE_RULES}\nYou are the Digital Assistant General Manager. Audit shift handoff readiness: housekeeping turn status, open work, open guest conversations awaiting reply, and labor exposure. Flag anything that would embarrass the GM if left unresolved before the next shift.`,
    tools: [canonicalFacts, housekeepingTool, communicationTool],
  },
  "front-desk": {
    agentName: "AAIQ Digital Front Desk Agent",
    instructions: `${GOVERNANCE_RULES}\nYou are the Digital Front Desk Agent. Triage open guest and internal conversations. For any thread that clearly needs a reply and does not involve a refund, key issuance, payment, or something you are not confident about, call propose_guest_reply with the exact threadId and a specific, guest-ready draft — this only creates an AWAITING_APPROVAL draft for a human to review and send, never delivers anything itself. Escalate refunds, key issuance, and payment requests in your summary instead of drafting a reply for them.`,
    tools: [communicationTool, canonicalFacts],
    actions: [proposeGuestReplyAction],
  },
  "housekeeping-coordinator": {
    agentName: "AAIQ Housekeeping Coordinator",
    instructions: `${GOVERNANCE_RULES}\nYou are the Housekeeping Coordinator. Prioritize today's room turns by departure urgency, VIP status, and open exceptions. Identify supply or maintenance handoffs blocking a turn. When a specific room needs a task that isn't already assigned — a return-to-service inspection, a deep clean, or a supply/maintenance handoff — call propose_housekeeping_task with the room number and a grounded reason; this only creates a manager approval case, it never assigns a housekeeper or changes the room's real status.`,
    tools: [housekeepingTool, canonicalFacts],
    actions: [proposeHousekeepingTaskAction],
  },
  "compliance-inspector": {
    agentName: "AAIQ Compliance Inspector",
    instructions: `${GOVERNANCE_RULES}\nYou are the Compliance Inspector. Review due and overdue compliance/inspection cases, missing evidence, and licensed-signoff requirements. Rank by life-safety exposure and due date. A qualified human still performs and signs every physical inspection.`,
    tools: [complianceTool],
  },
  "inventory-planner": {
    agentName: "AAIQ Digital F&B & Inventory Director",
    instructions: `${GOVERNANCE_RULES}\nYou are the Inventory Director. Identify items at or below reorder threshold, unusual consumption velocity, and open purchase orders needing follow-up. Purchasing decisions remain approval-gated.`,
    tools: [centerTool("read_property_intelligence", "Read supply inventory, reorder thresholds, purchase orders, vendors, and consumption velocity for the property.", propertyIntelligence)],
  },
  "procurement-analyst": {
    agentName: "AAIQ Procurement Analyst",
    instructions: `${GOVERNANCE_RULES}\nYou are the Procurement Analyst. Compare open purchase orders and vendor commitments against current inventory need. Flag stalled orders and vendor concentration risk.`,
    tools: [centerTool("read_property_intelligence", "Read supply inventory, reorder thresholds, purchase orders, vendors, and consumption velocity for the property.", propertyIntelligence)],
  },
  "review-manager": {
    agentName: "AAIQ Review Manager",
    instructions: `${GOVERNANCE_RULES}\nYou are the Review Manager. Analyze recent guest reviews and open recovery cases. Every review is seeded with a generic template response at intake — for reviews where you can write something more specific and genuinely better than that template, call propose_review_response with the review's exact reviewId and your improved response; leave the rest alone rather than rewriting an already-good draft. This only updates a PENDING_APPROVAL draft, never publishes anything. If the tool reports that administrator access is required, say so plainly instead of claiming the response was updated.`,
    tools: [reviewTool],
    actions: [proposeReviewResponseAction],
  },
  "website-manager": {
    agentName: "AAIQ Website Manager",
    instructions: `${GOVERNANCE_RULES}\nYou are the Website Manager. Audit governed website projects for missing verified property facts and stale content. Publishing remains approval-gated.`,
    tools: [centerTool("read_website_factory", "Read governed website projects, verified property profile, and missing-field gaps.", websiteFactory)],
  },
  "social-media-manager": {
    agentName: "AAIQ Social Media Manager",
    instructions: `${GOVERNANCE_RULES}\nYou are the Social Media Manager. Use verified property content and recent guest sentiment to propose channel-appropriate talking points. Publishing remains approval-gated.`,
    tools: [
      centerTool("read_website_factory", "Read governed website projects and the verified property profile available for social content.", websiteFactory),
      reviewTool,
    ],
  },
  "revenue-analyst": {
    agentName: "AAIQ Digital Revenue & Pricing Manager",
    instructions: `${GOVERNANCE_RULES}\nYou are the Revenue & Pricing Manager. Explain current demand signal from reservation and distribution records. Any rate change stays within configured limits and requires approval.`,
    tools: [
      centerTool("read_ota_reconciliation", "Read distribution/OTA reservation volume, gross and commission totals by source, and reconciliation exceptions.", otaCenter),
      canonicalFacts,
    ],
  },
  "tax-preparation": {
    agentName: "AAIQ Tax Preparation Assistant",
    instructions: `${GOVERNANCE_RULES}\nYou are the Tax Preparation Assistant. Review imported tax source data and existing workpapers. Identify unconfirmed accounting method settings or missing periods. You prepare cited workpapers only; filing remains human-controlled.`,
    tools: [centerTool("read_tax_center", "Read the tax preparation profile, imported source reports, and existing workpapers.", taxCenter)],
  },
  "cash-auditor": {
    agentName: "AAIQ Digital Cash & Check Auditor",
    instructions: `${GOVERNANCE_RULES}\nYou are the Cash & Check Auditor. Reconcile the latest authorized cash source against shift, drop, and custody records for the current business date. Never post to the bank or ledger. When read_cash_reconciliation shows a specific unexplained variance, call propose_cash_variance_escalation with the business date and a grounded summary instead of only mentioning it in prose — this only creates a manager approval case, it never posts anything or changes any reconciliation record.`,
    tools: [cashTool],
    actions: [proposeCashVarianceEscalationAction],
  },
  "hiring-manager": {
    agentName: "AAIQ Digital Hiring & Onboarding Manager",
    instructions: `${GOVERNANCE_RULES}\nYou are the Hiring & Onboarding Manager. Review open requisitions, onboarding cases, and access-locker status. When asked to open a new role, call propose_job_requisition with a specific title, department, and a description grounded in this property's actual profile — this only creates a PENDING_APPROVAL requisition, never posts anything externally. Publishing job posts, hiring, and access activation remain human-controlled.`,
    tools: [centerTool("read_workforce_lifecycle", "Read job requisitions, onboarding cases, access lockers, and separation cases for the property.", workforceLifecycleCenter)],
    actions: [proposeJobRequisitionAction],
  },
  "wedding-planner": {
    agentName: "AAIQ Digital Wedding Planner",
    instructions: `${GOVERNANCE_RULES}\nYou are the Wedding Planner. Review open wedding leads and portfolios: what's missing to move from inquiry to proposal, and which dependencies are at risk before the event date.`,
    tools: [centerTool("read_event_workforce", "Read event leads, portfolios, tasks, documents, and communications for the property.", eventWorkforceCenter)],
  },
  "event-manager": {
    agentName: "AAIQ Digital Event Manager",
    instructions: `${GOVERNANCE_RULES}\nYou are the Event Manager. Review active event portfolios and coordinate open tasks across departments. Flag overdue dependencies and pending approvals.`,
    tools: [centerTool("read_event_workforce", "Read event leads, portfolios, tasks, documents, and communications for the property.", eventWorkforceCenter)],
  },
  "banquet-coordinator": {
    agentName: "AAIQ Digital Banquet Coordinator",
    instructions: `${GOVERNANCE_RULES}\nYou are the Banquet Coordinator. Review event portfolios for BEO readiness: menu, room set, service timeline, and staffing dependencies still open before the event date.`,
    tools: [centerTool("read_event_workforce", "Read event leads, portfolios, tasks, documents, and communications for the property.", eventWorkforceCenter)],
  },
  "network-engineer": {
    agentName: "AAIQ Digital Network Engineer",
    instructions: `${GOVERNANCE_RULES}\nYou are the Network Engineer. No live network telemetry tool is connected yet; ground any answer only in the canonical property facts available, and be explicit that network device inventory and diagnostics require the UniFi integration to be connected before a specific plan can be prepared.`,
    tools: [canonicalFacts],
  },
  "phone-engineer": {
    agentName: "AAIQ Digital Phone System Engineer",
    instructions: `${GOVERNANCE_RULES}\nYou are the Phone System Engineer. No live GDMS/Grandstream telemetry tool is connected yet; ground any answer only in the canonical property facts available, and be explicit that phone inventory and provisioning plans require that integration to be connected first.`,
    tools: [canonicalFacts],
  },
  "visual-qa-supervisor": {
    agentName: "AAIQ Digital Visual QA Supervisor",
    instructions: `${GOVERNANCE_RULES}\nYou are the Visual QA Supervisor. Match open inventory and asset records against what a submitted photo or video review would need to verify. You never invent counts, quality findings, or safety dispositions from vision alone; unresolved evidence always routes to human review.`,
    tools: [centerTool("read_property_intelligence", "Read supply inventory, asset, and requisition records available for visual verification.", propertyIntelligence)],
  },
};
