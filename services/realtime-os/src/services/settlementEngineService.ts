import { Prisma } from "@prisma/client";
import { appendAudit } from "../audit.js";
import { prisma } from "../infrastructure.js";
import { calculateSettlement } from "./settlementMath.js";

export class SettlementEngineService {
  static async processFranchiseSplit(folioAuditId: string) {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`settlement:${folioAuditId}`}))`;
      const audit = await tx.folioAudit.findUnique({
        where: { id: folioAuditId },
        include: {
          settlement: true,
          booking: { select: { tenantId: true, propertyId: true } },
          property: { include: { agreement: true } },
        },
      });
      if (!audit || audit.status !== "PASSED") throw new Error("Only a passed folio audit can create a settlement.");
      if (audit.settlement) return audit.settlement;
      const agreement = audit.property.agreement;
      const now = new Date();
      if (!agreement
        || agreement.effectiveFrom > now
        || (agreement.effectiveTo && agreement.effectiveTo <= now)) {
        throw new Error("An active franchise agreement is required; fee defaults are not inferred.");
      }
      const {
        gross, royaltyRate, marketingRate, corporateCut, marketingCut, franchiseeNet,
      } = calculateSettlement(
        audit.baseAmount,
        agreement.royaltyPercentage,
        agreement.marketingFundPct,
      );
      const settlement = await tx.franchiseSettleLedger.create({
        data: {
          tenantId: audit.booking.tenantId,
          propertyId: audit.booking.propertyId,
          agreementId: agreement.id,
          folioAuditId: audit.id,
          bookingId: audit.bookingId,
          correlationId: audit.correlationId,
          grossFolioAmount: gross,
          royaltyRate,
          marketingRate,
          corporateCut,
          marketingCut,
          franchiseeNet,
          status: "READY",
        },
      });
      await appendAudit(tx, {
        tenantId: audit.booking.tenantId,
        propertyId: audit.booking.propertyId,
        authorType: "SYSTEM",
        authorId: "AAIQ-SETTLEMENT-ENGINE",
        eventType: "FRANCHISE_SETTLEMENT_CALCULATED",
        entityType: "FRANCHISE_SETTLEMENT",
        entityId: settlement.id,
        correlationId: audit.correlationId,
        modifiedTables: ["franchise_settle_ledgers", "system_audit_trail"],
        delta: {
          folioAuditId: audit.id,
          agreementId: agreement.id,
          agreementVersion: agreement.agreementVersion,
          grossFolioAmount: gross.toFixed(2),
          royaltyRate: royaltyRate.toString(),
          marketingRate: marketingRate.toString(),
          corporateCut: corporateCut.toFixed(2),
          marketingCut: marketingCut.toFixed(2),
          franchiseeNet: franchiseeNet.toFixed(2),
          status: "READY",
          moneyMoved: false,
        },
      });
      return settlement;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  static async reconcilePassedAudits() {
    const audits = await prisma.folioAudit.findMany({
      where: { status: "PASSED", settlement: null },
      select: { id: true },
      orderBy: { createdAt: "asc" },
      take: 500,
    });
    for (const audit of audits) {
      try {
        await this.processFranchiseSplit(audit.id);
      } catch (error) {
        console.error("Settlement audit deferred", {
          folioAuditId: audit.id,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
    return audits.length;
  }
}
