import { Prisma } from "@prisma/client";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendAudit } from "../audit.js";
import { prisma } from "../infrastructure.js";
import { checksum } from "../security.js";
import { publishEvent } from "../realtime.js";

const base = {
  edgeNodeId: z.string().min(3).max(100),
  edgeEventId: z.string().uuid(),
  propertyId: z.string().uuid(),
  correlationId: z.string().uuid(),
  occurredAt: z.string().datetime(),
};
const eventSchema = z.discriminatedUnion("eventType", [
  z.object({
    ...base,
    eventType: z.literal("ROOM_STATE_UPDATE"),
    payload: z.object({
      roomNumber: z.string().min(1).max(20),
      status: z.enum(["VACANT", "CLEAN", "DIRTY", "OCCUPIED", "OUT_OF_ORDER"]),
      currentTemp: z.number().min(40).max(100).nullable().optional(),
      climateProfile: z.enum(["COMFORT", "ECO_MODE"]).optional(),
    }),
  }),
  z.object({
    ...base,
    eventType: z.literal("TASK_STATUS_UPDATE"),
    payload: z.object({
      taskId: z.string().uuid(),
      status: z.enum(["ACKNOWLEDGED", "IN_PROGRESS", "COMPLETED"]),
    }),
  }),
  z.object({
    ...base,
    eventType: z.literal("EDGE_AUDIT_EVENT"),
    payload: z.object({
      eventName: z.string().min(1).max(80),
      entityType: z.string().min(1).max(80),
      entityId: z.string().min(1).max(160),
      delta: z.record(z.unknown()),
    }),
  }),
]);

export async function synchronizeEdgeEvent(request: FastifyRequest, reply: FastifyReply) {
  const event = eventSchema.parse(request.body);
  const payloadChecksum = checksum(JSON.stringify(event.payload));
  const occurredAt = new Date(event.occurredAt);
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`edge:${event.edgeNodeId}:${event.edgeEventId}`}))`;
    const duplicate = await tx.edgeSyncReceipt.findUnique({
      where: { edgeNodeId_edgeEventId: { edgeNodeId: event.edgeNodeId, edgeEventId: event.edgeEventId } },
      select: { id: true },
    });
    if (duplicate) return { duplicate: true };
    const property = await tx.property.findUnique({
      where: { id: event.propertyId },
      select: { tenantId: true },
    });
    if (!property) throw Object.assign(new Error("Edge event property was not found."), { statusCode: 404 });
    let entityType = "EDGE_EVENT";
    let entityId = event.edgeEventId;
    let modifiedTables = ["edge_sync_receipts", "system_audit_trail"];
    if (event.eventType === "ROOM_STATE_UPDATE") {
      const room = await tx.room.findFirst({
        where: { propertyId: event.propertyId, number: event.payload.roomNumber },
        select: { id: true },
      });
      if (!room) throw Object.assign(new Error("Edge event room was not found."), { statusCode: 404 });
      await tx.room.updateMany({
        where: { id: room.id, stateUpdatedAt: { lte: occurredAt } },
        data: {
          status: event.payload.status,
          stateUpdatedAt: occurredAt,
          ...(event.payload.currentTemp !== undefined ? { currentTemp: event.payload.currentTemp } : {}),
          ...(event.payload.climateProfile ? { climateProfile: event.payload.climateProfile } : {}),
        },
      });
      entityType = "ROOM";
      entityId = room.id;
      modifiedTables = ["rooms", ...modifiedTables];
    } else if (event.eventType === "TASK_STATUS_UPDATE") {
      const task = await tx.internalTask.findFirst({
        where: { id: event.payload.taskId, propertyId: event.propertyId },
        select: { id: true, lastActivityAt: true },
      });
      if (!task) throw Object.assign(new Error("Edge event task was not found."), { statusCode: 404 });
      if (task.lastActivityAt <= occurredAt) {
        await tx.internalTask.update({
          where: { id: task.id },
          data: {
            status: event.payload.status,
            lastActivityAt: occurredAt,
            ...(event.payload.status === "ACKNOWLEDGED" ? { acknowledgedAt: occurredAt } : {}),
            ...(event.payload.status === "COMPLETED" ? { completedAt: occurredAt } : {}),
          },
        });
      }
      entityType = "TASK";
      entityId = task.id;
      modifiedTables = ["internal_tasks", ...modifiedTables];
    } else {
      entityType = event.payload.entityType;
      entityId = event.payload.entityId;
    }
    await tx.edgeSyncReceipt.create({
      data: {
        propertyId: event.propertyId,
        edgeNodeId: event.edgeNodeId,
        edgeEventId: event.edgeEventId,
        correlationId: event.correlationId,
        eventType: event.eventType,
        payloadChecksum,
      },
    });
    await appendAudit(tx, {
      tenantId: property.tenantId,
      propertyId: event.propertyId,
      authorType: "INTEGRATION",
      authorId: event.edgeNodeId,
      eventType: event.eventType === "EDGE_AUDIT_EVENT" ? event.payload.eventName : `EDGE_${event.eventType}`,
      entityType,
      entityId,
      correlationId: event.correlationId,
      rawInputChecksum: payloadChecksum,
      modifiedTables,
      delta: {
        edgeEventId: event.edgeEventId,
        occurredAt: event.occurredAt,
        payload: event.payload,
      } as Prisma.InputJsonValue,
    });
    return { duplicate: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (!result.duplicate && event.eventType !== "EDGE_AUDIT_EVENT") {
    await publishEvent({
      type: event.eventType === "ROOM_STATE_UPDATE" ? "room.telemetry" : "task.updated",
      tenantId: (await prisma.property.findUniqueOrThrow({
        where: { id: event.propertyId },
        select: { tenantId: true },
      })).tenantId,
      propertyId: event.propertyId,
      entityId: event.eventType === "TASK_STATUS_UPDATE" ? event.payload.taskId : event.payload.roomNumber,
      occurredAt: event.occurredAt,
      payload: { ...event.payload, source: "EDGE_REPLAY", edgeNodeId: event.edgeNodeId },
    });
  }
  return reply.send({ success: true, duplicate: result.duplicate, edgeEventId: event.edgeEventId });
}
