import { prisma } from "./infrastructure.js";
import type { AuthUser } from "./contracts.js";
import { Department, RoleTier } from "@prisma/client";
import { hasRoleAccess } from "./middleware/authorizeRole.js";

export type Metric = { id: string; label: string; value: number; unit: string; drillDownToken: string; recordIds: string[] };

async function token(user: AuthUser, propertyId: string, metricType: string, recordIds: string[], fromAt: Date, toAt: Date) {
  return prisma.reportDrilldownToken.create({
    data: { tenantId: user.tenantId, propertyId, userId: user.sub, metricType, recordIds, fromAt, toAt, expiresAt: new Date(Date.now() + 30 * 60_000) },
    select: { token: true },
  });
}

export async function summary(user: AuthUser, propertyId: string, fromAt: Date, toAt: Date) {
  const property = await prisma.property.findFirst({ where: { id: propertyId, tenantId: user.tenantId }, select: { name: true } });
  if (!property) throw Object.assign(new Error("Property not found."), { statusCode: 404 });
  const [tasks, incidents, maintenance, reminders] = await Promise.all([
    prisma.internalTask.findMany({ where: { propertyId, createdAt: { gte: fromAt, lt: toAt } }, select: { id: true, status: true, createdAt: true, completedAt: true } }),
    prisma.internalTask.findMany({ where: { propertyId, createdAt: { gte: fromAt, lt: toAt }, urgency: "CRITICAL" }, select: { id: true } }),
    prisma.internalTask.findMany({ where: { propertyId, assignedRole: "MAINTENANCE", status: { notIn: ["COMPLETED", "CANCELLED"] } }, select: { id: true } }),
    prisma.reminder.findMany({ where: { propertyId, targetTime: { gte: fromAt, lt: toAt } }, select: { id: true, status: true } }),
  ]);
  const completed = tasks.filter((task) => task.completedAt);
  const resolutionHours = completed.length ? completed.reduce((sum, task) => sum + ((task.completedAt!.getTime() - task.createdAt.getTime()) / 3_600_000), 0) / completed.length : 0;
  const definitions = [
    { id: "tasks-completed", label: "Tasks completed", value: completed.length, unit: "tasks", ids: completed.map(({ id }) => id) },
    { id: "open-maintenance", label: "Pending maintenance", value: maintenance.length, unit: "requests", ids: maintenance.map(({ id }) => id) },
    { id: "critical-incidents", label: "Critical incidents", value: incidents.length, unit: "incidents", ids: incidents.map(({ id }) => id) },
    { id: "resolution-velocity", label: "Resolution velocity", value: Number(resolutionHours.toFixed(1)), unit: "hours", ids: completed.map(({ id }) => id) },
    { id: "active-reminders", label: "Active reminders", value: reminders.filter(({ status }) => status !== "COMPLETED").length, unit: "reminders", ids: reminders.map(({ id }) => id) },
  ];
  const metrics: Metric[] = await Promise.all(definitions.map(async (item) => ({
    id: item.id, label: item.label, value: item.value, unit: item.unit, recordIds: item.ids,
    drillDownToken: (await token(user, propertyId, item.id, item.ids, fromAt, toAt)).token,
  })));
  return { property: property.name, from: fromAt.toISOString(), to: toAt.toISOString(), generatedAt: new Date().toISOString(), metrics };
}

export async function drilldown(user: AuthUser, tokenValue: string) {
  const token = await prisma.reportDrilldownToken.findFirst({
    where: { token: tokenValue, tenantId: user.tenantId, userId: user.sub, expiresAt: { gt: new Date() } },
  });
  if (!token) throw Object.assign(new Error("Drill-down token is invalid or expired."), { statusCode: 410 });
  if (token.metricType === "active-reminders") {
    return prisma.reminder.findMany({
      where: { propertyId: token.propertyId, id: { in: token.recordIds } },
      select: { id: true, title: true, description: true, targetTime: true, urgency: true, status: true, createdAt: true },
      orderBy: { targetTime: "desc" },
    });
  }
  return prisma.internalTask.findMany({
    where: { propertyId: token.propertyId, id: { in: token.recordIds } },
    select: { id: true, title: true, description: true, assignedRole: true, urgency: true, status: true, dueAt: true, acknowledgedAt: true, completedAt: true, createdAt: true, room: { select: { number: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function correlationDrilldown(user: AuthUser, correlationId: string) {
  if (!hasRoleAccess(user, [Department.EXECUTIVE], RoleTier.MANAGER)) {
    throw Object.assign(new Error("Management access is required for correlation drill-down."), { statusCode: 403 });
  }
  const anchor = await prisma.systemAuditTrail.findFirst({
    where: { tenantId: user.tenantId, correlationId },
    select: { propertyId: true },
    orderBy: { createdAt: "asc" },
  });
  if (!anchor) throw Object.assign(new Error("Correlation record not found."), { statusCode: 404 });

  const scope = { propertyId: anchor.propertyId, correlationId };
  const [communications, audit, tasks, bookings, charges, escalations, telemetry] = await Promise.all([
    prisma.communicationIntake.findMany({
      where: scope,
      select: {
        id: true, sourceType: true, redactedInput: true, rawInputChecksum: true,
        intent: true, title: true, description: true, confidence: true, model: true,
        executedEntityType: true, executedEntityId: true, createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.systemAuditTrail.findMany({
      where: { tenantId: user.tenantId, ...scope },
      select: {
        id: true, authorType: true, authorId: true, eventType: true, entityType: true,
        entityId: true, llmConfidence: true, modifiedTables: true, delta: true,
        auditHash: true, previousAuditHash: true, createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.internalTask.findMany({
      where: scope,
      select: {
        id: true, title: true, description: true, assignedRole: true, assignedUserId: true,
        urgency: true, status: true, dueAt: true, acknowledgedAt: true, completedAt: true,
        createdAt: true, updatedAt: true, room: { select: { id: true, number: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.booking.findMany({
      where: scope,
      include: { folioCharges: { orderBy: { postedAt: "asc" } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.folioCharge.findMany({
      where: scope,
      orderBy: { postedAt: "asc" },
    }),
    prisma.taskEscalationLog.findMany({
      where: scope,
      include: {
        previousStaff: { select: { id: true, displayName: true, department: true, tier: true } },
        newStaff: { select: { id: true, displayName: true, department: true, tier: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.roomTelemetryEvent.findMany({
      where: scope,
      include: { room: { select: { id: true, number: true, status: true, climateProfile: true } } },
      orderBy: { occurredAt: "asc" },
    }),
  ]);

  return {
    correlationId,
    propertyId: anchor.propertyId,
    communicationHistory: communications,
    aiParsing: communications.map((item) => ({
      intakeId: item.id, intent: item.intent, confidence: Number(item.confidence),
      model: item.model, rawInputChecksum: item.rawInputChecksum,
    })),
    employeeAuditHistory: audit.filter((entry) => entry.authorType === "USER" || entry.entityType === "TASK"),
    escalationHistory: escalations,
    telemetryHistory: telemetry,
    finalStateModifications: { tasks, bookings, folioCharges: charges },
    immutableAuditChain: audit,
  };
}
