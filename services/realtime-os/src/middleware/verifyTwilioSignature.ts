import { createHash } from "node:crypto";
import type { RequestHandler } from "express";
import type { FastifyReply, FastifyRequest } from "fastify";
import twilio from "twilio";
import { config } from "../config.js";

export type TwilioForm = Record<string, string | undefined>;

export function canonicalTwilioUrl(path: string): string {
  return new URL(path, config.PUBLIC_BASE_URL).toString();
}

export function stringFormParams(body: TwilioForm): Record<string, string> {
  return Object.fromEntries(
    Object.entries(body).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

export function validateTwilioWebhook(signature: string | undefined, url: string, body: TwilioForm): boolean {
  if (!config.TWILIO_AUTH_TOKEN || !signature) return false;
  return twilio.validateRequest(config.TWILIO_AUTH_TOKEN, signature, url, stringFormParams(body));
}

function safeRequestFingerprint(ip: string | undefined): string {
  return createHash("sha256").update(ip ?? "unknown").digest("hex").slice(0, 16);
}

function logRejectedRequest(path: string, ip: string | undefined) {
  console.warn(JSON.stringify({
    event: "TWILIO_SIGNATURE_REJECTED",
    path,
    requestFingerprint: safeRequestFingerprint(ip),
    occurredAt: new Date().toISOString(),
  }));
}

/**
 * Express-compatible middleware for services that mount the shared HNE SMS module.
 * The form parser must run before this middleware so Twilio's signed parameters are available.
 */
export const verifyTwilioSignature: RequestHandler = (request, response, next) => {
  const signature = request.header("x-twilio-signature") ?? undefined;
  const url = canonicalTwilioUrl(request.originalUrl);
  if (validateTwilioWebhook(signature, url, request.body as TwilioForm)) {
    next();
    return;
  }
  logRejectedRequest(request.path, request.ip);
  response.status(403).type("text/plain").send("Forbidden");
};

/**
 * Native Fastify adapter used by AAIQ. @fastify/formbody is registered before
 * the route, so request.body contains the exact signed form parameter matrix.
 */
export async function verifyTwilioSignatureFastify(request: FastifyRequest, reply: FastifyReply) {
  const signature = request.headers["x-twilio-signature"];
  const path = request.raw.url ?? request.url;
  const valid = validateTwilioWebhook(
    typeof signature === "string" ? signature : undefined,
    canonicalTwilioUrl(path),
    request.body as TwilioForm,
  );
  if (valid) return;
  logRejectedRequest(path, request.ip);
  return reply.code(403).type("text/plain").send("Forbidden");
}
