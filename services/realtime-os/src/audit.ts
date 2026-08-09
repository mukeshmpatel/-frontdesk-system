import { Prisma, type SystemAuditTrail } from "@prisma/client";
import { checksum } from "./security.js";

type AuditInput = {
  tenantId: string;
  propertyId: string;
  authorType: "USER" | "SYSTEM" | "GUEST" | "HARDWARE" | "INTEGRATION";
  authorId: string;
  eventType: string;
  entityType: string;
  entityId: string;
  correlationId: string;
  redactedRawInput?: Prisma.InputJsonValue;
  rawInputChecksum?: string;
  llmConfidence?: number;
  modifiedTables: string[];
  delta: Prisma.InputJsonValue;
};

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function appendAudit(tx: Prisma.TransactionClient, input: AuditInput): Promise<SystemAuditTrail> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${input.tenantId}:${input.propertyId}`}))`;
  const previous = await tx.systemAuditTrail.findFirst({
    where: { tenantId: input.tenantId, propertyId: input.propertyId },
    orderBy: { createdAt: "desc" },
    select: { auditHash: true },
  });
  const createdAt = new Date();
  const auditHash = checksum(canonical({ ...input, previousAuditHash: previous?.auditHash ?? null, createdAt: createdAt.toISOString() }));
  return tx.systemAuditTrail.create({
    data: {
      tenantId: input.tenantId, propertyId: input.propertyId,
      authorType: input.authorType, authorId: input.authorId,
      eventType: input.eventType, entityType: input.entityType, entityId: input.entityId,
      correlationId: input.correlationId,
      ...(input.redactedRawInput !== undefined ? { redactedRawInput: input.redactedRawInput } : {}),
      ...(input.rawInputChecksum !== undefined ? { rawInputChecksum: input.rawInputChecksum } : {}),
      ...(input.llmConfidence !== undefined ? { llmConfidence: input.llmConfidence } : {}),
      modifiedTables: input.modifiedTables, delta: input.delta,
      ...(previous?.auditHash ? { previousAuditHash: previous.auditHash } : {}), auditHash, createdAt,
    },
  });
}
