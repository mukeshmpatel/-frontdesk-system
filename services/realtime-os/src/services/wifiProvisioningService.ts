import { randomBytes } from "node:crypto";
import { appendAudit } from "../audit.js";
import { config } from "../config.js";
import { prisma } from "../infrastructure.js";
import { checksum } from "../security.js";
import { encryptPersonalData } from "./personalDataCrypto.js";

export type WifiBandwidthTier = "STANDARD" | "VIP_HIGH_SPEED";

export class WifiProvisioningService {
  static async provisionGuestNetworkAccess(
    bookingId: string,
    tier: WifiBandwidthTier = "STANDARD",
  ): Promise<{ accessCode: string; ssid: string; tier: WifiBandwidthTier }> {
    if (!config.NETWORK_GATEWAY_URL || !config.NETWORK_GATEWAY_API_KEY) {
      throw new Error("Network gateway integration is not configured.");
    }
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { room: { select: { number: true } } },
    });
    if (!booking?.room) throw new Error("Booking room is unavailable for Wi-Fi provisioning.");
    const accessCode = randomBytes(6).toString("base64url").toUpperCase();
    const response = await fetch(new URL("/v1/radius/credentials", config.NETWORK_GATEWAY_URL), {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.NETWORK_GATEWAY_API_KEY}`,
        "content-type": "application/json",
        "idempotency-key": `wifi:${booking.id}`,
      },
      body: JSON.stringify({
        externalId: booking.id,
        username: `ROOM-${booking.room.number}`,
        accessCode,
        ssid: config.GUEST_WIFI_SSID,
        bandwidthTier: tier,
        validFrom: booking.checkInAt.toISOString(),
        expiresAt: booking.checkOutAt.toISOString(),
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`Network gateway returned HTTP ${response.status}.`);
    await prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          wifiAccessCodeHash: checksum(accessCode),
          wifiAccessCodeEncrypted: encryptPersonalData(accessCode),
          wifiBandwidthTier: tier,
          wifiProfileActive: true,
          wifiProvisionedAt: new Date(),
          wifiRevokedAt: null,
        },
      });
      await appendAudit(tx, {
        tenantId: booking.tenantId, propertyId: booking.propertyId,
        authorType: "SYSTEM", authorId: "AAIQ-WIFI-PROVISIONER",
        eventType: "GUEST_WIFI_PROVISIONED", entityType: "BOOKING",
        entityId: booking.id, correlationId: booking.correlationId,
        modifiedTables: ["bookings", "system_audit_trail"],
        delta: { accessCodeHash: checksum(accessCode), ssid: config.GUEST_WIFI_SSID, tier, expiresAt: booking.checkOutAt.toISOString() },
      });
    });
    return { accessCode, ssid: config.GUEST_WIFI_SSID, tier };
  }

  static async revokeNetworkAccess(bookingId: string): Promise<void> {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking || !booking.wifiProfileActive) return;
    if (!config.NETWORK_GATEWAY_URL || !config.NETWORK_GATEWAY_API_KEY) {
      throw new Error("Network gateway integration is not configured.");
    }
    const response = await fetch(
      new URL(`/v1/radius/credentials/${encodeURIComponent(booking.id)}`, config.NETWORK_GATEWAY_URL),
      {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${config.NETWORK_GATEWAY_API_KEY}`,
          "idempotency-key": `wifi-revoke:${booking.id}`,
        },
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!response.ok && response.status !== 404) {
      throw new Error(`Network gateway revoke returned HTTP ${response.status}.`);
    }
    await prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          wifiProfileActive: false,
          wifiRevokedAt: new Date(),
          wifiAccessCodeEncrypted: null,
        },
      });
      await appendAudit(tx, {
        tenantId: booking.tenantId, propertyId: booking.propertyId,
        authorType: "SYSTEM", authorId: "AAIQ-WIFI-PROVISIONER",
        eventType: "GUEST_WIFI_REVOKED", entityType: "BOOKING",
        entityId: booking.id, correlationId: booking.correlationId,
        modifiedTables: ["bookings", "system_audit_trail"],
        delta: { accessCodeHash: booking.wifiAccessCodeHash, revoked: true },
      });
    });
  }
}
