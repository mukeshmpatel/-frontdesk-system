import { Prisma, WorkStatus } from "@prisma/client";
import type { AuthUser, IntakeRequest } from "./contracts.js";
import { extractIntent } from "./llm.js";
import { escalationQueue, prisma, reminderQueue } from "./infrastructure.js";
import { appendAudit } from "./audit.js";
import { checksum, redactForModel } from "./security.js";
import { publishEvent, type RealtimeEvent } from "./realtime.js";

function redactedRequest(request: IntakeRequest): Prisma.InputJsonValue {
  return JSON.parse(redactForModel(JSON.stringify(request))) as Prisma.InputJsonValue;
}

export async function processIntake(
  user: AuthUser,
  request: IntakeRequest,
  options: { correlationId?: string; inlineImages?: string[] } = {},
) {
  const property = await prisma.property.findFirst({
    where: { id: request.propertyId, tenantId: user.tenantId },
    select: { id: true, timezone: true },
  });
  if (!property) throw Object.assign(new Error("Property not found."), { statusCode: 404 });
  const extracted = await extractIntent(request, property.timezone, options.inlineImages);
  const room = extracted.extractedMetadata.associatedRoomId
    ? await prisma.room.findFirst({
      where: { propertyId: property.id, number: extracted.extractedMetadata.associatedRoomId },
      select: { id: true, number: true },
    }) : null;
  const correlationId = options.correlationId ?? crypto.randomUUID();
  const rawChecksum = checksum(JSON.stringify(request));
  const targetTime = new Date(extracted.extractedMetadata.targetTime);
  const result = await prisma.$transaction(async (tx) => {
    const intake = await tx.communicationIntake.create({
      data: {
        tenantId: user.tenantId, propertyId: property.id, correlationId, submittedByUserId: user.sub,
        sourceType: request.media_urls?.length ? "MEDIA" : request.audio_url ? "AUDIO" : request.chat_history_chunk?.length ? "CHAT_HISTORY" : "TEXT",
        redactedInput: redactedRequest(request), rawInputChecksum: rawChecksum,
        intent: extracted.intent, title: extracted.extractedMetadata.title,
        description: extracted.extractedMetadata.description, targetTime,
        assignedToRole: extracted.extractedMetadata.assignedToRole,
        associatedRoomId: room?.id ?? null, urgency: extracted.extractedMetadata.urgency,
        confidence: extracted.confidence, model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
      },
    });
    let entity: { id: string; type: "REMINDER" | "CALENDAR_BLOCK" | "TASK"; table: string } | null = null;
    if (extracted.intent === "CREATE_REMINDER") {
      const reminder = await tx.reminder.create({ data: {
        propertyId: property.id, intakeId: intake.id, title: intake.title,
        description: intake.description, targetTime, urgency: intake.urgency,
      } });
      entity = { id: reminder.id, type: "REMINDER", table: "reminders" };
    } else if (extracted.intent === "SCHEDULE_CALENDAR_BLOCK") {
      const endsAt = new Date(targetTime.getTime() + 2 * 3_600_000);
      if (room) {
        const conflict = await tx.calendarBlock.findFirst({
          where: { propertyId: property.id, roomId: room.id, status: { not: WorkStatus.CANCELLED }, startsAt: { lt: endsAt }, endsAt: { gt: targetTime } },
          select: { id: true },
        });
        if (conflict) throw Object.assign(new Error(`Room ${room.number} conflicts with calendar block ${conflict.id}.`), { statusCode: 409, conflictingEventId: conflict.id });
      }
      const block = await tx.calendarBlock.create({ data: {
        propertyId: property.id, roomId: room?.id ?? null, intakeId: intake.id,
        title: intake.title, description: intake.description, startsAt: targetTime,
        endsAt, urgency: intake.urgency,
      } });
      entity = { id: block.id, type: "CALENDAR_BLOCK", table: "calendar_blocks" };
    } else if (extracted.intent === "DISPATCH_TASK") {
      const task = await tx.internalTask.create({ data: {
        propertyId: property.id, correlationId, roomId: room?.id ?? null, intakeId: intake.id,
        title: intake.title, description: intake.description,
        assignedRole: intake.assignedToRole, urgency: intake.urgency,
        dueAt: targetTime, status: WorkStatus.DISPATCHED,
      } });
      entity = { id: task.id, type: "TASK", table: "internal_tasks" };
    }
    if (entity) await tx.communicationIntake.update({
      where: { id: intake.id },
      data: { executedEntityType: entity.type, executedEntityId: entity.id },
    });
    await appendAudit(tx, {
      tenantId: user.tenantId, propertyId: property.id, authorType: "SYSTEM",
      authorId: "AAIQ-LLM-INTAKE", eventType: "AUTONOMOUS_INTAKE_EXECUTED",
      entityType: entity?.type ?? "INTAKE", entityId: entity?.id ?? intake.id,
      correlationId, redactedRawInput: redactedRequest(request), rawInputChecksum: rawChecksum,
      llmConfidence: extracted.confidence,
      modifiedTables: ["communication_intakes", ...(entity ? [entity.table] : []), "system_audit_trail"],
      delta: { intent: extracted.intent, roomId: room?.id ?? null, urgency: intake.urgency },
    });
    return { intake, entity };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 15_000 });

  if (result.entity) {
    const eventType: RealtimeEvent["type"] = result.entity.type === "TASK" ? "task.created" : result.entity.type === "REMINDER" ? "reminder.created" : "calendar.updated";
    await publishEvent({ type: eventType, tenantId: user.tenantId, propertyId: property.id, entityId: result.entity.id, occurredAt: new Date().toISOString(), payload: extracted.extractedMetadata });
    const delay = Math.max(0, targetTime.getTime() - Date.now());
    if (result.entity.type === "REMINDER" || result.entity.type === "TASK") {
      await reminderQueue.add("trigger", { tenantId: user.tenantId, propertyId: property.id, entityType: result.entity.type, entityId: result.entity.id }, {
        jobId: `trigger:${result.entity.type}:${result.entity.id}`, delay, attempts: 5,
        backoff: { type: "exponential", delay: 2_000 }, removeOnComplete: 1_000, removeOnFail: 5_000,
      });
    }
    if (extracted.extractedMetadata.urgency === "CRITICAL") {
      await escalationQueue.add("ack-timeout", { tenantId: user.tenantId, propertyId: property.id, entityType: result.entity.type === "TASK" ? "TASK" : "REMINDER", entityId: result.entity.id, expectedStatus: result.entity.type === "TASK" ? "DISPATCHED" : "PENDING" }, {
        jobId: `escalate:${result.entity.id}`, delay: 5 * 60_000, attempts: 5,
        backoff: { type: "exponential", delay: 5_000 }, removeOnComplete: 1_000, removeOnFail: 5_000,
      });
    }
  }
  return { correlationId, intakeId: result.intake.id, intent: extracted.intent, extractedMetadata: extracted.extractedMetadata, confidence: extracted.confidence, execution: result.entity };
}
