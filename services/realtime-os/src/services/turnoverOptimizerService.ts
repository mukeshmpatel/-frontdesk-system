import { appendAudit } from "../audit.js";
import { config } from "../config.js";
import { prisma } from "../infrastructure.js";
import { publishEvent } from "../realtime.js";

type FlightTelemetry = {
  status: "LANDED" | "DELAYED" | "ON_TIME" | "EARLY" | "CANCELLED";
  estimatedArrivalTime: string;
};

async function fetchFlight(carrier: string, number: string): Promise<FlightTelemetry> {
  if (!config.FLIGHT_TRACKER_API_URL || !config.FLIGHT_TRACKER_API_KEY) {
    throw new Error("Flight tracking integration is not configured.");
  }
  const url = new URL(`/v1/flights/${encodeURIComponent(carrier)}/${encodeURIComponent(number)}`, config.FLIGHT_TRACKER_API_URL);
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${config.FLIGHT_TRACKER_API_KEY}` },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Flight tracker returned HTTP ${response.status}.`);
  const body = await response.json() as FlightTelemetry;
  if (!body.estimatedArrivalTime || !body.status) throw new Error("Flight telemetry response is incomplete.");
  return body;
}

export class TurnoverOptimizerService {
  static async optimizeHousekeepingQueue(): Promise<number> {
    const now = new Date();
    const end = new Date(now);
    end.setUTCHours(23, 59, 59, 999);
    const bookings = await prisma.booking.findMany({
      where: {
        status: "RESERVED",
        flightCarrier: { not: null },
        flightNumber: { not: null },
        roomId: { not: null },
        checkInAt: { lte: end },
      },
      take: 500,
    });
    let reprioritized = 0;
    for (const booking of bookings) {
      try {
        const flight = await fetchFlight(booking.flightCarrier!, booking.flightNumber!);
        const eta = new Date(flight.estimatedArrivalTime);
        if (Number.isNaN(eta.getTime())) throw new Error("Flight ETA is invalid.");
        await prisma.booking.update({
          where: { id: booking.id },
          data: { estimatedArrivalAt: eta, flightStatus: flight.status },
        });
        const earlyEnoughToPrioritize = flight.status === "LANDED"
          || flight.status === "EARLY"
          || eta.getTime() <= booking.checkInAt.getTime();
        if (!earlyEnoughToPrioritize) continue;
        const task = await prisma.internalTask.findFirst({
          where: {
            propertyId: booking.propertyId,
            roomId: booking.roomId,
            assignedRole: "HOUSEKEEPING",
            status: { in: ["PENDING", "DISPATCHED", "ACKNOWLEDGED"] },
          },
          orderBy: { createdAt: "desc" },
        });
        if (!task) continue;
        const dueAt = new Date(Math.min(task.dueAt.getTime(), Math.max(Date.now(), eta.getTime() - 60 * 60_000)));
        await prisma.$transaction(async (tx) => {
          await tx.internalTask.update({
            where: { id: task.id },
            data: { urgency: "CRITICAL", dueAt, lastActivityAt: now },
          });
          await appendAudit(tx, {
            tenantId: booking.tenantId,
            propertyId: booking.propertyId,
            authorType: "SYSTEM",
            authorId: "AAIQ-TURNOVER-OPTIMIZER",
            eventType: "HOUSEKEEPING_QUEUE_REPRIORITIZED",
            entityType: "TASK",
            entityId: task.id,
            correlationId: booking.correlationId,
            modifiedTables: ["bookings", "internal_tasks", "system_audit_trail"],
            delta: {
              bookingId: booking.id,
              flightStatus: flight.status,
              estimatedArrivalAt: eta.toISOString(),
              previousDueAt: task.dueAt.toISOString(),
              dueAt: dueAt.toISOString(),
            },
          });
        });
        await publishEvent({
          type: "task.updated",
          tenantId: booking.tenantId,
          propertyId: booking.propertyId,
          entityId: task.id,
          occurredAt: now.toISOString(),
          payload: { urgency: "CRITICAL", dueAt: dueAt.toISOString(), reason: "EARLY_GUEST_ARRIVAL" },
        });
        reprioritized += 1;
      } catch (error) {
        console.error("Turnover optimizer skipped booking", {
          bookingId: booking.id,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
    return reprioritized;
  }
}
