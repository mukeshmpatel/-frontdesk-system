import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { config } from "../config.js";

export type OfflinePassPayload = {
  bookingId: string;
  roomNumber: string;
  nfcExpiresAt: string;
  issuedAt: string;
};

export class OfflineResilienceEngine {
  static generateOfflineBackupToken(payload: OfflinePassPayload): string {
    if (!config.LOCAL_HARDWARE_ENCRYPTION_KEY) {
      throw Object.assign(new Error("Offline lock encryption key is not configured."), { statusCode: 503 });
    }
    const expiresAt = new Date(payload.nfcExpiresAt);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date(payload.issuedAt)) {
      throw new Error("Offline credential expiration is invalid.");
    }
    const key = Buffer.from(config.LOCAL_HARDWARE_ENCRYPTION_KEY, "hex");
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from("AAIQ-OFFLINE-ROOM-ACCESS:v1"));
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(payload), "utf8"),
      cipher.final(),
    ]);
    return [
      "v1",
      iv.toString("base64url"),
      ciphertext.toString("base64url"),
      cipher.getAuthTag().toString("base64url"),
    ].join(".");
  }

  static verifyOfflineBackupToken(token: string, now = new Date()): OfflinePassPayload {
    if (!config.LOCAL_HARDWARE_ENCRYPTION_KEY) throw new Error("Offline lock encryption key is not configured.");
    const [version, iv, ciphertext, tag] = token.split(".");
    if (version !== "v1" || !iv || !ciphertext || !tag) throw new Error("Offline credential format is invalid.");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      Buffer.from(config.LOCAL_HARDWARE_ENCRYPTION_KEY, "hex"),
      Buffer.from(iv, "base64url"),
    );
    decipher.setAAD(Buffer.from("AAIQ-OFFLINE-ROOM-ACCESS:v1"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const payload = JSON.parse(Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8")) as OfflinePassPayload;
    if (new Date(payload.nfcExpiresAt) <= now) throw new Error("Offline credential has expired.");
    return payload;
  }
}
