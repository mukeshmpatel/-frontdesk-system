import { Worker } from "bullmq";
import { feedbackQueue, prisma, redis, type FeedbackJob } from "../infrastructure.js";
import { SentimentAnalysisService } from "../services/sentimentAnalysisService.js";

export const feedbackWorker = new Worker<FeedbackJob>(
  "aaiq-guest-feedback",
  async (job) => {
    if (job.data.scan) {
      const tokens = await prisma.feedbackIntakeToken.findMany({
        where: { status: { in: ["QUEUE_FAILED", "FAILED"] }, attempts: { lt: 5 } },
        select: { id: true, attempts: true },
        orderBy: { queuedAt: "asc" },
        take: 250,
      });
      for (const token of tokens) {
        await feedbackQueue.add(
          "recover-guest-feedback",
          { tokenId: token.id },
          {
            jobId: `recovery-${token.id}-${token.attempts}`,
            attempts: 5,
            backoff: { type: "exponential", delay: 2_000 },
            removeOnComplete: 500,
            removeOnFail: 2_000,
          },
        );
      }
      return { recovered: tokens.length };
    }
    if (!job.data.tokenId) throw new Error("Feedback job requires a token ID.");
    try {
      return await SentimentAnalysisService.evaluateGuestSentiment(job.data.tokenId);
    } catch (error) {
      await prisma.feedbackIntakeToken.updateMany({
        where: { id: job.data.tokenId, status: { not: "COMPLETED" } },
        data: {
          status: "FAILED",
          errorCode: error instanceof Error ? error.name.slice(0, 80) : "UNKNOWN_ERROR",
        },
      });
      throw error;
    }
  },
  { connection: redis, concurrency: 5, lockDuration: 60_000, maxStalledCount: 2 },
);
