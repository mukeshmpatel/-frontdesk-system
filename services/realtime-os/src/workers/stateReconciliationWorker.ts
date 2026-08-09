import { Worker } from "bullmq";
import { prisma, redis, smsIntakeQueue } from "../infrastructure.js";
import { openRecoveryPayload } from "../recoveryPayload.js";

export const stateReconciliationWorker = new Worker("aaiq-state-reconciliation", async () => {
  const staleBefore = new Date(Date.now() - 10 * 60_000);
  const stranded = await prisma.intakeToken.findMany({
    where: {
      OR: [
        { status: "PROCESSING", processingStartedAt: { lt: staleBefore } },
        { status: "FAILED", attempts: { lt: 5 } },
      ],
    },
    select: { id: true, attempts: true, payload: true },
    take: 100,
    orderBy: { queuedAt: "asc" },
  });
  let recovered = 0;
  for (const token of stranded) {
    let job;
    try {
      job = openRecoveryPayload(token.payload);
    } catch {
      await prisma.intakeToken.update({
        where: { id: token.id },
        data: { status: "DEAD_LETTER", errorCode: "INVALID_RECOVERY_PAYLOAD" },
      });
      continue;
    }
    const reset = await prisma.intakeToken.updateMany({
      where: { id: token.id, status: { in: ["PROCESSING", "FAILED"] } },
      data: { status: "QUEUED", processingStartedAt: null, errorCode: "SELF_HEALED_REQUEUE" },
    });
    if (!reset.count) continue;
    await smsIntakeQueue.add("process-sms-recovery", job, {
      jobId: `sms-recovery-${token.id}-${token.attempts}`,
      attempts: Math.max(1, 5 - token.attempts),
      backoff: { type: "exponential", delay: 2_000 },
      removeOnComplete: 5_000,
      removeOnFail: 10_000,
    });
    recovered += 1;
  }
  return { inspected: stranded.length, recovered };
}, { connection: redis, concurrency: 1 });
