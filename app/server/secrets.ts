import { env } from "cloudflare:workers";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(
    Math.ceil(value.length / 4) * 4,
    "=",
  );
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function encryptionKey() {
  const runtimeEnv = env as unknown as Record<string, string | undefined>;
  const encoded = runtimeEnv.TOKEN_ENCRYPTION_KEY;
  if (!encoded) throw new Error("AAI Q encryption is not configured.");
  const keyBytes = base64UrlDecode(encoded);
  if (keyBytes.length !== 32) throw new Error("AAI Q encryption key is invalid.");
  return crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptSecret(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(),
    textEncoder.encode(value),
  );
  return `v1.${base64UrlEncode(iv)}.${base64UrlEncode(new Uint8Array(encrypted))}`;
}

export async function decryptSecret(value: string) {
  const [version, encodedIv, encodedPayload] = value.split(".");
  if (version !== "v1" || !encodedIv || !encodedPayload) {
    throw new Error("Stored credential format is invalid.");
  }
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64UrlDecode(encodedIv) },
    await encryptionKey(),
    base64UrlDecode(encodedPayload),
  );
  return textDecoder.decode(decrypted);
}

export function randomBase64Url(byteLength = 32) {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function sha256Base64Url(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(value));
  return base64UrlEncode(new Uint8Array(digest));
}
