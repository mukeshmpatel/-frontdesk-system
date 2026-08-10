import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../infrastructure.js";

export async function getPropertyLiveGrid(request: FastifyRequest, reply: FastifyReply) {
  const { propertyId } = z.object({ propertyId: z.string().uuid() }).parse(request.query);
  const property = await prisma.property.findFirst({
    where: { id: propertyId, tenantId: request.authUser.tenantId },
    select: {
      id: true,
      name: true,
      timezone: true,
      rooms: {
        where: { active: true },
        orderBy: [{ floor: "asc" }, { number: "asc" }],
        select: {
          id: true,
          number: true,
          floor: true,
          status: true,
          currentTemp: true,
          climateProfile: true,
          currentStaff: {
            where: { active: true },
            select: {
              id: true,
              displayName: true,
              department: true,
              workState: true,
              currentLatitude: true,
              currentLongitude: true,
              lastLocationAt: true,
            },
          },
          tasks: {
            where: { status: { in: ["PENDING", "DISPATCHED", "ACKNOWLEDGED", "IN_PROGRESS", "ESCALATED"] } },
            orderBy: [{ urgency: "desc" }, { createdAt: "asc" }],
            take: 1,
            select: { id: true, title: true, urgency: true, status: true, assignedUserId: true },
          },
        },
      },
    },
  });
  if (!property) return reply.code(404).send({
    error: { code: "PROPERTY_NOT_FOUND", message: "Property not found in this organization." },
  });
  return reply.send({
    propertyId: property.id,
    propertyName: property.name,
    timezone: property.timezone,
    generatedAt: new Date().toISOString(),
    rooms: property.rooms.map((room) => ({
      ...room,
      currentTemp: room.currentTemp ? Number(room.currentTemp) : null,
      activeTask: room.tasks[0] ?? null,
      activeWorkers: room.currentStaff.map((worker) => ({
        ...worker,
        currentLatitude: worker.currentLatitude ? Number(worker.currentLatitude) : null,
        currentLongitude: worker.currentLongitude ? Number(worker.currentLongitude) : null,
      })),
      tasks: undefined,
      currentStaff: undefined,
    })),
  });
}
