import { timingSafeEqual } from "node:crypto";
import Fastify from "fastify";
import { z } from "zod";
import { createConfiguredOfflineSyncService, type EdgeEvent } from "./services/offlineSyncService.js";

const env = z.object({
  EDGE_LOCAL_API_KEY: z.string().min(32),
  EDGE_BIND_HOST: z.string().default("127.0.0.1"),
  EDGE_PORT: z.coerce.number().int().min(1).max(65_535).default(4020),
}).parse(process.env);
const service = createConfiguredOfflineSyncService();
const app = Fastify({ logger: true, bodyLimit: 512 * 1024 });

function authorized(value: unknown) {
  if (typeof value !== "string") return false;
  const supplied = Buffer.from(value);
  const expected = Buffer.from(env.EDGE_LOCAL_API_KEY);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

app.addHook("preHandler", async (request, reply) => {
  if (request.url === "/healthz") return;
  if (!authorized(request.headers["x-edge-local-key"])) {
    return reply.code(403).send({ error: "Invalid local edge credential." });
  }
});

app.get("/healthz", async () => ({ status: "HEALTHY", ...service.getLocalStatus() }));

app.get("/v1/rooms/:propertyId/:roomNumber", async (request, reply) => {
  const params = z.object({
    propertyId: z.string().uuid(),
    roomNumber: z.string().min(1).max(20),
  }).parse(request.params);
  const room = service.getCachedRoomState(params.propertyId, params.roomNumber);
  return room ? reply.send(room) : reply.code(404).send({ error: "Room is not available in the local cache." });
});

const eventSchema = z.object({
  propertyId: z.string().uuid(),
  correlationId: z.string().uuid().optional(),
  occurredAt: z.string().datetime().optional(),
  event: z.discriminatedUnion("eventType", [
    z.object({
      eventType: z.literal("ROOM_STATE_UPDATE"),
      payload: z.object({
        roomNumber: z.string().min(1).max(20),
        status: z.enum(["VACANT", "CLEAN", "DIRTY", "OCCUPIED", "OUT_OF_ORDER"]),
        currentTemp: z.number().min(40).max(100).nullable().optional(),
        climateProfile: z.enum(["COMFORT", "ECO_MODE"]).optional(),
      }),
    }),
    z.object({
      eventType: z.literal("TASK_STATUS_UPDATE"),
      payload: z.object({
        taskId: z.string().uuid(),
        status: z.enum(["ACKNOWLEDGED", "IN_PROGRESS", "COMPLETED"]),
      }),
    }),
    z.object({
      eventType: z.literal("EDGE_AUDIT_EVENT"),
      payload: z.object({
        eventName: z.string().min(1).max(80),
        entityType: z.string().min(1).max(80),
        entityId: z.string().min(1).max(160),
        delta: z.record(z.unknown()),
      }),
    }),
  ]),
});

app.post("/v1/events", async (request, reply) => {
  const input = eventSchema.parse(request.body);
  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
  const event = input.event as EdgeEvent;
  if (event.eventType === "ROOM_STATE_UPDATE") {
    service.cacheRoomState(input.propertyId, event.payload.roomNumber, event.payload, occurredAt);
  }
  const eventId = service.queueOperation(
    input.propertyId,
    event,
    input.correlationId ?? crypto.randomUUID(),
    occurredAt,
  );
  return reply.code(202).send({ accepted: true, eventId, offlineStored: true });
});

const timer = setInterval(() => void service.monitorCloudConnectivityLoop(), 10_000);
await service.monitorCloudConnectivityLoop();
await app.listen({ host: env.EDGE_BIND_HOST, port: env.EDGE_PORT });

const shutdown = async () => {
  clearInterval(timer);
  await app.close();
  service.close();
};
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
