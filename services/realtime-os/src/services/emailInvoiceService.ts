import nodemailer from "nodemailer";
import { Prisma } from "@prisma/client";
import { appendAudit } from "../audit.js";
import { config } from "../config.js";
import { prisma } from "../infrastructure.js";
import { checksum } from "../security.js";
import { decryptPersonalData } from "./personalDataCrypto.js";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character]!);
}

function transporter() {
  if (!config.SMTP_HOST || !config.SMTP_USER || !config.SMTP_PASS || !config.SMTP_FROM) {
    throw new Error("SMTP receipt delivery is not configured.");
  }
  return nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
    pool: true,
  });
}

export class EmailInvoiceService {
  static async dispatchCheckoutReceipt(deliveryId: string) {
    const delivery = await prisma.folioReceiptDelivery.findUnique({
      where: { id: deliveryId },
      include: {
        folioAudit: true,
        booking: {
          include: {
            room: { select: { number: true } },
            property: { select: { name: true } },
            guestProfile: { select: { emailEncrypted: true } },
            folioCharges: { where: { status: { not: "VOIDED" } }, orderBy: { postedAt: "asc" } },
          },
        },
      },
    });
    if (!delivery || delivery.status === "SENT") return delivery;
    if (!delivery.booking.guestProfile?.emailEncrypted) {
      throw new Error("Guest email is unavailable for receipt delivery.");
    }
    const recipient = decryptPersonalData(delivery.booking.guestProfile.emailEncrypted);
    const total = delivery.folioAudit.baseAmount.add(delivery.folioAudit.postedTax).toDecimalPlaces(2);
    const rows = delivery.booking.folioCharges.map((charge) => `
      <tr>
        <td style="padding:10px;border-bottom:1px solid #E2E8F0">${escapeHtml(charge.description)}</td>
        <td style="padding:10px;border-bottom:1px solid #E2E8F0;text-align:right">${escapeHtml(charge.currency)} ${charge.amount.toFixed(2)}</td>
      </tr>`).join("");
    const propertyName = escapeHtml(delivery.booking.property.name);
    const html = `<!doctype html><html><body style="margin:0;background:#F7FAFC;color:#2D3748;font-family:Inter,Helvetica,Arial,sans-serif">
      <div style="max-width:680px;margin:24px auto;background:white;border:1px solid #E2E8F0">
        <div style="padding:24px;background:#1A365D;color:white"><h1 style="margin:0;font-size:22px">${propertyName}</h1><p style="margin:6px 0 0">Final folio receipt</p></div>
        <div style="padding:28px">
          <p>Your checkout folio has been reconciled with no outstanding audit exceptions.</p>
          <table style="width:100%;border-collapse:collapse"><thead><tr style="background:#F7FAFC"><th style="padding:10px;text-align:left">Description</th><th style="padding:10px;text-align:right">Amount</th></tr></thead><tbody>${rows}</tbody></table>
          <div style="margin-top:18px;padding-top:14px;border-top:2px solid #1A365D;font-size:17px;font-weight:700;text-align:right">Total settled: USD ${total.toFixed(2)}</div>
          <p style="font-size:12px;color:#718096">Room ${escapeHtml(delivery.booking.room?.number ?? "Unassigned")} · Confirmation ${escapeHtml(delivery.booking.confirmationNumber)} · Audit ${escapeHtml(delivery.folioAudit.id)}</p>
        </div>
      </div></body></html>`;

    await prisma.folioReceiptDelivery.update({
      where: { id: delivery.id },
      data: { status: "SENDING", attempts: { increment: 1 }, recipientHash: checksum(recipient), lastError: null },
    });
    const result = await transporter().sendMail({
      from: config.SMTP_FROM,
      to: recipient,
      subject: `${delivery.booking.property.name} — Final folio receipt`,
      html,
    });
    return prisma.$transaction(async (tx) => {
      const sent = await tx.folioReceiptDelivery.update({
        where: { id: delivery.id },
        data: { status: "SENT", providerMessageId: result.messageId, sentAt: new Date(), lastError: null },
      });
      await appendAudit(tx, {
        tenantId: delivery.tenantId, propertyId: delivery.propertyId,
        authorType: "SYSTEM", authorId: "AAIQ-RECEIPT-DELIVERY",
        eventType: "FOLIO_RECEIPT_EMAILED", entityType: "BOOKING",
        entityId: delivery.bookingId, correlationId: delivery.correlationId,
        modifiedTables: ["folio_receipt_deliveries", "system_audit_trail"],
        delta: { deliveryId: delivery.id, recipientHash: checksum(recipient), providerMessageId: result.messageId },
      });
      return sent;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  static async markFailed(deliveryId: string, error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown receipt delivery failure";
    await prisma.folioReceiptDelivery.updateMany({
      where: { id: deliveryId, status: { not: "SENT" } },
      data: { status: "FAILED", lastError: message.slice(0, 500) },
    });
  }
}
