import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { Department, Prisma, RoleTier } from "@prisma/client";
import { z } from "zod";
import { appendAudit } from "../audit.js";
import { config } from "../config.js";
import { prisma } from "../infrastructure.js";
import { publishEvent } from "../realtime.js";
import { checksum, redactForModel } from "../security.js";
import { decryptPersonalData, encryptPersonalData } from "./personalDataCrypto.js";
import { sendRealTimeSms } from "./smsService.js";

const resultSchema = z.object({
  sentiment: z.enum(["POSITIVE", "NEUTRAL", "NEGATIVE", "ANGRY"]),
  sentimentScore: z.number().min(-1).max(1),
  angerScore: z.number().min(0).max(1),
  urgencyScore: z.number().min(0).max(1),
  confidenceScore: z.number().min(0).max(1),
  contextSummary: z.string().min(1).max(900),
  apologyText: z.string().max(500),
});

const client = new OpenAI({ apiKey: config.OPENAI_API_KEY, timeout: 30_000, maxRetries: 2 });

export type SentimentResult = z.infer<typeof resultSchema>;

export async function analyzeGuestFeedback(text: string, rating?: number): Promise<SentimentResult> {
  const safeText = redactForModel(text).slice(0, 8_000);
  const response = await client.responses.parse({
    model: config.OPENAI_MODEL,
    input: [{
      role: "system",
      content: [{
        type: "input_text",
        text: [
          "Classify hotel guest feedback using the required schema.",
          "ANGRY means hostility, severe dissatisfaction, safety concerns, discrimination claims, threats, or intent to escalate.",
          "NEGATIVE means material dissatisfaction that needs service recovery.",
          "Never invent facts, compensation, refunds, admissions of liability, or promises.",
          "For NEGATIVE or ANGRY feedback, write a concise empathetic SMS apology that acknowledges the concern, says management has been alerted, and invites direct contact.",
          "Do not ask the guest to withhold or change a public review.",
          "For POSITIVE or NEUTRAL feedback, apologyText must be an empty string.",
        ].join("\n"),
      }],
    }, {
      role: "user",
      content: [{
        type: "input_text",
        text: `Rating: ${rating ?? "not supplied"}\nFeedback:\n${safeText}`,
      }],
    }],
    text: { format: zodTextFormat(resultSchema, "guest_sentiment") },
  });
  if (!response.output_parsed) throw new Error("Sentiment model returned no structured result.");
  return response.output_parsed;
}

type FeedbackPayload = {
  bookingId: string;
  textInput: string;
  rating?: number;
  channel: string;
};

export class SentimentAnalysisService {
  static async evaluateGuestSentiment(tokenId: string): Promise<{ feedbackId: string; sentiment: string }> {
    const token = await prisma.feedbackIntakeToken.findUnique({
      where: { id: tokenId },
      include: {
        booking: {
          include: { room: true, guestProfile: true, property: true },
        },
      },
    });
    if (!token) throw new Error("Feedback intake token was not found.");
    if (token.status === "COMPLETED") {
      const existing = await prisma.guestFeedbackLog.findFirst({
        where: { correlationId: token.correlationId },
        select: { id: true, sentimentResult: true },
      });
      if (!existing) throw new Error("Completed feedback token has no feedback record.");
      return { feedbackId: existing.id, sentiment: existing.sentimentResult };
    }
    await prisma.feedbackIntakeToken.update({
      where: { id: token.id },
      data: { status: "PROCESSING", attempts: { increment: 1 }, errorCode: null },
    });
    const payload = JSON.parse(decryptPersonalData(token.encryptedPayload)) as FeedbackPayload;
    if (payload.bookingId !== token.bookingId) throw new Error("Feedback token booking scope mismatch.");
    const analysis = await analyzeGuestFeedback(payload.textInput, payload.rating);
    const needsRecovery = analysis.sentiment === "NEGATIVE" || analysis.sentiment === "ANGRY";
    const manager = needsRecovery ? await prisma.user.findFirst({
      where: {
        tenantId: token.tenantId,
        active: true,
        department: Department.EXECUTIVE,
        tier: { in: [RoleTier.MANAGER, RoleTier.CORPORATE] },
        mobileNumber: { not: null },
        OR: [
          { jobTitle: { equals: "GM", mode: "insensitive" } },
          { jobTitle: { contains: "General Manager", mode: "insensitive" } },
        ],
      },
      orderBy: [{ isAvailable: "desc" }, { tier: "desc" }],
      select: { id: true, mobileNumber: true },
    }) : null;
    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      const task = needsRecovery ? await tx.internalTask.create({
        data: {
          propertyId: token.propertyId,
          correlationId: token.correlationId,
          roomId: token.booking.roomId,
          title: "Immediate guest service recovery",
          description: analysis.contextSummary,
          assignedRole: "MANAGEMENT",
          assignedUserId: manager?.id ?? null,
          urgency: "CRITICAL",
          status: manager ? "DISPATCHED" : "ESCALATED",
          dueAt: new Date(now.getTime() + 5 * 60_000),
        },
      }) : null;
      const feedback = await tx.guestFeedbackLog.create({
        data: {
          tenantId: token.tenantId,
          propertyId: token.propertyId,
          bookingId: token.bookingId,
          correlationId: token.correlationId,
          channel: payload.channel,
          ...(payload.rating !== undefined ? { rating: payload.rating } : {}),
          encryptedRawText: encryptPersonalData(payload.textInput),
          redactedContext: redactForModel(payload.textInput),
          rawTextChecksum: checksum(payload.textInput),
          sentimentResult: analysis.sentiment,
          sentimentScore: new Prisma.Decimal(analysis.sentimentScore),
          angerScore: new Prisma.Decimal(analysis.angerScore),
          urgencyScore: new Prisma.Decimal(analysis.urgencyScore),
          confidenceScore: new Prisma.Decimal(analysis.confidenceScore),
          contextSummary: analysis.contextSummary,
          replyState: needsRecovery ? "QUEUED" : "NOT_REQUIRED",
          ...(needsRecovery ? { encryptedReplyText: encryptPersonalData(analysis.apologyText) } : {}),
          ...(task ? { recoveryTaskId: task.id } : {}),
        },
      });
      await tx.feedbackIntakeToken.update({
        where: { id: token.id },
        data: { status: "COMPLETED", completedAt: now },
      });
      await appendAudit(tx, {
        tenantId: token.tenantId,
        propertyId: token.propertyId,
        authorType: "SYSTEM",
        authorId: "AAIQ-GUEST-SENTIMENT",
        eventType: needsRecovery ? "GUEST_RECOVERY_AUTOMATION_CREATED" : "GUEST_FEEDBACK_CLASSIFIED",
        entityType: "GUEST_FEEDBACK",
        entityId: feedback.id,
        correlationId: token.correlationId,
        rawInputChecksum: checksum(payload.textInput),
        llmConfidence: analysis.confidenceScore,
        modifiedTables: needsRecovery
          ? ["feedback_intake_tokens", "guest_feedback_logs", "internal_tasks", "system_audit_trail"]
          : ["feedback_intake_tokens", "guest_feedback_logs", "system_audit_trail"],
        delta: {
          sentiment: analysis.sentiment,
          sentimentScore: analysis.sentimentScore,
          angerScore: analysis.angerScore,
          urgencyScore: analysis.urgencyScore,
          recoveryTaskId: task?.id ?? null,
          assignedManagerId: manager?.id ?? null,
        },
      });
      return { feedback, task };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (result.task) {
      await publishEvent({
        type: "task.created",
        tenantId: token.tenantId,
        propertyId: token.propertyId,
        entityId: result.task.id,
        occurredAt: now.toISOString(),
        payload: {
          urgency: "CRITICAL",
          source: "GUEST_FEEDBACK",
          assignedUserId: manager?.id ?? null,
          roomId: token.booking.roomId,
        },
      });
      await this.sendRecoveryMessages({
        feedbackId: result.feedback.id,
        analysis,
        managerMobile: manager?.mobileNumber ?? null,
        guestMobileEncrypted: token.booking.guestProfile?.phoneNumberEncrypted ?? null,
        roomNumber: token.booking.room?.number ?? null,
        correlationId: token.correlationId,
      });
    }
    return { feedbackId: result.feedback.id, sentiment: analysis.sentiment };
  }

  private static async sendRecoveryMessages(input: {
    feedbackId: string;
    analysis: SentimentResult;
    managerMobile: string | null;
    guestMobileEncrypted: string | null;
    roomNumber: string | null;
    correlationId: string;
  }) {
    let guestMessageSid: string | null = null;
    if (input.guestMobileEncrypted && analysisHasApology(input.analysis)) {
      const sent = await sendRealTimeSms({
        to: decryptPersonalData(input.guestMobileEncrypted),
        body: input.analysis.apologyText,
        statusCallback: `${config.PUBLIC_BASE_URL}/api/v1/sms/status`,
      });
      if (sent.success) guestMessageSid = sent.messageId;
    }
    if (input.managerMobile) {
      await sendRealTimeSms({
        to: input.managerMobile,
        body: `AAI Q CRITICAL GUEST RECOVERY | ${input.roomNumber ? `Room ${input.roomNumber}` : "Recent stay"} | ${input.analysis.contextSummary} | Trace ${input.correlationId}`,
        statusCallback: `${config.PUBLIC_BASE_URL}/api/v1/sms/status`,
      });
    }
    await prisma.guestFeedbackLog.update({
      where: { id: input.feedbackId },
      data: guestMessageSid
        ? { replyState: "SENT", responseMessageSid: guestMessageSid }
        : { replyState: "MANUAL_REVIEW" },
    });
  }
}

function analysisHasApology(value: SentimentResult) {
  return (value.sentiment === "NEGATIVE" || value.sentiment === "ANGRY")
    && value.apologyText.trim().length > 0;
}
