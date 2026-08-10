import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { appendAudit } from "../audit.js";
import { config } from "../config.js";
import { prisma } from "../infrastructure.js";
import { checksum, redactForModel } from "../security.js";
import { decryptPersonalData } from "./personalDataCrypto.js";
import { sendRealTimeSms } from "./smsService.js";
import { SlackAlertService } from "./slackAlertService.js";

export class LateCheckoutReminderService {
  static async monitorLateCheckoutsEngine(now = new Date()) {
    const bookings = await prisma.booking.findMany({
      where: {
        status: "CHECKED_IN",
        checkOutAt: { lte: new Date(now.getTime() - 5 * 60_000) },
        room: { status: "OCCUPIED" },
      },
      select: { id: true },
      take: 250,
      orderBy: { checkOutAt: "asc" },
    });
    let failed = 0;
    for (const booking of bookings) {
      try {
        await this.processBooking(booking.id, now);
      } catch (error) {
        failed += 1;
        await prisma.lateCheckoutIncident.updateMany({
          where: { bookingId: booking.id },
          data: {
            lastError: (error instanceof Error ? error.message : "Unknown late-checkout failure").slice(0, 500),
          },
        });
      }
    }
    return { scanned: bookings.length, failed };
  }

  private static async processBooking(bookingId: string, now: Date) {
    const prepared = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`late-checkout:${bookingId}`}))`;
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: { room: true, property: true, guestProfile: true, lateCheckout: true },
      });
      if (!booking?.room || booking.status !== "CHECKED_IN" || booking.room.status !== "OCCUPIED") return null;
      if (booking.lateCheckout?.state === "RESOLVED") return null;
      const minutesOverdue = Math.floor((now.getTime() - booking.checkOutAt.getTime()) / 60_000);
      const incident = booking.lateCheckout ?? await tx.lateCheckoutIncident.create({
        data: {
          tenantId: booking.tenantId, propertyId: booking.propertyId, bookingId: booking.id,
          correlationId: crypto.randomUUID(), checkoutAt: booking.checkOutAt,
        },
      });
      const staleClaim = new Date(now.getTime() - 2 * 60_000);
      if (!incident.reminderSentAt && (!incident.reminderClaimedAt || incident.reminderClaimedAt < staleClaim)) {
        const rawToken = randomBytes(32).toString("base64url");
        await tx.lateCheckoutIncident.update({
          where: { id: incident.id },
          data: { extensionTokenHash: checksum(rawToken), reminderClaimedAt: now },
        });
        return { action: "SMS" as const, booking, incident, minutesOverdue, rawToken };
      }
      if (
        incident.reminderSentAt
        && !incident.slackEscalatedAt
        && (!incident.slackClaimedAt || incident.slackClaimedAt < staleClaim)
        && now >= new Date(incident.reminderSentAt.getTime() + 15 * 60_000)
      ) {
        await tx.lateCheckoutIncident.update({
          where: { id: incident.id },
          data: { slackClaimedAt: now },
        });
        return { action: "SLACK" as const, booking, incident, minutesOverdue, rawToken: null };
      }
      return null;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (!prepared) return;

    if (prepared.action === "SMS") {
      if (!prepared.booking.guestProfile?.phoneNumberEncrypted || !config.TWILIO_PHONE_NUMBER) {
        throw new Error("Late-checkout reminder requires a guest phone and configured Twilio sender.");
      }
      const phone = decryptPersonalData(prepared.booking.guestProfile.phoneNumberEncrypted);
      const extensionUrl = `${config.PUBLIC_BASE_URL}/guest/late-checkout?token=${encodeURIComponent(prepared.rawToken!)}`;
      const body = `Wyndham Garden Salina: checkout for Room ${prepared.booking.room!.number} has passed. Request an extension here: ${extensionUrl}. If you have already departed, please disregard.`;
      const sent = await sendRealTimeSms({
        to: phone, body, statusCallback: `${config.PUBLIC_BASE_URL}/api/v1/sms/status`,
      });
      if (!sent.success) {
        await prisma.lateCheckoutIncident.update({
          where: { id: prepared.incident.id },
          data: { reminderClaimedAt: null, lastError: sent.error.slice(0, 500) },
        });
        throw new Error(sent.error);
      }
      await prisma.$transaction(async (tx) => {
        await tx.lateCheckoutIncident.update({
          where: { id: prepared.incident.id },
          data: { state: "SMS_SENT", reminderClaimedAt: null, reminderSentAt: now, reminderMessageSid: sent.messageId, lastError: null },
        });
        await tx.smsMessage.create({
          data: {
            tenantId: prepared.booking.tenantId, propertyId: prepared.booking.propertyId,
            messageSid: sent.messageId, direction: "OUTBOUND",
            fromPhoneHash: checksum(config.TWILIO_PHONE_NUMBER!), toPhoneHash: checksum(phone),
            redactedBody: redactForModel(body), bodyChecksum: checksum(body),
            status: "SENT", providerStatus: sent.status,
          },
        });
        await appendAudit(tx, {
          tenantId: prepared.booking.tenantId, propertyId: prepared.booking.propertyId,
          authorType: "SYSTEM", authorId: "AAIQ-LATE-CHECKOUT",
          eventType: "LATE_CHECKOUT_REMINDER_SENT", entityType: "BOOKING",
          entityId: prepared.booking.id, correlationId: prepared.incident.correlationId,
          modifiedTables: ["late_checkout_incidents", "sms_messages", "system_audit_trail"],
          delta: { minutesOverdue: prepared.minutesOverdue, messageSid: sent.messageId },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return;
    }

    let providerMessageId: string;
    try {
      providerMessageId = await SlackAlertService.dispatchEmergencySlackAlert({
        propertyName: prepared.booking.property.name,
        roomNumber: prepared.booking.room!.number,
        minutesOverdue: prepared.minutesOverdue,
        correlationId: prepared.incident.correlationId,
      });
    } catch (error) {
      await prisma.lateCheckoutIncident.update({
        where: { id: prepared.incident.id },
        data: {
          slackClaimedAt: null,
          lastError: (error instanceof Error ? error.message : "Unknown Slack failure").slice(0, 500),
        },
      });
      throw error;
    }
    await prisma.$transaction(async (tx) => {
      await tx.lateCheckoutIncident.update({
        where: { id: prepared.incident.id },
        data: { state: "SLACK_ESCALATED", slackClaimedAt: null, slackEscalatedAt: now, slackProviderMessageId: providerMessageId, lastError: null },
      });
      await appendAudit(tx, {
        tenantId: prepared.booking.tenantId, propertyId: prepared.booking.propertyId,
        authorType: "SYSTEM", authorId: "AAIQ-LATE-CHECKOUT",
        eventType: "LATE_CHECKOUT_SLACK_ESCALATED", entityType: "BOOKING",
        entityId: prepared.booking.id, correlationId: prepared.incident.correlationId,
        modifiedTables: ["late_checkout_incidents", "system_audit_trail"],
        delta: { minutesOverdue: prepared.minutesOverdue, providerMessageId },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
