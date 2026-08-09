import { env } from "cloudflare:workers";
import { createReminder } from "../../db/reminders";
import { createFrontDeskItem } from "../../db/operations";
import { activeStaffContext } from "../../db/staff";
import { createAssetCalendarBlock, recordSystemAudit, sha256 } from "../../db/platform-controls";
import { parseReminderText } from "./reminder-parser";

export type IntakeIntent = "CREATE_REMINDER" | "SCHEDULE_CALENDAR_BLOCK" | "DISPATCH_TASK" | "UNKNOWN";
export type AssignedRole = "MAINTENANCE" | "HOUSEKEEPING" | "FRONT_DESK" | "MANAGEMENT";
export type Urgency = "LOW" | "MEDIUM" | "CRITICAL";
export type IntakeInput = {
  text?: string;
  chatHistoryChunk?: Array<{ author: string; text: string; timestamp?: string }>;
  audioUrl?: string;
  mediaUrls?: string[];
};
export type ExtractedIntake = {
  intent: IntakeIntent;
  extractedMetadata: {
    title: string;
    description: string;
    targetTime: string;
    assignedToRole: AssignedRole;
    associatedRoomId: string | null;
    urgency: Urgency;
  };
  confidence: number;
};

function database(): D1Database {
  if (!env.DB) throw new Error("AAI Q intake storage is not available.");
  return env.DB;
}

export function redactSensitiveInput(value: string) {
  return value
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, "[PAYMENT_DATA_REDACTED]")
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[GOVERNMENT_ID_REDACTED]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL_REDACTED]")
    .replace(/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, "[PHONE_REDACTED]");
}

function validRemoteUrl(value: string) {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

export function extractIntake(input: IntakeInput, now = new Date()): ExtractedIntake {
  const history = input.chatHistoryChunk?.map((item) => `${item.author}: ${item.text}`).join("\n") ?? "";
  const media = [...(input.mediaUrls ?? []), ...(input.audioUrl ? [input.audioUrl] : [])].filter(validRemoteUrl);
  const source = redactSensitiveInput([input.text ?? "", history, media.join(" ")].filter(Boolean).join("\n")).slice(0, 12_000);
  const lower = source.toLowerCase();
  const room = source.match(/\broom\s*#?\s*(\d{3,4})\b/i)?.[1] ?? media.join(" ").match(/(?:room[-_ ]?)(\d{3,4})/i)?.[1] ?? null;
  const urgency: Urgency = /\b(emergency|critical|flood|fire|smoke|gas|no heat|broken lock|guest trapped)\b/i.test(source)
    ? "CRITICAL" : /\b(urgent|broken|leak|not working|dirty|messy|repair)\b/i.test(source) ? "MEDIUM" : "LOW";
  const role: AssignedRole = /\b(ac|air condition|broken|repair|leak|maintenance|thermostat|electrical|plumb)\b/i.test(source)
    ? "MAINTENANCE" : /\b(dirty|messy|clean|linen|towel|pillow|housekeep)\b/i.test(source)
      ? "HOUSEKEEPING" : /\b(manager|complaint|refund|incident)\b/i.test(source) ? "MANAGEMENT" : "FRONT_DESK";
  const reminder = parseReminderText(source, { baseDate: now, note: source });
  const taskSignal = role !== "FRONT_DESK" || /\b(request|deliver|dispatch|fix|inspect|clean|replace)\b/i.test(source);
  const blockSignal = /\b(block|out of order|ooo|maintenance window|do not rent)\b/i.test(source) && Boolean(room);
  const intent: IntakeIntent = blockSignal ? "SCHEDULE_CALENDAR_BLOCK" : taskSignal ? "DISPATCH_TASK" : reminder ? "CREATE_REMINDER" : "UNKNOWN";
  const targetTime = reminder?.scheduledAt ?? new Date(now.getTime() + (urgency === "CRITICAL" ? 5 : 30) * 60_000).toISOString();
  const titleBase = input.text?.trim() || history.split("\n").at(-1) || (media.length ? `${role.toLowerCase()} media review` : "Unclassified communication");
  return {
    intent,
    extractedMetadata: {
      title: redactSensitiveInput(titleBase).replace(/\s+/g, " ").slice(0, 160),
      description: source.slice(0, 2000),
      targetTime,
      assignedToRole: role,
      associatedRoomId: room,
      urgency,
    },
    confidence: reminder?.confidence ?? (room && taskSignal ? 91 : taskSignal ? 82 : 45),
  };
}

export async function processAutonomousIntake(userEmail: string, input: IntakeInput) {
  const context = await activeStaffContext(userEmail);
  if (!context) return null;
  const extracted = extractIntake(input);
  const raw = JSON.stringify(input);
  const redacted = redactSensitiveInput(raw).slice(0, 12_000);
  const executionId = crypto.randomUUID();
  let entityType: string | null = null;
  let entityId: string | null = null;
  const metadata = extracted.extractedMetadata;

  if (extracted.intent === "CREATE_REMINDER") {
    entityType = "REMINDER";
    entityId = await createReminder({
      userEmail: context.email, title: metadata.title, scheduledAt: metadata.targetTime,
      note: metadata.description, sourceType: "autonomous-intake",
      sourceLabel: "AAI Q automatic extraction", confidence: extracted.confidence,
    });
  } else if (extracted.intent === "DISPATCH_TASK") {
    entityType = "FRONT_DESK_TASK";
    const task = await createFrontDeskItem(context.email, {
      itemType: metadata.assignedToRole === "MAINTENANCE" ? "maintenance" : metadata.assignedToRole === "HOUSEKEEPING" ? "housekeeping" : "guest_request",
      title: metadata.title, details: metadata.description, roomReference: metadata.associatedRoomId ?? "",
      priority: metadata.urgency === "CRITICAL" ? "urgent" : metadata.urgency === "MEDIUM" ? "high" : "normal",
      dueAt: metadata.targetTime,
    });
    entityId = task?.id ?? null;
  } else if (extracted.intent === "SCHEDULE_CALENDAR_BLOCK") {
    entityType = "ASSET_CALENDAR_BLOCK";
    const start = new Date(metadata.targetTime);
    const block = await createAssetCalendarBlock(context.email, {
      assetType: "ROOM", assetId: metadata.associatedRoomId ?? "", blockType: "MAINTENANCE",
      title: metadata.title, startsAt: start.toISOString(), endsAt: new Date(start.getTime() + 2 * 3_600_000).toISOString(),
    });
    entityId = block?.id ?? null;
  }

  const now = new Date().toISOString();
  const rawChecksum = await sha256(raw);
  await database().batch([
    database().prepare(
      `INSERT INTO autonomous_intake_executions
       (id, organization_id, user_email, input_type, redacted_input, raw_input_checksum,
        intent, extracted_metadata_json, confidence, status, executed_entity_type,
        executed_entity_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(executionId, context.organizationId, context.email,
      input.mediaUrls?.length ? "MEDIA" : input.audioUrl ? "AUDIO" : input.chatHistoryChunk?.length ? "CHAT_HISTORY" : "TEXT",
      redacted, rawChecksum, extracted.intent, JSON.stringify(metadata), extracted.confidence,
      entityId ? "EXECUTED" : "REVIEW_REQUIRED", entityType, entityId, now),
    database().prepare(
      `INSERT INTO realtime_events
       (id, organization_id, event_type, entity_type, entity_id, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(crypto.randomUUID(), context.organizationId,
      entityType === "REMINDER" ? "reminder.created" : entityType === "ASSET_CALENDAR_BLOCK" ? "calendar.updated" : entityType ? "task.created" : "intake.review_required",
      entityType ?? "INTAKE", entityId ?? executionId,
      JSON.stringify({ executionId, intent: extracted.intent, metadata }), now),
  ]);
  await recordSystemAudit({
    organizationId: context.organizationId, eventType: "AUTONOMOUS_INTAKE_PROCESSED",
    entityType: entityType ?? "INTAKE", entityId: entityId ?? executionId,
    authorType: "SYSTEM", authorId: "AAIQ-INTAKE-ENGINE", correlationId: executionId,
    delta: { intent: extracted.intent, confidence: extracted.confidence, status: entityId ? "EXECUTED" : "REVIEW_REQUIRED" },
    metadata: { rawInputChecksum: rawChecksum, piiRedactionApplied: true },
  });
  return { executionId, ...extracted, execution: { entityType, entityId, status: entityId ? "EXECUTED" : "REVIEW_REQUIRED" } };
}
