import { AssignedRole, Department, RoleTier } from "@prisma/client";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../infrastructure.js";
import { appendAudit } from "../audit.js";
import { publishEvent } from "../realtime.js";
import { hasRoleAccess } from "../middleware/authorizeRole.js";
import { ProcurementService } from "../services/procurementService.js";

const querySchema = z.object({ propertyId: z.string().uuid() });

function departmentRole(department: Department): AssignedRole | null {
  if (department === Department.FRONT_DESK) return AssignedRole.FRONT_DESK;
  if (department === Department.HOUSEKEEPING) return AssignedRole.HOUSEKEEPING;
  if (department === Department.MAINTENANCE) return AssignedRole.MAINTENANCE;
  if (department === Department.EXECUTIVE) return AssignedRole.MANAGEMENT;
  return null;
}

function actionType(department: Department) {
  if (department === Department.MAINTENANCE) return "REPAIR";
  if (department === Department.HOUSEKEEPING) return "ROOM_TURN";
  if (department === Department.FRONT_DESK) return "GUEST_SERVICE";
  return "EXECUTIVE_OVERRIDE";
}

export async function getNextActionToken(request: FastifyRequest, reply: FastifyReply) {
  const staff = request.authUser;
  const { propertyId } = querySchema.parse(request.query);
  const property = await prisma.property.findFirst({
    where: { id: propertyId, tenantId: staff.tenantId },
    select: { id: true },
  });
  if (!property) {
    return reply.code(404).send({
      error: { code: "PROPERTY_NOT_FOUND", message: "Property not found in this organization." },
    });
  }
  if (!staff.isAvailable || staff.workState !== "AVAILABLE") {
    return reply.send({
      success: true, activeTask: null,
      reason: staff.workState === "STALLED" ? "STAFF_STALLED" : "STAFF_UNAVAILABLE",
    });
  }

  const assignedRole = departmentRole(staff.department);
  if (!assignedRole) return reply.send({ success: true, activeTask: null });
  const task = await prisma.internalTask.findFirst({
    where: {
      propertyId,
      status: { in: ["PENDING", "DISPATCHED", "ACKNOWLEDGED", "IN_PROGRESS", "ESCALATED"] },
      ...(staff.department === Department.EXECUTIVE
        ? { urgency: "CRITICAL" }
        : {
          assignedRole,
          OR: [{ assignedUserId: staff.sub }, { assignedUserId: null }],
        }),
    },
    orderBy: [{ urgency: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      correlationId: true,
      title: true,
      description: true,
      urgency: true,
      status: true,
      assignedRole: true,
      dueAt: true,
      room: { select: { id: true, number: true } },
    },
  });
  if (!task) return reply.send({ success: true, activeTask: null });

  return reply.send({
    success: true,
    activeTask: {
      id: task.id,
      correlationId: task.correlationId,
      type: actionType(staff.department),
      target: task.room ? `Room ${task.room.number}` : "Property operations",
      title: task.title,
      details: task.description,
      urgency: task.urgency,
      status: task.status,
      assignedDepartment: task.assignedRole,
      dueAt: task.dueAt,
    },
  });
}

const actionSchema = z.object({ action: z.enum(["ACCEPT", "START", "COMPLETE"]) });

export async function updateTaskAction(request: FastifyRequest, reply: FastifyReply) {
  const staff = request.authUser;
  const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
  const { action } = actionSchema.parse(request.body);
  const task = await prisma.internalTask.findFirst({
    where: { id, property: { tenantId: staff.tenantId } },
    include: { property: { select: { tenantId: true } } },
  });
  if (!task) return reply.code(404).send({
    error: { code: "TASK_NOT_FOUND", message: "Task not found in this organization." },
  });
  const executiveOverride = hasRoleAccess(staff, [Department.EXECUTIVE], RoleTier.MANAGER);
  if (task.assignedUserId !== staff.sub && !executiveOverride) {
    return reply.code(403).send({
      error: { code: "TASK_NOT_ASSIGNED", message: "This task is assigned to another staff member." },
    });
  }
  const now = new Date();
  const status = action === "ACCEPT" ? "ACKNOWLEDGED"
    : action === "START" ? "IN_PROGRESS" : "COMPLETED";
  await prisma.$transaction(async (tx) => {
    await tx.internalTask.update({
      where: { id: task.id },
      data: {
        status,
        lastActivityAt: now,
        ...(action === "ACCEPT" ? { acknowledgedAt: now } : {}),
        ...(action === "COMPLETE" ? { completedAt: now } : {}),
      },
    });
    await appendAudit(tx, {
      tenantId: staff.tenantId, propertyId: task.propertyId,
      authorType: "USER", authorId: staff.sub,
      eventType: `TASK_${action}`, entityType: "TASK", entityId: task.id,
      correlationId: task.correlationId,
      modifiedTables: ["internal_tasks", "system_audit_trail"],
      delta: { fromStatus: task.status, toStatus: status, action },
    });
  });
  await publishEvent({
    type: "task.updated", tenantId: staff.tenantId,
    propertyId: task.propertyId, entityId: task.id,
    occurredAt: now.toISOString(), payload: { status, action, staffId: staff.sub },
  });
  if (action === "COMPLETE" && task.assignedRole === AssignedRole.HOUSEKEEPING) {
    await ProcurementService.processCompletedHousekeepingTask(task.id);
  }
  return reply.send({ success: true, taskId: task.id, status });
}
