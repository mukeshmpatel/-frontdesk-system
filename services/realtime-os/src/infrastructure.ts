import { PrismaClient } from "@prisma/client";
import { Redis } from "ioredis";
import { Queue } from "bullmq";
import { config } from "./config.js";

export const prisma = new PrismaClient({ log: config.NODE_ENV === "production" ? ["error"] : ["warn", "error"] });
export const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: true });
export const redisPublisher = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
export const redisSubscriber = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });

export type ReminderJob = { tenantId: string; propertyId: string; entityType: "REMINDER" | "TASK"; entityId: string };
export type EscalationJob = ReminderJob & { expectedStatus: "DISPATCHED" | "PENDING" };
export type SmsMedia = { url: string; contentType: string };
export type SmsIntakeJob = {
  intakeTokenId: string;
  correlationId: string;
  tenantId: string;
  propertyId: string;
  defaultSubmitterUserId: string;
  messageSid: string;
  fromPhoneHash: string;
  redactedBody: string;
  receivedAt: string;
  media: SmsMedia[];
};
export type PropertyAutomationJob = {
  kind: "SLA_SCAN" | "CHECKOUT_SCAN" | "LATE_CHECKOUT_SCAN" | "PROCUREMENT_SCAN" | "TURNOVER_SCAN";
};
export type FeedbackJob = { tokenId?: string; scan?: true };
export type SettlementJob = { folioAuditId?: string; scan?: true };
export type ReceiptDeliveryJob = { deliveryId?: string; scan?: true };

export const reminderQueue = new Queue<ReminderJob>("aaiq-reminders", { connection: redis });
export const escalationQueue = new Queue<EscalationJob>("aaiq-escalations", { connection: redis });
export const smsIntakeQueue = new Queue<SmsIntakeJob>("sms-intake-queue", { connection: redis });
export const stateReconciliationQueue = new Queue("aaiq-state-reconciliation", { connection: redis });
export const propertyAutomationQueue = new Queue<PropertyAutomationJob>("aaiq-property-automation", { connection: redis });
export const feedbackQueue = new Queue<FeedbackJob>("aaiq-guest-feedback", { connection: redis });
export const settlementQueue = new Queue<SettlementJob>("aaiq-franchise-settlements", { connection: redis });
export const receiptDeliveryQueue = new Queue<ReceiptDeliveryJob>("aaiq-folio-receipts", { connection: redis });

export async function closeInfrastructure() {
  await Promise.all([
    reminderQueue.close(), escalationQueue.close(), smsIntakeQueue.close(),
    stateReconciliationQueue.close(), propertyAutomationQueue.close(), feedbackQueue.close(),
    settlementQueue.close(),
    receiptDeliveryQueue.close(),
    redis.quit(), redisPublisher.quit(),
    redisSubscriber.quit(), prisma.$disconnect(),
  ]);
}
