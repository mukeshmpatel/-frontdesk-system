import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { automateRoomTurn } from "../services/roomTurnAutomationService.js";

const telemetrySchema = z.object({
  propertyId: z.string().uuid(),
  providerEventId: z.string().min(8).max(160),
  roomNumber: z.string().min(1).max(20),
  eventType: z.enum(["LOCK_OPENED", "LOCK_CLOSED", "GUEST_CHECKOUT_TRIGGER", "KEY_TOKEN_EXPIRED"]),
  timestamp: z.string().datetime(),
});

export async function handleLockTelemetryWebhook(request: FastifyRequest, reply: FastifyReply) {
  const input = telemetrySchema.parse(request.body);
  return reply.send(await automateRoomTurn({
    propertyId: input.propertyId,
    providerEventId: input.providerEventId,
    roomNumber: input.roomNumber,
    eventType: input.eventType,
    occurredAt: new Date(input.timestamp),
  }));
}
