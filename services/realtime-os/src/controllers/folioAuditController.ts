import { FolioAuditStatus, Prisma } from "@prisma/client";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendAudit } from "../audit.js";
import { prisma, receiptDeliveryQueue, settlementQueue } from "../infrastructure.js";
import { WifiProvisioningService } from "../services/wifiProvisioningService.js";

const bodySchema = z.object({
  bookingId: z.string().uuid(),
});

export async function reconcileFolioController(request: FastifyRequest, reply: FastifyReply) {
  const { bookingId } = bodySchema.parse(request.body);
  const staff = request.authUser;
  const correlationId = crypto.randomUUID();
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, tenantId: staff.tenantId },
    include: { folioCharges: { orderBy: { postedAt: "asc" } } },
  });
  if (!booking) return reply.code(404).send({
    error: { code: "BOOKING_NOT_FOUND", message: "Booking was not found in this organization." },
  });
  if (booking.status === "CHECKED_OUT") {
    const existing = await prisma.folioAudit.findFirst({
      where: { bookingId: booking.id, status: FolioAuditStatus.PASSED },
      orderBy: { createdAt: "desc" },
      include: { receiptDelivery: { select: { id: true, status: true } } },
    });
    if (existing) {
      return reply.code(200).send({
        success: true,
        alreadyProcessed: true,
        auditId: existing.id,
        correlationId: existing.correlationId,
        status: existing.status,
        receiptDelivery: existing.receiptDelivery,
      });
    }
  }

  let baseAmount = new Prisma.Decimal(0);
  let expectedTax = new Prisma.Decimal(0);
  let postedTax = new Prisma.Decimal(0);
  const exceptions: Array<Record<string, unknown>> = [];
  for (const charge of booking.folioCharges) {
    if (charge.status === "VOIDED") continue;
    if (charge.chargeCode === "LOCAL_TAX" || charge.chargeCode.endsWith("_TAX")) {
      postedTax = postedTax.add(charge.amount);
      continue;
    }
    baseAmount = baseAmount.add(charge.amount);
    if (charge.taxRate !== null) {
      expectedTax = expectedTax.add(charge.amount.mul(charge.taxRate));
    } else if (charge.chargeCode === "ROOM_RATE") {
      exceptions.push({ chargeId: charge.id, code: "MISSING_TAX_RATE" });
    }
    if (!charge.externalRef) {
      exceptions.push({ chargeId: charge.id, code: "MISSING_SOURCE_REFERENCE" });
    }
  }
  expectedTax = expectedTax.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  postedTax = postedTax.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const variance = postedTax.sub(expectedTax).toDecimalPlaces(2);
  if (variance.abs().greaterThan(new Prisma.Decimal("0.01"))) {
    exceptions.push({
      code: "TAX_VARIANCE",
      expectedTax: expectedTax.toFixed(2),
      postedTax: postedTax.toFixed(2),
      variance: variance.toFixed(2),
    });
  }
  const status = exceptions.length ? FolioAuditStatus.EXCEPTION : FolioAuditStatus.PASSED;
  const zeroBalance = booking.folioBalance.abs().lessThanOrEqualTo(new Prisma.Decimal("0.01"));
  if (!zeroBalance) {
    exceptions.push({ code: "OUTSTANDING_FOLIO_BALANCE", amount: booking.folioBalance.toFixed(2) });
  }
  const finalStatus = exceptions.length ? FolioAuditStatus.EXCEPTION : status;
  const audit = await prisma.$transaction(async (tx) => {
    const created = await tx.folioAudit.create({
      data: {
        propertyId: booking.propertyId,
        bookingId: booking.id,
        correlationId,
        status: finalStatus,
        baseAmount,
        expectedTax,
        postedTax,
        varianceAmount: variance,
        exceptionDetails: exceptions as Prisma.InputJsonValue,
        generatedByUserId: staff.sub,
      },
    });
    if (finalStatus === FolioAuditStatus.PASSED) {
      await tx.folioCharge.updateMany({
        where: { bookingId: booking.id, status: { not: "VOIDED" } },
        data: { status: "RECONCILED" },
      });
      await tx.booking.update({
        where: { id: booking.id },
        data: { status: "CHECKED_OUT" },
      });
      await tx.folioReceiptDelivery.create({
        data: {
          tenantId: booking.tenantId,
          propertyId: booking.propertyId,
          bookingId: booking.id,
          folioAuditId: created.id,
          correlationId,
        },
      });
    }
    await appendAudit(tx, {
      tenantId: booking.tenantId,
      propertyId: booking.propertyId,
      authorType: "USER",
      authorId: staff.sub,
      eventType: finalStatus === FolioAuditStatus.PASSED ? "FOLIO_RECONCILED" : "FOLIO_AUDIT_EXCEPTION",
      entityType: "BOOKING",
      entityId: booking.id,
      correlationId,
      modifiedTables: finalStatus === FolioAuditStatus.PASSED
        ? ["folio_audits", "folio_charges", "bookings", "folio_receipt_deliveries", "system_audit_trail"]
        : ["folio_audits", "system_audit_trail"],
      delta: {
        status: finalStatus,
        baseAmount: baseAmount.toFixed(2),
        expectedTax: expectedTax.toFixed(2),
        postedTax: postedTax.toFixed(2),
        variance: variance.toFixed(2),
        exceptionCount: exceptions.length,
        zeroBalance,
      },
    });
    return created;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  let settlementQueued = false;
  let receiptQueued = false;
  if (finalStatus === FolioAuditStatus.PASSED) {
    try {
      await WifiProvisioningService.revokeNetworkAccess(booking.id);
    } catch (error) {
      request.log.error({
        event: "CHECKOUT_WIFI_REVOCATION_FAILED",
        bookingId: booking.id,
        message: error instanceof Error ? error.message : "Unknown network gateway failure",
      });
    }
    try {
      await settlementQueue.add(
        "calculate-franchise-settlement",
        { folioAuditId: audit.id },
        {
          jobId: `folio-${audit.id}`,
          attempts: 5,
          backoff: { type: "exponential", delay: 2_000 },
          removeOnComplete: 500,
          removeOnFail: 2_000,
        },
      );
      settlementQueued = true;
    } catch {
      // The recurring settlement reconciliation scan will recover this passed audit.
    }
    try {
      const delivery = await prisma.folioReceiptDelivery.findUniqueOrThrow({
        where: { folioAuditId: audit.id },
        select: { id: true },
      });
      await receiptDeliveryQueue.add(
        "deliver-folio-receipt",
        { deliveryId: delivery.id },
        {
          jobId: `receipt-${delivery.id}`,
          attempts: 5,
          backoff: { type: "exponential", delay: 5_000 },
          removeOnComplete: 500,
          removeOnFail: 2_000,
        },
      );
      receiptQueued = true;
    } catch {
      // The recurring receipt reconciliation scan repairs queue outages.
    }
  }
  return reply.code(finalStatus === FolioAuditStatus.PASSED ? 200 : 409).send({
    success: finalStatus === FolioAuditStatus.PASSED,
    auditId: audit.id,
    correlationId,
    status: finalStatus,
    totals: {
      baseAmount: baseAmount.toFixed(2),
      expectedTax: expectedTax.toFixed(2),
      postedTax: postedTax.toFixed(2),
      variance: variance.toFixed(2),
    },
    exceptions,
    paymentCaptured: false,
    settlementQueued,
    receiptQueued,
  });
}
