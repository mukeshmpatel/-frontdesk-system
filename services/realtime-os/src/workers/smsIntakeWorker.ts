import { Worker } from "bullmq";
import type { AuthUser } from "../contracts.js";
import { prisma, redis, type SmsIntakeJob } from "../infrastructure.js";
import { transcribeAudioMedia } from "../llm.js";
import { streamRemoteMedia, videoFrames } from "../media.js";
import { triggerAiOrchestratorPipeline } from "../services/aiOrchestratorPipeline.js";

function isAudio(contentType: string) {
  return contentType.toLowerCase().startsWith("audio/");
}

function isImage(contentType: string) {
  return contentType.toLowerCase().startsWith("image/");
}

function isVideo(contentType: string) {
  return contentType.toLowerCase().startsWith("video/");
}

async function prepareMedia(media: SmsIntakeJob["media"]) {
  const transcriptParts: string[] = [];
  const inlineImages: string[] = [];
  for (const item of media) {
    if (isAudio(item.contentType)) {
      transcriptParts.push(await transcribeAudioMedia(item.url, item.contentType));
    } else if (isImage(item.contentType)) {
      const result = await streamRemoteMedia(item.url, 20 * 1024 * 1024, item.contentType, true);
      inlineImages.push(`data:${result.contentType};base64,${Buffer.from(result.bytes).toString("base64")}`);
    } else if (isVideo(item.contentType)) {
      inlineImages.push(...await videoFrames(item.url, true));
    }
  }
  return { transcriptParts, inlineImages };
}

export const smsIntakeWorker = new Worker<SmsIntakeJob>("sms-intake-queue", async (job) => {
  const data = job.data;
  const claimed = await prisma.intakeToken.updateMany({
    where: { id: data.intakeTokenId, status: { in: ["QUEUED", "FAILED"] } },
    data: {
      status: "PROCESSING",
      attempts: { increment: 1 },
      processingStartedAt: new Date(),
      errorCode: null,
    },
  });
  if (claimed.count === 0) return;

  try {
    const submitter = await prisma.user.findFirst({
      where: { id: data.defaultSubmitterUserId, tenantId: data.tenantId, active: true },
      select: {
        id: true, tenantId: true, email: true, role: true,
        department: true, tier: true, isAvailable: true,
        workState: true,
      },
    });
    if (!submitter) throw new Error("DEFAULT_SUBMITTER_NOT_FOUND");

    const prepared = await prepareMedia(data.media);
    const combinedText = [
      data.redactedBody,
      ...prepared.transcriptParts.map((transcript) => `Voice message transcript:\n${transcript}`),
    ].filter(Boolean).join("\n\n");
    const user: AuthUser = {
      sub: submitter.id, tenantId: submitter.tenantId,
      email: submitter.email, role: submitter.role,
      department: submitter.department, tier: submitter.tier,
      isAvailable: submitter.isAvailable,
      workState: submitter.workState,
    };
    const result = await triggerAiOrchestratorPipeline({
      tenantId: data.tenantId,
      propertyId: data.propertyId,
      source: "SMS",
      senderHash: data.fromPhoneHash,
      textInput: combinedText || "Analyze the attached operational media.",
      timestamp: data.receivedAt,
      submittedBy: user,
      ...(prepared.inlineImages.length ? { inlineImages: prepared.inlineImages } : {}),
    }, data.correlationId);
    await prisma.$transaction([
      prisma.smsMessage.update({
        where: { messageSid: data.messageSid },
        data: { status: "PROCESSED", intakeId: result.intakeId, errorCode: null },
      }),
      prisma.intakeToken.update({
        where: { id: data.intakeTokenId },
        data: { status: "COMPLETED", completedAt: new Date(), errorCode: null },
      }),
    ]);
  } catch (error: unknown) {
    const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    const errorCode = error instanceof Error ? error.message.slice(0, 120) : "UNKNOWN_WORKER_ERROR";
    await prisma.$transaction([
      prisma.intakeToken.update({
        where: { id: data.intakeTokenId },
        data: { status: finalAttempt ? "DEAD_LETTER" : "FAILED", errorCode },
      }),
      prisma.smsMessage.update({
        where: { messageSid: data.messageSid },
        data: { status: finalAttempt ? "DEAD_LETTER" : "RETRYING", errorCode },
      }),
    ]);
    throw error;
  }
}, {
  connection: redis,
  concurrency: 1,
  limiter: { max: 30, duration: 1_000 },
  lockDuration: 120_000,
  maxStalledCount: 2,
});
