import { escalationQueue, prisma, propertyAutomationQueue, redis, reminderQueue, smsIntakeQueue } from "./infrastructure.js";

const STALL_THRESHOLD_MS = 10 * 60_000;

export async function systemHealth() {
  const startedAt = Date.now();
  const [database, cache, queueCounts, staleProcessing] = await Promise.allSettled([
    prisma.$queryRaw`SELECT 1`,
    redis.ping(),
    Promise.all([
      smsIntakeQueue.getWaitingCount(),
      smsIntakeQueue.getActiveCount(),
      smsIntakeQueue.getDelayedCount(),
      smsIntakeQueue.getFailedCount(),
      reminderQueue.getDelayedCount(),
      escalationQueue.getDelayedCount(),
      propertyAutomationQueue.getWaitingCount(),
      propertyAutomationQueue.getFailedCount(),
    ]),
    prisma.intakeToken.count({
      where: {
        status: "PROCESSING",
        processingStartedAt: { lt: new Date(Date.now() - STALL_THRESHOLD_MS) },
      },
    }),
  ]);

  const dependenciesHealthy = database.status === "fulfilled"
    && cache.status === "fulfilled"
    && cache.value === "PONG"
    && queueCounts.status === "fulfilled"
    && staleProcessing.status === "fulfilled";
  const staleCount = staleProcessing.status === "fulfilled" ? staleProcessing.value : -1;
  const status = !dependenciesHealthy || staleCount > 0 ? "UNHEALTHY" : "HEALTHY";
  const counts = queueCounts.status === "fulfilled" ? queueCounts.value : [0, 0, 0, 0, 0, 0, 0, 0];

  return {
    status,
    service: "aaiq-realtime-os",
    timestamp: new Date().toISOString(),
    responseTimeMs: Date.now() - startedAt,
    dependencies: {
      postgres: database.status === "fulfilled" ? "UP" : "DOWN",
      redis: cache.status === "fulfilled" && cache.value === "PONG" ? "UP" : "DOWN",
    },
    queueMetrics: {
      smsWaiting: counts[0],
      smsActive: counts[1],
      smsDelayed: counts[2],
      smsFailed: counts[3],
      scheduledReminders: counts[4],
      scheduledEscalations: counts[5],
      propertyAutomationWaiting: counts[6],
      propertyAutomationFailed: counts[7],
      staleProcessing: staleCount,
    },
  };
}
