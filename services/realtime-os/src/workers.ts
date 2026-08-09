import { Worker } from "bullmq";
import { appendAudit } from "./audit.js";
import { config } from "./config.js";
import { prisma, redis, type EscalationJob, type ReminderJob } from "./infrastructure.js";
import { publishEvent } from "./realtime.js";
import { sendRealTimeSms } from "./services/smsService.js";
import { checksum, redactForModel } from "./security.js";
import { smsIntakeWorker } from "./workers/smsIntakeWorker.js";
import { stateReconciliationWorker } from "./workers/stateReconciliationWorker.js";
import { propertyAutomationWorker } from "./workers/propertyAutomationWorker.js";
import { feedbackWorker } from "./workers/feedbackWorker.js";
import { settlementWorker } from "./workers/settlementWorker.js";
import { receiptDeliveryWorker } from "./workers/receiptDeliveryWorker.js";

export const reminderWorker = new Worker<ReminderJob>("aaiq-reminders", async (job) => {
  await publishEvent({
    type: "reminder.triggered", tenantId: job.data.tenantId, propertyId: job.data.propertyId,
    entityId: job.data.entityId, occurredAt: new Date().toISOString(),
    payload: { entityType: job.data.entityType },
  });
}, { connection: redis, concurrency: 25 });

export const escalationWorker = new Worker<EscalationJob>("aaiq-escalations", async (job) => {
  const { tenantId, propertyId, entityType, entityId, expectedStatus } = job.data;
  const entity = entityType === "TASK"
    ? await prisma.internalTask.findFirst({ where: { id: entityId, propertyId }, select: { status: true, title: true } })
    : await prisma.reminder.findFirst({ where: { id: entityId, propertyId }, select: { status: true, title: true } });
  if (!entity || entity.status !== expectedStatus) return;
  const supervisor = await prisma.user.findFirst({
    where: { tenantId, active: true, role: "MANAGEMENT", mobileNumber: { not: null } },
    select: { id: true, mobileNumber: true },
  });
  if (!supervisor?.mobileNumber || !config.TWILIO_PHONE_NUMBER) {
    throw new Error("Critical escalation requires an on-duty manager mobile number and configured Twilio credentials.");
  }
  const outboundBody = `AAI Q CRITICAL: ${entity.title} remains unacknowledged after 5 minutes. Open ${config.PUBLIC_BASE_URL} immediately.`;
  const message = await sendRealTimeSms({
    to: supervisor.mobileNumber, body: outboundBody,
    statusCallback: `${config.PUBLIC_BASE_URL}/api/v1/sms/status`,
  });
  if (!message.success) throw new Error(message.error);
  await prisma.smsMessage.create({
    data: {
      tenantId, propertyId, messageSid: message.messageId, direction: "OUTBOUND",
      fromPhoneHash: checksum(config.TWILIO_PHONE_NUMBER), toPhoneHash: checksum(supervisor.mobileNumber),
      redactedBody: redactForModel(outboundBody), bodyChecksum: checksum(outboundBody),
      status: "SENT", providerStatus: message.status,
    },
  });
  await prisma.$transaction(async (tx) => {
    if (entityType === "TASK") await tx.internalTask.update({ where: { id: entityId }, data: { status: "ESCALATED" } });
    else await tx.reminder.update({ where: { id: entityId }, data: { status: "ESCALATED" } });
    await appendAudit(tx, {
      tenantId, propertyId, authorType: "SYSTEM", authorId: "AAIQ-FAILOVER-ROUTER",
      eventType: "CRITICAL_ALERT_ESCALATED", entityType, entityId,
      correlationId: crypto.randomUUID(), modifiedTables: [entityType === "TASK" ? "internal_tasks" : "reminders", "system_audit_trail"],
      delta: { status: "ESCALATED", supervisorId: supervisor.id, providerMessageId: message.messageId },
    });
  });
  await publishEvent({ type: "alert.escalated", tenantId, propertyId, entityId, occurredAt: new Date().toISOString(), payload: { entityType, supervisorId: supervisor.id } });
}, { connection: redis, concurrency: 10 });

export async function closeWorkers() {
  await Promise.all([
    reminderWorker.close(), escalationWorker.close(),
    smsIntakeWorker.close(), stateReconciliationWorker.close(),
    propertyAutomationWorker.close(), feedbackWorker.close(), settlementWorker.close(),
    receiptDeliveryWorker.close(),
  ]);
}
