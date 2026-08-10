import { Department, Prisma, RoomStatus } from "@prisma/client";
import { appendAudit } from "../audit.js";
import { prisma } from "../infrastructure.js";
import { publishEvent } from "../realtime.js";
import { checksum } from "../security.js";
import { HvacAutomationService } from "./hvacAutomationService.js";
import { selectNextWorker } from "./staffRoutingService.js";

export type RoomTurnSignal = {
  propertyId: string;
  providerEventId: string;
  roomNumber: string;
  eventType: "LOCK_OPENED" | "LOCK_CLOSED" | "GUEST_CHECKOUT_TRIGGER" | "KEY_TOKEN_EXPIRED" | "CHECKOUT_TIME_PASSED";
  occurredAt: Date;
};

export async function automateRoomTurn(signal: RoomTurnSignal) {
  const correlationId = crypto.randomUUID();
  const payloadChecksum = checksum(JSON.stringify(signal));
  const existing = await prisma.roomTelemetryEvent.findUnique({
    where: { providerEventId: signal.providerEventId },
    select: { id: true },
  });
  if (existing) return { duplicate: true as const, correlationId, stateChanged: false };

  try {
    const result = await prisma.$transaction(async (tx) => {
      const room = await tx.room.findFirst({
        where: { propertyId: signal.propertyId, number: signal.roomNumber, active: true },
        include: { property: { select: { tenantId: true, timezone: true } } },
      });
      if (!room) throw Object.assign(new Error("Room hardware mapping not found."), { statusCode: 404 });
      await tx.roomTelemetryEvent.create({
        data: {
          tenantId: room.property.tenantId, propertyId: signal.propertyId,
          roomId: room.id, correlationId, providerEventId: signal.providerEventId,
          eventType: signal.eventType, payloadChecksum, occurredAt: signal.occurredAt,
        },
      });
      const transitionSignal = ["GUEST_CHECKOUT_TRIGGER", "KEY_TOKEN_EXPIRED", "CHECKOUT_TIME_PASSED"].includes(signal.eventType);
      if (!transitionSignal) return { room, task: null, worker: null, transitioned: false };
      const booking = await tx.booking.findFirst({
        where: {
          propertyId: signal.propertyId, roomId: room.id,
          status: { in: ["RESERVED", "CHECKED_IN"] },
        },
        orderBy: { checkOutAt: "desc" },
      });
      const expiryConfirmed = signal.eventType === "GUEST_CHECKOUT_TRIGGER"
        || Boolean(booking && (
          booking.checkOutAt <= signal.occurredAt
          || (booking.nfcKeyExpiresAt && booking.nfcKeyExpiresAt <= signal.occurredAt)
        ));
      if (!expiryConfirmed) return { room, task: null, worker: null, transitioned: false };

      await tx.room.update({ where: { id: room.id }, data: { status: RoomStatus.DIRTY } });
      if (booking) {
        await tx.booking.update({
          where: { id: booking.id },
          data: { status: "CHECKED_OUT", nfcKeyExpiresAt: signal.occurredAt },
        });
      }
      const worker = await selectNextWorker(tx, {
        tenantId: room.property.tenantId,
        department: Department.HOUSEKEEPING,
        roomId: room.id,
      });
      const task = await tx.internalTask.create({
        data: {
          propertyId: signal.propertyId, correlationId, roomId: room.id,
          title: `Automated room turn: Room ${room.number}`,
          description: "Verified checkout or key expiration changed the room to DIRTY and initiated housekeeping dispatch.",
          assignedRole: "HOUSEKEEPING", assignedUserId: worker?.id ?? null,
          urgency: "MEDIUM", status: worker ? "DISPATCHED" : "PENDING",
          dueAt: new Date(signal.occurredAt.getTime() + 15 * 60_000),
        },
      });
      await appendAudit(tx, {
        tenantId: room.property.tenantId, propertyId: signal.propertyId,
        authorType: "SYSTEM", authorId: "AAIQ-ROOM-AUTOMATION",
        eventType: "ROOM_CHECKOUT_AUTOMATION", entityType: "ROOM", entityId: room.id,
        correlationId, rawInputChecksum: payloadChecksum,
        modifiedTables: ["room_telemetry_events", "rooms", "bookings", "internal_tasks", "system_audit_trail"],
        delta: {
          eventType: signal.eventType, roomStatus: RoomStatus.DIRTY,
          bookingId: booking?.id ?? null, taskId: task.id,
          assignedUserId: worker?.id ?? null,
        },
      });
      return { room, task, worker, transitioned: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (!result.transitioned || !result.task) {
      return { duplicate: false as const, correlationId, stateChanged: false };
    }
    await publishEvent({
      type: "task.created", tenantId: result.room.property.tenantId,
      propertyId: signal.propertyId, entityId: result.task.id,
      occurredAt: new Date().toISOString(),
      payload: {
        roomId: result.room.id, roomNumber: result.room.number,
        assignedUserId: result.worker?.id ?? null, source: signal.eventType,
      },
    });
    await publishEvent({
      type: "room.telemetry",
      tenantId: result.room.property.tenantId,
      propertyId: signal.propertyId,
      entityId: result.room.id,
      occurredAt: new Date().toISOString(),
      payload: {
        roomNumber: result.room.number,
        status: RoomStatus.DIRTY,
        climateProfile: result.room.thermostatId ? "ECO_MODE_PENDING" : result.room.climateProfile,
      },
    });
    if (result.room.thermostatId) {
      const climate = await HvacAutomationService.adjustRoomClimateProfile({
        thermostatId: result.room.thermostatId, roomNumber: result.room.number,
        mode: "ECO_MODE", propertyTimezone: result.room.property.timezone,
      });
      await prisma.$transaction(async (tx) => {
        if (climate.success) {
          await tx.room.update({
            where: { id: result.room.id },
            data: { climateProfile: "ECO_MODE", currentTemp: climate.targetTemp },
          });
        }
        await appendAudit(tx, {
          tenantId: result.room.property.tenantId, propertyId: signal.propertyId,
          authorType: "SYSTEM", authorId: "AAIQ-HVAC-AUTOMATION",
          eventType: climate.success ? "ROOM_ECO_MODE_APPLIED" : "ROOM_ECO_MODE_DEFERRED",
          entityType: "ROOM", entityId: result.room.id, correlationId,
          modifiedTables: climate.success ? ["rooms", "system_audit_trail"] : ["system_audit_trail"],
          delta: {
            climateProfile: "ECO_MODE", targetTemp: climate.targetTemp,
            status: climate.status, ...(!climate.success ? { reason: climate.reason } : {}),
          },
        });
      });
    }
    return {
      duplicate: false as const, correlationId, stateChanged: true,
      taskId: result.task.id, assignedUserId: result.worker?.id ?? null,
    };
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { duplicate: true as const, correlationId, stateChanged: false };
    }
    throw error;
  }
}
