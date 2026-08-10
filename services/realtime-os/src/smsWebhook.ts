import twilio from "twilio";
import { Prisma } from "@prisma/client";
import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma, smsIntakeQueue, type SmsIntakeJob } from "./infrastructure.js";
import { checksum, redactForModel } from "./security.js";
import { sealRecoveryPayload } from "./recoveryPayload.js";

type TwilioInboundForm = {
  From?: string;
  To?: string;
  Body?: string;
  MessageSid?: string;
  NumMedia?: string;
  [key: string]: string | undefined;
};

function twiml() {
  return new twilio.twiml.MessagingResponse().toString();
}

export async function handleInboundSmsWebhook(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as TwilioInboundForm;
  reply.type("text/xml");
  const from = body.From?.trim();
  const to = body.To?.trim();
  const text = body.Body?.trim() ?? "";
  const messageSid = body.MessageSid?.trim();
  const mediaCount = Math.min(10, Math.max(0, Number.parseInt(body.NumMedia ?? "0", 10) || 0));
  if (!from || !to || (!text && mediaCount === 0) || !messageSid || !/^SM[a-zA-Z0-9]{20,40}$/.test(messageSid)) {
    return reply.code(400).send(twiml());
  }
  const route = await prisma.twilioPhoneRoute.findFirst({
    where: { twilioPhoneNumber: to, active: true },
    include: { property: { select: { id: true, tenantId: true } } },
  });
  if (!route) return reply.code(404).send(twiml());
  const existing = await prisma.smsMessage.findUnique({ where: { messageSid }, select: { id: true } });
  if (existing) return reply.code(200).send(twiml());

  const correlationId = crypto.randomUUID();
  const intakeTokenId = crypto.randomUUID();
  const redactedBody = redactForModel(text);
  const media = Array.from({ length: mediaCount }, (_, index) => ({
    url: body[`MediaUrl${index}`]?.trim() ?? "",
    contentType: body[`MediaContentType${index}`]?.trim().toLowerCase() ?? "application/octet-stream",
  })).filter((item) => item.url);
  const job: SmsIntakeJob = {
    intakeTokenId, correlationId, tenantId: route.tenantId, propertyId: route.propertyId,
    defaultSubmitterUserId: route.defaultSubmitterUserId, messageSid,
    fromPhoneHash: checksum(from), redactedBody, receivedAt: new Date().toISOString(), media,
  };
  try {
    await prisma.$transaction([
      prisma.smsMessage.create({
        data: {
          tenantId: route.tenantId, propertyId: route.propertyId, messageSid,
          direction: "INBOUND", fromPhoneHash: job.fromPhoneHash, toPhoneHash: checksum(to),
          redactedBody, bodyChecksum: checksum(text), status: "QUEUED", providerStatus: "received",
        },
      }),
      prisma.intakeToken.create({
        data: {
          id: intakeTokenId, tenantId: route.tenantId, propertyId: route.propertyId,
          correlationId, providerMessageSid: messageSid, source: "SMS", status: "QUEUED",
          payload: sealRecoveryPayload(job) as unknown as Prisma.InputJsonValue,
        },
      }),
    ]);
    await smsIntakeQueue.add("process-sms", job, {
      jobId: `sms-${messageSid}`, attempts: 5,
      backoff: { type: "exponential", delay: 2_000 },
      removeOnComplete: 5_000, removeOnFail: 10_000,
    });
  } catch (error: unknown) {
    console.error("Inbound SMS enqueue failure", { messageSid, error: error instanceof Error ? error.message : "unknown" });
    await prisma.intakeToken.updateMany({
      where: { id: intakeTokenId },
      data: { status: "FAILED", errorCode: "QUEUE_UNAVAILABLE" },
    });
    return reply.code(500).send(twiml());
  }
  return reply.header("server-timing", "sms-intake;desc=\"validated and queued\"").code(200).send(twiml());
}

export async function handleSmsStatusWebhook(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as TwilioInboundForm & { MessageStatus?: string; ErrorCode?: string };
  reply.type("text/xml");
  const messageSid = body.MessageSid?.trim();
  const providerStatus = body.MessageStatus?.trim();
  if (!messageSid || !providerStatus) return reply.code(400).send(twiml());
  const message = await prisma.smsMessage.findUnique({ where: { messageSid }, select: { id: true } });
  if (!message) return reply.code(404).send(twiml());
  await prisma.smsMessage.update({
    where: { id: message.id },
    data: {
      providerStatus,
      status: ["delivered", "sent", "queued", "accepted"].includes(providerStatus) ? providerStatus.toUpperCase() : "FAILED",
      errorCode: body.ErrorCode?.trim() || null,
    },
  });
  return reply.code(200).send(twiml());
}
