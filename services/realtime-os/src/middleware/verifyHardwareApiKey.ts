import { timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";

export function secureTokenEquals(actual: string | undefined, expected: string | undefined) {
  if (!actual || !expected) return false;
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.byteLength === expectedBytes.byteLength
    && timingSafeEqual(actualBytes, expectedBytes);
}

export async function verifyHardwareApiKey(request: FastifyRequest, reply: FastifyReply) {
  const supplied = request.headers["x-api-key"];
  if (!config.ROOM_TELEMETRY_API_KEY) {
    request.log.error({ event: "ROOM_TELEMETRY_KEY_NOT_CONFIGURED" });
    return reply.code(503).send({
      error: { code: "TELEMETRY_NOT_CONFIGURED", message: "Hardware telemetry is not configured." },
    });
  }
  if (typeof supplied === "string" && secureTokenEquals(supplied, config.ROOM_TELEMETRY_API_KEY)) return;
  request.log.warn({ event: "ROOM_TELEMETRY_SIGNATURE_REJECTED", requestIp: request.ip });
  return reply.code(403).send({
    error: { code: "INVALID_HARDWARE_CREDENTIAL", message: "Hardware authentication failed." },
  });
}
