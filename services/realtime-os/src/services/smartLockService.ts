import { createHmac, randomBytes } from "node:crypto";
import { config } from "../config.js";
import { OfflineResilienceEngine } from "./walletPassService.js";

export type ProvisionedRoomAccess = {
  rawToken: string;
  tokenHash: string;
  lockProviderId: string;
  expiresAt: Date;
};

export async function provisionRoomAccess(input: {
  bookingId: string;
  roomNumber: string;
  validFrom: Date;
  expiresAt: Date;
}): Promise<ProvisionedRoomAccess> {
  if (!config.SMART_LOCK_API_URL || !config.SMART_LOCK_API_KEY || !config.CREDENTIAL_SIGNING_SECRET) {
    throw Object.assign(new Error("Smart-lock credential provisioning is not configured."), { statusCode: 503 });
  }
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = createHmac("sha256", config.CREDENTIAL_SIGNING_SECRET).update(rawToken).digest("hex");
  const offlineBackupToken = OfflineResilienceEngine.generateOfflineBackupToken({
    bookingId: input.bookingId,
    roomNumber: input.roomNumber,
    nfcExpiresAt: input.expiresAt.toISOString(),
    issuedAt: input.validFrom.toISOString(),
  });
  const response = await fetch(new URL("/v1/mobile-keys", config.SMART_LOCK_API_URL), {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.SMART_LOCK_API_KEY}`,
      "content-type": "application/json",
      "idempotency-key": input.bookingId,
    },
    body: JSON.stringify({
      bookingId: input.bookingId,
      roomNumber: input.roomNumber,
      credentialHash: tokenHash,
      validFrom: input.validFrom.toISOString(),
      expiresAt: input.expiresAt.toISOString(),
      channels: ["NFC", "BLUETOOTH"],
      offlineBackupToken,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw Object.assign(
    new Error(`Smart-lock provider returned HTTP ${response.status}.`),
    { statusCode: 502 },
  );
  const body = await response.json() as { credentialId?: string };
  if (!body.credentialId) throw Object.assign(
    new Error("Smart-lock provider did not return a credential ID."),
    { statusCode: 502 },
  );
  return { rawToken, tokenHash, lockProviderId: body.credentialId, expiresAt: input.expiresAt };
}
