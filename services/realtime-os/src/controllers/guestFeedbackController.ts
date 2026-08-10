import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { feedbackQueue, prisma } from "../infrastructure.js";
import { checksum } from "../security.js";
import { encryptPersonalData } from "../services/personalDataCrypto.js";

const bodySchema = z.object({
  bookingId: z.string().uuid(),
  textInput: z.string().trim().min(2).max(8_000),
  rating: z.number().int().min(1).max(5).optional(),
  channel: z.enum(["POST_CHECKOUT_SMS", "PWA", "EMAIL", "WHATSAPP"]).default("PWA"),
});

export async function acceptGuestFeedback(request: FastifyRequest, reply: FastifyReply) {
  const input = bodySchema.parse(request.body);
  if (request.guestBookingId !== input.bookingId) {
    return reply.code(403).send({
      error: { code: "BOOKING_SESSION_MISMATCH", message: "Guest session does not match this booking." },
    });
  }
  const booking = await prisma.booking.findUnique({
    where: { id: input.bookingId },
    select: { id: true, tenantId: true, propertyId: true },
  });
  if (!booking) return reply.code(404).send({
    error: { code: "BOOKING_NOT_FOUND", message: "Booking was not found." },
  });
  const requestedKey = request.headers["idempotency-key"];
  const idempotencyKey = typeof requestedKey === "string" && requestedKey.trim()
    ? checksum(`${booking.propertyId}:${booking.id}:${requestedKey.trim()}`)
    : checksum(`${booking.id}:${input.channel}:${input.rating ?? ""}:${input.textInput}`);
  const existing = await prisma.feedbackIntakeToken.findUnique({
    where: { idempotencyKey },
    select: { id: true, correlationId: true, status: true },
  });
  if (existing) return reply.code(202).send({
    accepted: true,
    tokenId: existing.id,
    correlationId: existing.correlationId,
    status: existing.status,
    duplicate: true,
  });
  const correlationId = crypto.randomUUID();
  const token = await prisma.feedbackIntakeToken.create({
    data: {
      tenantId: booking.tenantId,
      propertyId: booking.propertyId,
      bookingId: booking.id,
      correlationId,
      idempotencyKey,
      encryptedPayload: encryptPersonalData(JSON.stringify(input)),
      status: "QUEUED",
    },
  });
  try {
    await feedbackQueue.add(
      "analyze-guest-feedback",
      { tokenId: token.id },
      {
        jobId: token.id,
        attempts: 5,
        backoff: { type: "exponential", delay: 2_000 },
        removeOnComplete: 500,
        removeOnFail: 2_000,
      },
    );
  } catch {
    await prisma.feedbackIntakeToken.update({
      where: { id: token.id },
      data: { status: "QUEUE_FAILED", errorCode: "QUEUE_UNAVAILABLE" },
    });
    return reply.code(503).send({
      error: { code: "FEEDBACK_QUEUE_UNAVAILABLE", message: "Feedback could not be durably queued." },
    });
  }
  return reply.code(202).send({
    accepted: true,
    tokenId: token.id,
    correlationId,
    status: "QUEUED",
    duplicate: false,
  });
}
