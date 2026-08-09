import { env } from "cloudflare:workers";
import { activeStaffContext } from "./staff";

const AUTO_TYPES = new Set(["LATE_CHECKOUT", "HOUSEKEEPING_SUPPLY", "ROUTINE_MAINTENANCE", "VENDOR_DELAY"]);
const HUMAN_TYPES = new Set(["GUEST_COMPLAINT", "BILLING_DISPUTE", "REFUND", "SAFETY", "HR"]);

function db(): D1Database {
  if (!env.DB) throw new Error("AAI Q notification storage is unavailable.");
  return env.DB;
}

function classifyBuiltIn(text: string) {
  const value = text.toLowerCase();
  const rules: Array<[string, string[], string, string]> = [
    ["SAFETY", ["fire", "injury", "unsafe", "police"], "CRITICAL", "EXECUTIVE"],
    ["HR", ["employee complaint", "harassment", "callout", "called out"], "HIGH", "EXECUTIVE"],
    ["REFUND", ["refund", "chargeback"], "HIGH", "FRONT_DESK"],
    ["BILLING_DISPUTE", ["billing", "wrong charge", "dispute", "invoice error"], "HIGH", "FRONT_DESK"],
    ["GUEST_COMPLAINT", ["complaint", "angry", "dirty room", "terrible stay"], "HIGH", "EXECUTIVE"],
    ["VENDOR_DELAY", ["vendor", "delivery delayed", "shipment delayed", "backorder"], "MEDIUM", "MAINTENANCE"],
    ["HOUSEKEEPING_SUPPLY", ["detergent", "pillowcase", "bedsheet", "linen", "housekeeping supply"], "MEDIUM", "HOUSEKEEPING"],
    ["LATE_CHECKOUT", ["late checkout", "extend checkout"], "LOW", "FRONT_DESK"],
    ["ROUTINE_MAINTENANCE", ["replace filter", "light bulb", "routine maintenance", "preventive"], "LOW", "MAINTENANCE"],
  ];
  const match = rules.find(([, terms]) => terms.some((term) => value.includes(term)));
  if (!match) return { type: "UNKNOWN", urgency: "LOW", owner: "FRONT_DESK", confidence: 55, reason: "No approved operational pattern matched; human review is required." };
  const [type, terms, urgency, owner] = match;
  const evidence = terms.find((term) => value.includes(term));
  return { type, urgency, owner, confidence: 94, reason: `Matched the approved “${evidence}” operational policy. No hidden model action was taken.` };
}

async function classifyWithCustomRules(organizationId:string,source:string,text:string) {
  try {
    const rows=await db().prepare(`SELECT id,name,trigger_source,trigger_condition,action_type,target_department,
      minimum_confidence,approval_mode,urgency FROM ai_automation_rules
      WHERE organization_id=? AND enabled=1 AND (trigger_source='ANY_MESSAGE' OR trigger_source=?)
      ORDER BY minimum_confidence DESC,updated_at DESC`).bind(organizationId,source).all<{
        id:string;name:string;trigger_source:string;trigger_condition:string;action_type:string;target_department:string;
        minimum_confidence:number;approval_mode:string;urgency:string;
      }>();
    const value=text.toLowerCase();
    for(const rule of rows.results){
      const terms=rule.trigger_condition.toLowerCase().split(/\s+(?:or|and)\s+|[,;]/)
        .map(term=>term.replace(/^(mentions?|contains?|matches?)\s+/,"").trim()).filter(term=>term.length>=3);
      const evidence=terms.find(term=>value.includes(term));
      if(evidence)return {
        type:rule.action_type,urgency:rule.urgency,owner:rule.target_department,
        confidence:Math.max(rule.minimum_confidence,95),
        reason:`Custom rule “${rule.name}” matched “${evidence}”. ${rule.approval_mode==="AUTO_EXECUTE"?"Approved for automatic execution by policy.":"Manager approval is required."}`,
        approvalMode:rule.approval_mode,ruleId:rule.id,
      };
    }
  } catch {
    // The built-in safe classifier remains available during an initial migration rollout.
  }
  return null;
}

export async function ingestNotificationSource(input: {
  userEmail: string; source: "GMAIL" | "TWILIO_SMS" | "INTERNAL";
  externalId: string; sourceAccount: string; sender?: string; subject?: string;
  content: string; receivedAt?: string;
}) {
  const context = await activeStaffContext(input.userEmail);
  if (!context) return null;
  const existing = await db().prepare(`SELECT id FROM notification_source_events
    WHERE organization_id=? AND source=? AND external_id=?`)
    .bind(context.organizationId, input.source, input.externalId).first<{ id: string }>();
  if (existing) return { sourceEventId: existing.id, duplicate: true, decision: "ALREADY_PROCESSED" };
  const sourceEventId = crypto.randomUUID();
  const candidateId = crypto.randomUUID();
  const now = new Date().toISOString();
  const combined=`${input.subject ?? ""}\n${input.content}`;
  const custom=await classifyWithCustomRules(context.organizationId,input.source,combined);
  const result = custom ?? classifyBuiltIn(combined);
  const auto = custom ? custom.approvalMode==="AUTO_EXECUTE" && result.confidence>=90 :
    AUTO_TYPES.has(result.type) && result.confidence >= 90;
  const decision = auto ? "AUTO_APPROVED" : "PENDING_APPROVAL";
  await db().batch([
    db().prepare(`INSERT INTO notification_source_events
      (id,organization_id,owner_email,source,external_id,source_account,sender_label,subject,raw_content,
       received_at,processed_at,access_scope,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(sourceEventId, context.organizationId, context.email, input.source, input.externalId, input.sourceAccount,
        input.sender ?? "", input.subject ?? "", input.content, input.receivedAt ?? now, now, "OWNER_ADMIN", now),
    db().prepare(`INSERT INTO notification_action_candidates
      (id,organization_id,source_event_id,action_type,urgency,suggested_owner,due_at,confidence,classifier,
       reasoning_summary,decision,created_entity_type,created_entity_id,created_at,decided_at,decided_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(candidateId, context.organizationId, sourceEventId, result.type, result.urgency, result.owner, null,
        result.confidence, custom ? `CUSTOM_RULE:${custom.ruleId}` : "AAIQ_RULES_V1", result.reason, decision, null, null, now,
        auto ? now : null, auto ? "SYSTEM_POLICY" : null),
  ]);
  return { sourceEventId, candidateId, actionType: result.type, confidence: result.confidence,
    decision, requiresApproval: HUMAN_TYPES.has(result.type) || !auto, duplicate: false };
}

export async function listNotificationCandidates(userEmail: string) {
  const context = await activeStaffContext(userEmail); if (!context) return null;
  const adminClause = context.role === "admin" ? "" : " AND lower(s.owner_email)=?";
  const bindings = context.role === "admin" ? [context.organizationId] : [context.organizationId, context.email];
  return db().prepare(`SELECT c.id,c.action_type AS actionType,c.urgency,c.suggested_owner AS suggestedOwner,
    c.confidence,c.reasoning_summary AS reasoningSummary,c.decision,c.created_at AS createdAt,
    s.id AS sourceEventId,s.source,s.source_account AS sourceAccount,s.sender_label AS sender,s.subject,s.received_at AS receivedAt
    FROM notification_action_candidates c JOIN notification_source_events s ON s.id=c.source_event_id
    WHERE c.organization_id=?${adminClause} ORDER BY c.created_at DESC LIMIT 100`).bind(...bindings).all();
}

export async function getNotificationSource(userEmail: string, sourceEventId: string) {
  const context = await activeStaffContext(userEmail); if (!context) return null;
  return db().prepare(`SELECT id,owner_email AS ownerEmail,source,source_account AS sourceAccount,sender_label AS sender,
    subject,raw_content AS content,received_at AS receivedAt FROM notification_source_events
    WHERE id=? AND organization_id=? AND (lower(owner_email)=? OR ?='admin')`)
    .bind(sourceEventId, context.organizationId, context.email, context.role).first();
}
