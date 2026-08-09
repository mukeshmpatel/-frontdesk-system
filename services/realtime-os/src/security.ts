import { createHash } from "node:crypto";

const replacements: Array<[RegExp, string]> = [
  [/\b(?:\d[ -]*?){13,19}\b/g, "[PAYMENT_DATA_REDACTED]"],
  [/\b\d{3}-\d{2}-\d{4}\b/g, "[GOVERNMENT_ID_REDACTED]"],
  [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL_REDACTED]"],
  [/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, "[PHONE_REDACTED]"],
];

export function redactForModel(value: string) {
  return replacements.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), value);
}

export function checksum(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function assertSafeMediaUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("Media URLs must use HTTPS.");
  if (url.username || url.password) throw new Error("Media URLs cannot contain credentials.");
  return url.toString();
}
