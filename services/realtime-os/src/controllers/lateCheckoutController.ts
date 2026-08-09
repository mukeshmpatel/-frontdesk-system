import { Prisma } from "@prisma/client";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendAudit } from "../audit.js";
import { prisma } from "../infrastructure.js";
import { publishEvent } from "../realtime.js";
import { checksum } from "../security.js";

const querySchema = z.object({ token: z.string().min(40).max(100) });

export async function showLateCheckoutExtension(request: FastifyRequest, reply: FastifyReply) {
  const { token } = querySchema.parse(request.query);
  const incident = await prisma.lateCheckoutIncident.findUnique({
    where: { extensionTokenHash: checksum(token) },
    select: { id: true, state: true },
  });
  if (!incident || incident.state === "RESOLVED") {
    return reply.code(404).type("text/html").send("<h1>Link unavailable</h1><p>This extension link is invalid, expired, or already used.</p>");
  }
  return reply.type("text/html").send(
    `<main style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:60px auto;padding:28px;border:1px solid #E2E8F0;border-radius:14px"><h1 style="color:#1A365D">Request late checkout</h1><p>This sends an approval request to the front desk. Fees may apply.</p><form method="post" action="/guest/late-checkout"><input type="hidden" name="token" value="${token}"><button style="border:0;border-radius:10px;background:#1A365D;color:white;padding:12px 18px;font-weight:700" type="submit">Send request</button></form></main>`,
  );
}

export async function requestLateCheckoutExtension(request: FastifyRequest, reply: FastifyReply) {
  const { token } = querySchema.parse(request.body);
  const tokenHash = checksum(token);
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`late-extension:${tokenHash}`}))`;
    const incident = await tx.lateCheckoutIncident.findUnique({
      where: { extensionTokenHash: tokenHash },
      include: { booking: { include: { room: true, property: true } } },
    });
    if (!incident?.booking.room || incident.state === "RESOLVED") return null;
    const task = await tx.internalTask.create({
      data: {
        propertyId: incident.propertyId,
        correlationId: incident.correlationId,
        roomId: incident.booking.room.id,
        title: `Late checkout extension request — Room ${incident.booking.room.number}`,
        description: "Guest requested a late checkout extension from the secure SMS link. Front desk approval and any applicable fee are required.",
        assignedRole: "FRONT_DESK",
        urgency: "MEDIUM",
        status: "PENDING",
        dueAt: new Date(Date.now() + 5 * 60_000),
      },
    });
    await tx.lateCheckoutIncident.update({
      where: { id: incident.id },
      data: { state: "RESOLVED", resolvedAt: new Date(), extensionTokenHash: null },
    });
    await appendAudit(tx, {
      tenantId: incident.tenantId, propertyId: incident.propertyId,
      authorType: "GUEST", authorId: `booking:${incident.bookingId}`,
      eventType: "LATE_CHECKOUT_EXTENSION_REQUESTED", entityType: "BOOKING",
      entityId: incident.bookingId, correlationId: incident.correlationId,
      modifiedTables: ["internal_tasks", "late_checkout_incidents", "system_audit_trail"],
      delta: { taskId: task.id, roomId: incident.booking.room.id, approvalRequired: true },
    });
    return { incident, task };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  if (!result) {
    return reply.code(404).type("text/html").send("<h1>Link unavailable</h1><p>This extension link is invalid, expired, or already used.</p>");
  }
  await publishEvent({
    type: "task.created", tenantId: result.incident.tenantId,
    propertyId: result.incident.propertyId, entityId: result.task.id,
    occurredAt: new Date().toISOString(),
    payload: { assignedRole: "FRONT_DESK", roomId: result.incident.booking.room!.id, source: "LATE_CHECKOUT_EXTENSION" },
  });
  return reply.code(202).type("text/html").send(
    `<main style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:60px auto;padding:28px;border:1px solid #E2E8F0;border-radius:14px"><h1 style="color:#1A365D">Request received</h1><p>The front desk has been notified. Your extension is not confirmed until staff approval is provided.</p></main>`,
  );
}
