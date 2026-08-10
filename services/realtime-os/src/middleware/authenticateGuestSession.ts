import type { FastifyReply, FastifyRequest } from "fastify";
import { checksum } from "../security.js";
import { prisma } from "../infrastructure.js";

declare module "fastify" {
  interface FastifyRequest {
    guestBookingId?: string;
  }
}

export async function authenticateGuestSession(request: FastifyRequest, reply: FastifyReply) {
  const token = request.headers["x-guest-session"];
  const bookingId = typeof request.body === "object" && request.body && "bookingId" in request.body
    ? String(request.body.bookingId) : "";
  if (typeof token !== "string" || !bookingId) {
    return reply.code(401).send({
      error: { code: "GUEST_SESSION_REQUIRED", message: "A valid guest check-in session is required." },
    });
  }
  const session = await prisma.guestAccessSession.findFirst({
    where: {
      bookingId,
      tokenHash: checksum(token),
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { bookingId: true },
  });
  if (!session) return reply.code(401).send({
    error: { code: "GUEST_SESSION_INVALID", message: "The guest check-in session is invalid or expired." },
  });
  request.guestBookingId = session.bookingId;
}
