import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";
import { secureTokenEquals } from "./verifyHardwareApiKey.js";

export async function verifyEdgeApiKey(request: FastifyRequest, reply: FastifyReply) {
  if (!config.EDGE_SYNC_API_KEY) return reply.code(503).send({
    error: { code: "EDGE_SYNC_NOT_CONFIGURED", message: "Edge synchronization is not configured." },
  });
  const supplied = request.headers["x-edge-api-key"];
  if (!secureTokenEquals(typeof supplied === "string" ? supplied : undefined, config.EDGE_SYNC_API_KEY)) {
    request.log.warn({ event: "INVALID_EDGE_SYNC_KEY", ip: request.ip });
    return reply.code(403).send({
      error: { code: "INVALID_EDGE_SYNC_KEY", message: "Edge synchronization signature is invalid." },
    });
  }
}
