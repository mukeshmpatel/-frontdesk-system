import { Department, Prisma, RoleTier, StaffWorkState } from "@prisma/client";
import { Worker } from "bullmq";
import { appendAudit } from "../audit.js";
import { config } from "../config.js";
import { prisma, redis, type PropertyAutomationJob } from "../infrastructure.js";
import { publishEvent } from "../realtime.js";
import { checksum, redactForModel } from "../security.js";
import { automateRoomTurn } from "../services/roomTurnAutomationService.js";
import { selectNextWorker } from "../services/staffRoutingService.js";
import { sendRealTimeSms } from "../services/smsService.js";
import { taskSlaMinutes } from "../services/automationPolicy.js";
import { ProcurementService } from "../services/procurementService.js";
import { TurnoverOptimizerService } from "../services/turnoverOptimizerService.js";
import { LateCheckoutReminderService } from "../services/lateCheckoutReminderService.js";

async function notifyManager(result: {
  tenantId: string; propertyId: string; taskId: string; correlationId: string;
  title: string; roomNumber: string | null; previousStaffId: string | null; newStaffId: string | null;
}) {
  const manager = await prisma.user.findFirst({
    where: {
      tenantId: result.tenantId, active: true, isAvailable: true,
      department: Department.EXECUTIVE,
      tier: { in: [RoleTier.MANAGER, RoleTier.CORPORATE] },
      mobileNumber: { not: null },
      OR: [
        { jobTitle: { contains: "Assistant General Manager", mode: "insensitive" } },
        { jobTitle: { equals: "AGM", mode: "insensitive" } },
      ],
    },
    select: { id: true, mobileNumber: true },
  }) ?? await prisma.user.findFirst({
    where: {
      tenantId: result.tenantId, active: true, isAvailable: true,
      department: Department.EXECUTIVE,
      tier: { in: [RoleTier.MANAGER, RoleTier.CORPORATE] },
      mobileNumber: { not: null },
    },
    select: { id: true, mobileNumber: true },
  });
  if (!manager?.mobileNumber || !config.TWILIO_PHONE_NUMBER) return;
  const body = [
    "AAI Q SLA RECOVERY",
    result.roomNumber ? `Room ${result.roomNumber}` : "Property task",
    result.title,
    `Previous: ${result.previousStaffId ?? "unassigned"}`,
    `New: ${result.newStaffId ?? "no available replacement"}`,
    `Trace: ${result.correlationId}`,
  ].join(" | ");
  const sent = await sendRealTimeSms({
    to: manager.mobileNumber, body,
    statusCallback: `${config.PUBLIC_BASE_URL}/api/v1/sms/status`,
  });
  if (!sent.success) return;
  await prisma.$transaction(async (tx) => {
    await tx.smsMessage.create({
      data: {
        tenantId: result.tenantId, propertyId: result.propertyId,
        messageSid: sent.messageId, direction: "OUTBOUND",
        fromPhoneHash: checksum(config.TWILIO_PHONE_NUMBER!),
        toPhoneHash: checksum(manager.mobileNumber!),
        redactedBody: redactForModel(body), bodyChecksum: checksum(body),
        status: "SENT", providerStatus: sent.status,
      },
    });
    await appendAudit(tx, {
      tenantId: result.tenantId, propertyId: result.propertyId,
      authorType: "SYSTEM", authorId: "AAIQ-SLA-RECOVERY",
      eventType: "SLA_RECOVERY_MANAGER_NOTIFIED", entityType: "TASK",
      entityId: result.taskId, correlationId: result.correlationId,
      modifiedTables: ["sms_messages", "system_audit_trail"],
      delta: { managerId: manager.id, providerMessageId: sent.messageId },
    });
  });
}

async function healTask(taskId: string, now: Date) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sla:${taskId}`}))`;
    const task = await tx.internalTask.findUnique({
      where: { id: taskId },
      include: {
        room: { select: { id: true, number: true } },
        property: { select: { tenantId: true } },
      },
    });
    if (!task || !["PENDING", "DISPATCHED", "ACKNOWLEDGED"].includes(task.status)) return null;
    const sla = taskSlaMinutes(task);
    if (task.lastActivityAt > new Date(now.getTime() - sla * 60_000)) return null;
    const previousStaffId = task.assignedUserId;
    if (previousStaffId) {
      await tx.user.update({
        where: { id: previousStaffId },
        data: { isAvailable: false, workState: StaffWorkState.STALLED },
      });
    }
    const department = task.assignedRole === "HOUSEKEEPING" ? Department.HOUSEKEEPING
      : task.assignedRole === "MAINTENANCE" ? Department.MAINTENANCE
        : task.assignedRole === "FRONT_DESK" ? Department.FRONT_DESK : Department.EXECUTIVE;
    const replacement = await selectNextWorker(tx, {
      tenantId: task.property.tenantId, department,
      roomId: task.roomId, excludeStaffId: previousStaffId,
    });
    const attemptNumber = task.rerouteCount + 1;
    await tx.internalTask.update({
      where: { id: task.id },
      data: {
        assignedUserId: replacement?.id ?? null,
        status: replacement ? "DISPATCHED" : "ESCALATED",
        assignedAt: now, lastActivityAt: now,
        rerouteCount: { increment: 1 },
      },
    });
    await tx.taskEscalationLog.create({
      data: {
        taskId: task.id, propertyId: task.propertyId,
        correlationId: task.correlationId, previousStaffId,
        newStaffId: replacement?.id ?? null, attemptNumber,
        slaMinutes: sla,
        reason: `SLA breach after ${sla} minutes without activity`,
        breachedAt: now, reroutedAt: replacement ? now : null,
      },
    });
    await appendAudit(tx, {
      tenantId: task.property.tenantId, propertyId: task.propertyId,
      authorType: "SYSTEM", authorId: "AAIQ-SLA-RECOVERY",
      eventType: "TASK_AUTONOMOUSLY_REROUTED", entityType: "TASK",
      entityId: task.id, correlationId: task.correlationId,
      modifiedTables: ["users", "internal_tasks", "task_escalation_logs", "system_audit_trail"],
      delta: {
        previousStaffId, newStaffId: replacement?.id ?? null,
        attemptNumber, slaMinutes: sla,
        workerState: previousStaffId ? StaffWorkState.STALLED : null,
      },
    });
    return {
      tenantId: task.property.tenantId, propertyId: task.propertyId,
      taskId: task.id, correlationId: task.correlationId, title: task.title,
      roomNumber: task.room?.number ?? null, previousStaffId,
      newStaffId: replacement?.id ?? null,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function runSlaScan() {
  const now = new Date();
  const candidates = await prisma.internalTask.findMany({
    where: {
      status: { in: ["PENDING", "DISPATCHED", "ACKNOWLEDGED"] },
      lastActivityAt: { lt: new Date(now.getTime() - 10 * 60_000) },
    },
    select: { id: true },
    take: 250,
    orderBy: { lastActivityAt: "asc" },
  });
  for (const candidate of candidates) {
    const healed = await healTask(candidate.id, now);
    if (!healed) continue;
    await publishEvent({
      type: "task.updated", tenantId: healed.tenantId,
      propertyId: healed.propertyId, entityId: healed.taskId,
      occurredAt: new Date().toISOString(),
      payload: { assignedUserId: healed.newStaffId, reason: "SLA_BREACH_AUTO_RECOVERY" },
    });
    await notifyManager(healed);
  }
  return { scanned: candidates.length };
}

async function runCheckoutScan() {
  const now = new Date();
  const bookings = await prisma.booking.findMany({
    where: { status: "CHECKED_OUT", checkOutAt: { lte: now }, roomId: { not: null }, room: { status: "OCCUPIED" } },
    select: {
      id: true, propertyId: true, checkOutAt: true,
      room: { select: { number: true } },
    },
    take: 250,
    orderBy: { checkOutAt: "asc" },
  });
  for (const booking of bookings) {
    if (!booking.room) continue;
    await automateRoomTurn({
      propertyId: booking.propertyId,
      providerEventId: `checkout:${booking.id}:${booking.checkOutAt.toISOString()}`,
      roomNumber: booking.room.number,
      eventType: "CHECKOUT_TIME_PASSED",
      occurredAt: now,
    });
  }
  return { scanned: bookings.length };
}

export const propertyAutomationWorker = new Worker<PropertyAutomationJob>(
  "aaiq-property-automation",
  (job) => {
    if (job.data.kind === "SLA_SCAN") return runSlaScan();
    if (job.data.kind === "CHECKOUT_SCAN") return runCheckoutScan();
    if (job.data.kind === "LATE_CHECKOUT_SCAN") return LateCheckoutReminderService.monitorLateCheckoutsEngine();
    if (job.data.kind === "PROCUREMENT_SCAN") return ProcurementService.scanLowStock();
    return TurnoverOptimizerService.optimizeHousekeepingQueue();
  },
  { connection: redis, concurrency: 1, lockDuration: 120_000, maxStalledCount: 2 },
);
