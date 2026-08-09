/**
 * Proactive, unattended runs of the grounded Digital Employee agents.
 *
 * This is the "smarter, still approval-gated" definition of autonomy: agents
 * reason and draft on their own schedule instead of waiting for someone to
 * click a button, but every action they take (see agent-runtime.ts's
 * GroundedActionTool) still only creates an AWAITING_APPROVAL / PENDING_APPROVAL
 * record. Nothing is ever sent, posted, or published by this sweep - a human
 * still reviews every draft before it reaches a guest, a review site, or a
 * job board, exactly as when a person triggers the same agent from the chat.
 */
import { agentDatabase } from "../../../db/agent-platform";
import { runDigitalEmployeeCommand } from "./digital-employee-command";

/** Once-daily local window per property, mirroring the existing scheduled
 * cash-reconciliation pattern: the cron fires every 15 minutes, but this
 * only actually runs during one matching window per property per day. */
const WINDOW_START_MINUTES = 7 * 60; // 07:00 local
const WINDOW_END_MINUTES = 7 * 60 + 15; // 07:15 local

const PROACTIVE_AGENT_PROMPTS: Record<string, string> = {
  "executive-briefing": "Prepare today's executive briefing across all departments: housekeeping, compliance, cash, guest communications, and reviews. Highlight what needs my attention first.",
  "front-desk": "Triage today's open guest and internal conversations. Draft a reply for any thread that clearly needs one and does not involve a refund, key issuance, or payment.",
};

function propertyLocalDate(timezone: string, at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone || "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

function propertyLocalMinutes(timezone: string, at: Date): number {
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: timezone || "America/Chicago", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

export async function runScheduledDigitalEmployeeBriefings(now = new Date()) {
  const db = agentDatabase();
  const properties = await db.prepare(`SELECT p.id,p.organization_id,p.name,p.timezone,o.owner_email
    FROM property_contexts p JOIN staff_organizations o ON o.id=p.organization_id
    WHERE p.status='ACTIVE' ORDER BY p.name LIMIT 50`)
    .all<{ id: string; organization_id: string; name: string; timezone: string; owner_email: string }>();

  let eligibleProperties = 0, ran = 0, skipped = 0;
  for (const property of properties.results) {
    const minutes = propertyLocalMinutes(property.timezone, now);
    if (minutes < WINDOW_START_MINUTES || minutes >= WINDOW_END_MINUTES) continue;
    if (!property.owner_email) continue;
    eligibleProperties += 1;
    const businessDate = propertyLocalDate(property.timezone, now);

    for (const [agentKey, prompt] of Object.entries(PROACTIVE_AGENT_PROMPTS)) {
      try {
        const already = await db.prepare(`SELECT s.id FROM digital_employee_command_sessions s
          WHERE s.organization_id=? AND s.property_id=? AND s.agent_key=?
            AND lower(s.created_by)=lower(?) AND substr(s.created_at,1,10)=? LIMIT 1`)
          .bind(property.organization_id, property.id, agentKey, property.owner_email, businessDate)
          .first();
        if (already) { skipped += 1; continue; }
        const result = await runDigitalEmployeeCommand(property.owner_email, { agentKey, prompt });
        if (result) ran += 1; else skipped += 1;
      } catch {
        skipped += 1;
      }
    }
  }
  return { eligibleProperties, ran, skipped, completedAt: now.toISOString() };
}
