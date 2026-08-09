import { Prisma } from "@prisma/client";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendAudit } from "../audit.js";
import { config } from "../config.js";
import { prisma } from "../infrastructure.js";
import { publishEvent } from "../realtime.js";
import { checksum } from "../security.js";
import { decryptPersonalData } from "../services/personalDataCrypto.js";
import { provisionRoomAccess } from "../services/smartLockService.js";
import { sendRealTimeSms } from "../services/smsService.js";
import { metersBetween, secureHashEquals } from "../services/biometricUtils.js";
import { WifiProvisioningService } from "../services/wifiProvisioningService.js";

const bodySchema = z.object({
  bookingId: z.string().uuid(),
  imageBase64: z.string().min(100).max(13_500_000),
  currentLat: z.number().min(-90).max(90),
  currentLng: z.number().min(-180).max(180),
  consentConfirmed: z.literal(true),
});

type BiometricProviderResponse = {
  matched: boolean;
  confidence: number;
  referenceVectorHash: string;
};

async function verifyWithProvider(imageBase64: string, referenceHash: string) {
  if (!config.BIOMETRIC_PROVIDER_URL || !config.BIOMETRIC_PROVIDER_API_KEY) {
    throw Object.assign(new Error("Biometric verification provider is not configured."), { statusCode: 503 });
  }
  const response = await fetch(new URL("/v1/face/verify", config.BIOMETRIC_PROVIDER_URL), {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.BIOMETRIC_PROVIDER_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ imageBase64, referenceVectorHash: referenceHash, livenessRequired: true }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw Object.assign(
    new Error(`Biometric provider returned HTTP ${response.status}.`),
    { statusCode: 502 },
  );
  return response.json() as Promise<BiometricProviderResponse>;
}

export async function verifyGuestBiometrics(request: FastifyRequest, reply: FastifyReply) {
  const input = bodySchema.parse(request.body);
  if (request.guestBookingId !== input.bookingId) {
    return reply.code(403).send({
      error: { code: "BOOKING_SESSION_MISMATCH", message: "Guest session does not match this booking." },
    });
  }
  const correlationId = crypto.randomUUID();
  const booking = await prisma.booking.findFirst({
    where: {
      id: input.bookingId,
      status: { in: ["RESERVED", "CHECKED_IN"] },
    },
    include: { room: true, guestProfile: true, property: true },
  });
  if (!booking?.room || !booking.guestProfile) return reply.code(404).send({
    error: { code: "CHECKIN_PROFILE_NOT_FOUND", message: "Reservation, room, or guest identity profile was not found." },
  });
  if (!booking.property.latitude || !booking.property.longitude) {
    return reply.code(503).send({
      error: { code: "PROPERTY_GEOFENCE_NOT_CONFIGURED", message: "Property geofence is not configured." },
    });
  }
  if (!booking.guestProfile.biometricConsentAt || !booking.guestProfile.facialVectorHash) {
    return reply.code(409).send({
      error: { code: "BIOMETRIC_ENROLLMENT_REQUIRED", message: "Biometric enrollment and consent are required." },
    });
  }
  const distance = metersBetween(
    input.currentLat,
    input.currentLng,
    Number(booking.property.latitude),
    Number(booking.property.longitude),
  );
  if (distance > booking.property.geofenceMeters) return reply.code(403).send({
    error: { code: "OUTSIDE_PROPERTY_GEOFENCE", message: "Mobile-key activation requires the guest to be on property." },
  });

  const imageChecksum = checksum(input.imageBase64);
  const verification = await verifyWithProvider(input.imageBase64, booking.guestProfile.facialVectorHash);
  const matched = verification.matched
    && verification.confidence >= 0.92
    && secureHashEquals(verification.referenceVectorHash, booking.guestProfile.facialVectorHash);
  if (!matched) {
    await prisma.guestProfile.update({
      where: { id: booking.guestProfile.id },
      data: { biometricStatus: verification.confidence >= 0.75 ? "MANUAL_REVIEW" : "FAILED" },
    });
    return reply.code(401).send({
      error: { code: "IDENTITY_VERIFICATION_FAILED", message: "Identity verification failed. Please see the front desk." },
    });
  }

  const access = await provisionRoomAccess({
    bookingId: booking.id,
    roomNumber: booking.room.number,
    validFrom: new Date(),
    expiresAt: booking.nfcKeyExpiresAt ?? booking.checkOutAt,
  });
  await prisma.$transaction(async (tx) => {
    await tx.guestProfile.update({
      where: { id: booking.guestProfile!.id },
      data: {
        biometricStatus: "VERIFIED",
        isIdentityVerified: true,
        identityVerifiedAt: new Date(),
      },
    });
    await tx.booking.update({
      where: { id: booking.id },
      data: { status: "CHECKED_IN", nfcKeyExpiresAt: access.expiresAt },
    });
    await tx.room.update({ where: { id: booking.room!.id }, data: { status: "OCCUPIED" } });
    await tx.doorAccessCredential.create({
      data: {
        bookingId: booking.id,
        correlationId,
        tokenHash: access.tokenHash,
        lockProviderId: access.lockProviderId,
        expiresAt: access.expiresAt,
      },
    });
    await appendAudit(tx, {
      tenantId: booking.tenantId,
      propertyId: booking.propertyId,
      authorType: "GUEST",
      authorId: booking.guestProfile!.id,
      eventType: "BIOMETRIC_CHECKIN_VERIFIED",
      entityType: "BOOKING",
      entityId: booking.id,
      correlationId,
      rawInputChecksum: imageChecksum,
      llmConfidence: verification.confidence,
      modifiedTables: ["guest_profiles", "bookings", "rooms", "door_access_credentials", "system_audit_trail"],
      delta: {
        verified: true,
        roomId: booking.room!.id,
        lockProviderId: access.lockProviderId,
        expiresAt: access.expiresAt.toISOString(),
        distanceMeters: Math.round(distance),
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  const appleUrl = config.APPLE_WALLET_BASE_URL
    ? `${config.APPLE_WALLET_BASE_URL}?credential=${encodeURIComponent(access.rawToken)}`
    : null;
  const googleUrl = config.GOOGLE_WALLET_BASE_URL
    ? `${config.GOOGLE_WALLET_BASE_URL}?credential=${encodeURIComponent(access.rawToken)}`
    : null;
  const phone = decryptPersonalData(booking.guestProfile.phoneNumberEncrypted);
  let wifiMessage = "";
  let wifiProvisioned = false;
  try {
    const wifi = await WifiProvisioningService.provisionGuestNetworkAccess(booking.id);
    wifiProvisioned = true;
    wifiMessage = ` | Wi-Fi ${wifi.ssid}: ${wifi.accessCode} (${wifi.tier})`;
  } catch (error) {
    request.log.error({
      event: "GUEST_WIFI_PROVISIONING_FAILED",
      bookingId: booking.id,
      message: error instanceof Error ? error.message : "Unknown network gateway failure",
    });
  }
  const links = [appleUrl ? `Apple Wallet: ${appleUrl}` : "", googleUrl ? `Google Wallet: ${googleUrl}` : ""]
    .filter(Boolean).join(" | ");
  const sms = links
    ? await sendRealTimeSms({
      to: phone,
      body: `Identity verified. Room ${booking.room.number} is ready. ${links}${wifiMessage}`,
      statusCallback: `${config.PUBLIC_BASE_URL}/api/v1/sms/status`,
    })
    : { success: false as const, error: "Wallet delivery URLs are not configured." };
  await publishEvent({
    type: "room.telemetry",
    tenantId: booking.tenantId,
    propertyId: booking.propertyId,
    entityId: booking.room.id,
    occurredAt: new Date().toISOString(),
    payload: { status: "OCCUPIED", checkInCompleted: true },
  });
  return reply.send({
    success: true,
    correlationId,
    roomNumber: booking.room.number,
    identityVerified: true,
    accessProvisioned: true,
    walletDelivery: sms.success ? "SENT" : "CONFIGURATION_REQUIRED",
    wifiProvisioned,
  });
}
