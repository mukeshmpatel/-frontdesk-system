import { Worker } from "bullmq";
import { redis, type SettlementJob } from "../infrastructure.js";
import { SettlementEngineService } from "../services/settlementEngineService.js";

export const settlementWorker = new Worker<SettlementJob>(
  "aaiq-franchise-settlements",
  async (job) => {
    if (job.data.scan) return SettlementEngineService.reconcilePassedAudits();
    if (!job.data.folioAuditId) throw new Error("Settlement job requires a folio audit ID.");
    return SettlementEngineService.processFranchiseSplit(job.data.folioAuditId);
  },
  { connection: redis, concurrency: 5, lockDuration: 60_000, maxStalledCount: 2 },
);
