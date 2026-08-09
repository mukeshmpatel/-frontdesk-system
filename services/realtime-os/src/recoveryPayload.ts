import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { config } from "./config.js";
import type { SmsIntakeJob } from "./infrastructure.js";

type SealedPayload = {
  version: 1;
  algorithm: "aes-256-gcm";
  iv: string;
  tag: string;
  ciphertext: string;
};

const key = createHash("sha256")
  .update(`aaiq:sms-recovery:${config.JWT_SECRET}`)
  .digest();

export function sealRecoveryPayload(job: SmsIntakeJob): SealedPayload {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(job), "utf8"),
    cipher.final(),
  ]);
  return {
    version: 1,
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
  };
}

export function openRecoveryPayload(value: unknown): SmsIntakeJob {
  if (!value || typeof value !== "object") throw new Error("INVALID_RECOVERY_PAYLOAD");
  const payload = value as Partial<SealedPayload>;
  if (payload.version !== 1 || payload.algorithm !== "aes-256-gcm"
    || !payload.iv || !payload.tag || !payload.ciphertext) {
    throw new Error("INVALID_RECOVERY_PAYLOAD");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(payload.iv, "base64url"));
  decipher.setAuthTag(Buffer.from(payload.tag, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64url")),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8")) as SmsIntakeJob;
}
