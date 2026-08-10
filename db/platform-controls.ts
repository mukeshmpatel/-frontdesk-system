import { env } from "cloudflare:workers";
import { activeStaffContext } from "./staff";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type AuditInput = {
  organizationId: string;
  propertyId?: string;
  eventType: string;
  entityType: string;
  entityId: string;
  authorType: "USER" | "SYSTEM";
  authorId: string;
  correlationId: string;
  before?: JsonValue;
  after?: JsonValue;
  delta: JsonValue;
  metadata?: JsonValue;
};

function database(): D1Database {
  if (!env.DB) throw new Error("AAI Q platform storage is not available.");
  return env.DB;
}

function stableJson(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function recordSystemAudit(input: AuditInput) {
  const occurredAt = new Date().toISOString();
  const payload = stableJson({
    organizationId: input.organizationId,
    propertyId: input.propertyId ?? input.organizationId,
    eventType: input.eventType,
    entityType: input.entityType,
    entityId: input.entityId,
    authorType: input.authorType,
    authorId: input.authorId,
    correlationId: input.correlationId,
    before: input.before ?? null,
    after: input.after ?? null,
    delta: input.delta,
    metadata: input.metadata ?? {},
    occurredAt,
  });
  const checksum = await sha256(payload);
  const id = crypto.randomUUID();
  await database().prepare(
    `INSERT INTO system_audit_trail
     (id, organization_id, property_id, event_type, entity_type, entity_id,
      author_type, author_id, correlation_id, before_json, after_json,
      delta_json, metadata_json, checksum, occurred_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, input.organizationId, input.propertyId ?? input.organizationId,
    input.eventType, input.entityType, input.entityId, input.authorType,
    input.authorId, input.correlationId,
    input.before === undefined ? null : stableJson(input.before),
    input.after === undefined ? null : stableJson(input.after),
    stableJson(input.delta), stableJson(input.metadata ?? {}), checksum, occurredAt,
  ).run();
  return { id, checksum, occurredAt };
}

export class AssetConflictError extends Error {
  readonly status = 409;
  constructor(
    readonly conflictingEventId: string,
    readonly assetId: string,
    readonly requestedRange: { startsAt: string; endsAt: string },
    readonly conflictingRange: { startsAt: string; endsAt: string },
    readonly traceId: string,
  ) {
    super(`Asset ${assetId} is already allocated during the requested time.`);
  }
}

export function intervalsOverlap(startA: string, endA: string, startB: string, endB: string) {
  return new Date(startA).getTime() < new Date(endB).getTime() &&
    new Date(endA).getTime() > new Date(startB).getTime();
}

export async function createAssetCalendarBlock(userEmail: string, input: {
  propertyId?: string;
  assetType: "ROOM" | "MEETING_SPACE" | "RESOURCE";
  assetId: string;
  blockType: "GROUP_EVENT" | "MAINTENANCE" | "ROOM_BLOCK";
  title: string;
  startsAt: string;
  endsAt: string;
}) {
  const context = await activeStaffContext(userEmail);
  if (!context || context.role !== "admin") return null;
  const starts = new Date(input.startsAt);
  const ends = new Date(input.endsAt);
  if (!input.assetId.trim() || !input.title.trim() || Number.isNaN(starts.getTime()) ||
      Number.isNaN(ends.getTime()) || ends <= starts) {
    throw new Error("A valid asset, title, start, and end time are required.");
  }
  const traceId = crypto.randomUUID();
  const propertyId = input.propertyId?.trim() || context.organizationId;
  const conflict = await database().prepare(
    `SELECT id, starts_at, ends_at FROM asset_calendar_blocks
     WHERE organization_id = ? AND property_id = ? AND asset_type = ?
       AND asset_id = ? AND status = 'active'
       AND starts_at < ? AND ends_at > ?
     ORDER BY starts_at LIMIT 1`,
  ).bind(context.organizationId, propertyId, input.assetType, input.assetId.trim(), ends.toISOString(), starts.toISOString())
    .first<{ id: string; starts_at: string; ends_at: string }>();
  if (conflict) {
    throw new AssetConflictError(conflict.id, input.assetId.trim(),
      { startsAt: starts.toISOString(), endsAt: ends.toISOString() },
      { startsAt: conflict.starts_at, endsAt: conflict.ends_at }, traceId);
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await database().prepare(
    `INSERT INTO asset_calendar_blocks
     (id, organization_id, property_id, asset_type, asset_id, block_type, title,
      starts_at, ends_at, status, created_by_email, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
  ).bind(id, context.organizationId, propertyId, input.assetType, input.assetId.trim().slice(0, 100),
    input.blockType, input.title.trim().slice(0, 180), starts.toISOString(), ends.toISOString(),
    context.email, now, now).run();
  await recordSystemAudit({
    organizationId: context.organizationId, propertyId, eventType: "CALENDAR_BLOCK_CREATED",
    entityType: "ASSET_CALENDAR_BLOCK", entityId: id, authorType: "USER",
    authorId: context.email, correlationId: traceId, delta: { operation: "CREATE" },
    after: { assetType: input.assetType, assetId: input.assetId, blockType: input.blockType,
      startsAt: starts.toISOString(), endsAt: ends.toISOString() },
  });
  return { id, traceId };
}

export async function listAssetCalendarBlocks(userEmail: string, from: string, to: string) {
  const context = await activeStaffContext(userEmail);
  if (!context) return null;
  const result = await database().prepare(
    `SELECT id, property_id, asset_type, asset_id, block_type, title, starts_at,
            ends_at, status, created_by_email
     FROM asset_calendar_blocks
     WHERE organization_id = ? AND starts_at < ? AND ends_at > ?
     ORDER BY starts_at LIMIT 500`,
  ).bind(context.organizationId, to, from).all();
  return result.results;
}

export async function runEscalationMatrix() {
  const cutoff = new Date(Date.now() - 5 * 60_000).toISOString();
  const now = new Date().toISOString();
  const tasks = await database().prepare(
    `SELECT f.id, f.organization_id, f.title, f.item_type, f.room_reference
     FROM front_desk_items f
     LEFT JOIN notification_escalations e ON e.source_id = f.id
     WHERE f.priority = 'urgent' AND f.status IN ('open','in_progress')
       AND f.created_at <= ? AND e.id IS NULL LIMIT 100`,
  ).bind(cutoff).all<{ id: string; organization_id: string; title: string; item_type: string; room_reference: string }>();
  let escalated = 0;
  for (const task of tasks.results) {
    const manager = await database().prepare(
      `SELECT m.user_email, p.phone FROM staff_members m
       LEFT JOIN employee_profiles p ON p.organization_id=m.organization_id
        AND lower(p.user_email)=lower(m.user_email)
       WHERE m.organization_id=? AND m.status='active'
         AND (m.role='admin' OR lower(coalesce(p.job_title,'')) LIKE '%manager%')
       ORDER BY CASE WHEN m.role='admin' THEN 0 ELSE 1 END LIMIT 1`,
    ).bind(task.organization_id).first<{ user_email: string; phone: string | null }>();
    if (!manager) continue;
    const escalationId = crypto.randomUUID();
    const outboxId = crypto.randomUUID();
    const recipient = manager.phone?.trim() || manager.user_email;
    const route = manager.phone?.trim() ? "SMS" : "IN_APP";
    await database().batch([
      database().prepare(
        `INSERT INTO notification_escalations
         (id, organization_id, source_type, source_id, status, urgency_score,
          acknowledged_at, escalated_at, manager_recipient, created_at, updated_at)
         VALUES (?, ?, 'FRONT_DESK_TASK', ?, 'ESCALATED', 100, NULL, ?, ?, ?, ?)`,
      ).bind(escalationId, task.organization_id, task.id, now, recipient, now, now),
      database().prepare(
        `INSERT INTO notification_outbox
         (id, organization_id, escalation_id, route, priority, recipient, subject,
          body, status, attempts, provider_message_id, last_error, available_at,
          created_at, updated_at)
         VALUES (?, ?, ?, ?, 'CRITICAL', ?, ?, ?, 'PENDING', 0, NULL, NULL, ?, ?, ?)`,
      ).bind(outboxId, task.organization_id, escalationId, route, recipient,
        `Escalated: ${task.title}`, `Unacknowledged ${task.item_type} task${task.room_reference ? ` for room ${task.room_reference}` : ""}. Immediate review required.`,
        now, now, now),
      database().prepare(
        `INSERT INTO staff_notifications
         (id, organization_id, event_id, recipient_email, sender_email, title,
          message, status, created_at, read_at)
         VALUES (?, ?, NULL, ?, 'AAIQ-AUTOMATION', ?, ?, 'unread', ?, NULL)`,
      ).bind(crypto.randomUUID(), task.organization_id, manager.user_email,
        `Critical task escalated`, `${task.title} has been unacknowledged for more than 5 minutes.`, now),
    ]);
    await recordSystemAudit({
      organizationId: task.organization_id, eventType: "CRITICAL_TASK_ESCALATED",
      entityType: "FRONT_DESK_TASK", entityId: task.id, authorType: "SYSTEM",
      authorId: "AAIQ-ESCALATION-MATRIX", correlationId: escalationId,
      delta: { status: "ESCALATED", urgencyScore: 100, route },
      metadata: { outboxId },
    });
    escalated += 1;
  }
  return { examined: tasks.results.length, escalated, completedAt: now };
}
