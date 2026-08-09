import { Worker } from "bullmq";
import { prisma, receiptDeliveryQueue, redis, type ReceiptDeliveryJob } from "../infrastructure.js";
import { EmailInvoiceService } from "../services/emailInvoiceService.js";

async function enqueuePending() {
  const pending = await prisma.folioReceiptDelivery.findMany({
    where: { status: { in: ["QUEUED", "FAILED"] }, attempts: { lt: 5 } },
    select: { id: true },
    orderBy: { queuedAt: "asc" },
    take: 100,
  });
  await Promise.all(pending.map(({ id }) => receiptDeliveryQueue.add(
    "deliver-folio-receipt",
    { deliveryId: id },
    { jobId: `receipt-${id}`, attempts: 5, backoff: { type: "exponential", delay: 5_000 }, removeOnComplete: 500 },
  )));
  return { queued: pending.length };
}

export const receiptDeliveryWorker = new Worker<ReceiptDeliveryJob>(
  "aaiq-folio-receipts",
  async (job) => {
    if (job.data.scan) return enqueuePending();
    if (!job.data.deliveryId) throw new Error("Receipt delivery job is missing deliveryId.");
    try {
      return await EmailInvoiceService.dispatchCheckoutReceipt(job.data.deliveryId);
    } catch (error) {
      await EmailInvoiceService.markFailed(job.data.deliveryId, error);
      throw error;
    }
  },
  { connection: redis, concurrency: 5, lockDuration: 60_000, maxStalledCount: 2 },
);
