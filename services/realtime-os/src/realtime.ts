import type { WebSocket } from "ws";
import { redisPublisher, redisSubscriber } from "./infrastructure.js";

export type RealtimeEvent = {
  type: "task.created" | "task.updated" | "calendar.updated" | "reminder.created" | "reminder.triggered" | "alert.escalated" | "room.telemetry" | "inventory.updated";
  tenantId: string;
  propertyId: string;
  entityId: string;
  occurredAt: string;
  payload: Record<string, unknown>;
};

const sockets = new Map<string, Set<WebSocket>>();
const subscribed = new Set<string>();

function channel(tenantId: string, propertyId: string) {
  return `aaiq:${tenantId}:${propertyId}`;
}

export async function publishEvent(event: RealtimeEvent) {
  await redisPublisher.publish(channel(event.tenantId, event.propertyId), JSON.stringify(event));
}

export async function registerSocket(tenantId: string, propertyId: string, socket: WebSocket) {
  const key = channel(tenantId, propertyId);
  const group = sockets.get(key) ?? new Set<WebSocket>();
  group.add(socket); sockets.set(key, group);
  if (!subscribed.has(key)) {
    await redisSubscriber.subscribe(key); subscribed.add(key);
  }
  socket.on("close", () => {
    group.delete(socket);
    if (!group.size) sockets.delete(key);
  });
  socket.send(JSON.stringify({ type: "connection.ready", occurredAt: new Date().toISOString() }));
}

redisSubscriber.on("message", (key: string, payload: string) => {
  for (const socket of sockets.get(key) ?? []) {
    if (socket.readyState === socket.OPEN) socket.send(payload);
  }
});
