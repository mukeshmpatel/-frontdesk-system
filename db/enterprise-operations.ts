import { env } from "cloudflare:workers";
import { emitReportEvent } from "./reporting-layer";
import { authorizedPropertyList, authorizedPropertyScope } from "./property-scope";

const RECORD_TYPES = new Set(["INCIDENT", "PET", "GUEST_REQUEST", "HANDOFF", "LOST_FOUND", "AUDIT_EXCEPTION"]);
const PRIORITIES = new Set(["LOW", "NORMAL", "HIGH", "CRITICAL"]);
const STATUSES = new Set(["RECEIVED", "ACKNOWLEDGED", "IN_PROGRESS", "BLOCKED", "AWAITING_VERIFICATION", "COMPLETED", "VERIFIED", "CLOSED", "CANCELLED"]);
const TRANSITIONS: Record<string, string[]> = {
  RECEIVED: ["ACKNOWLEDGED", "IN_PROGRESS", "CANCELLED"],
  ACKNOWLEDGED: ["IN_PROGRESS", "BLOCKED", "CANCELLED"],
  IN_PROGRESS: ["BLOCKED", "AWAITING_VERIFICATION", "COMPLETED"],
  BLOCKED: ["IN_PROGRESS", "CANCELLED"],
  AWAITING_VERIFICATION: ["IN_PROGRESS", "VERIFIED"],
  COMPLETED: ["VERIFIED", "CLOSED", "IN_PROGRESS"],
  VERIFIED: ["CLOSED", "IN_PROGRESS"],
  CLOSED: [],
  CANCELLED: [],
};

function db(): D1Database {
  if (!env.DB) throw new Error("AAIQ enterprise operations storage is unavailable.");
  return env.DB;
}

async function ensureTables() {
  db();
}

async function contextFor(userEmail: string) {
  await ensureTables();
  const scope = await authorizedPropertyScope(userEmail);
  return scope ? { context: scope.context, property: scope.property } : null;
}

async function allowedProperty(context: any, propertyId?: string | null) {
  const scope = await authorizedPropertyScope(context.email, propertyId);
  return scope?.property ?? null;
}

export async function enterpriseOperations(userEmail: string, propertyId?: string | null) {
  const base = await contextFor(userEmail);
  if (!base) return null;
  const property = await allowedProperty(base.context, propertyId) ?? base.property;
  if (!property) return { forbidden: true };
  const propertyList = await authorizedPropertyList(userEmail);
  const [records, history, exceptions] = await Promise.all([
    db().prepare(`SELECT * FROM front_desk_operational_records WHERE organization_id=? AND property_id=?
      ORDER BY CASE priority WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'NORMAL' THEN 2 ELSE 3 END,
      CASE status WHEN 'RECEIVED' THEN 0 WHEN 'ACKNOWLEDGED' THEN 1 WHEN 'IN_PROGRESS' THEN 2 WHEN 'BLOCKED' THEN 3 ELSE 4 END,
      COALESCE(due_at,created_at),created_at DESC LIMIT 500`)
      .bind(base.context.organizationId, property.id).all<any>(),
    db().prepare(`SELECT * FROM operational_status_history WHERE organization_id=? AND property_id=?
      ORDER BY created_at DESC LIMIT 250`).bind(base.context.organizationId, property.id).all<any>(),
    db().prepare(`SELECT * FROM automation_exceptions WHERE organization_id=? AND property_id=? AND status!='CLOSED'
      ORDER BY CASE severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 ELSE 2 END,created_at`)
      .bind(base.context.organizationId, property.id).all<any>(),
  ]);
  const rows = records.results as any[];
  const open = rows.filter(row => !["CLOSED", "CANCELLED"].includes(row.status));
  return {
    role: base.context.role,
    currentUser: { email: base.context.email, displayName: base.context.displayName },
    property,
    properties: propertyList?.properties ?? [property],
    records: rows.map(row => ({ ...row, details: JSON.parse(row.details_json || "{}") })),
    history: history.results,
    exceptions: exceptions.results.map(row => ({
      ...row,
      extracted: JSON.parse(String((row as any).extracted_json || "{}")),
      missingFields: JSON.parse(String((row as any).missing_fields_json || "[]")),
    })),
    metrics: {
      open: open.length,
      critical: open.filter(row => row.priority === "CRITICAL").length,
      incidents: open.filter(row => row.record_type === "INCIDENT").length,
      pets: open.filter(row => row.record_type === "PET").length,
      requests: open.filter(row => row.record_type === "GUEST_REQUEST").length,
      overdue: open.filter(row => row.due_at && new Date(row.due_at).getTime() < Date.now()).length,
      awaitingVerification: open.filter(row => ["AWAITING_VERIFICATION", "COMPLETED"].includes(row.status)).length,
      exceptions: exceptions.results.length,
    },
  };
}

export async function switchPropertyContext(userEmail: string, propertyId: string) {
  const base = await contextFor(userEmail);
  if (!base) return null;
  const property = await allowedProperty(base.context, clean(propertyId, 80));
  if (!property) return { forbidden: true };
  const now = new Date().toISOString();
  const eventId = crypto.randomUUID();
  await db().batch([
    db().prepare(`INSERT INTO user_context_preferences
      (id,organization_id,user_email,active_property_id,active_location_type,active_location_id,updated_at)
      VALUES (?,?,?,?,'PROPERTY',?,?)
      ON CONFLICT(organization_id,user_email) DO UPDATE SET
      active_property_id=excluded.active_property_id,active_location_type='PROPERTY',
      active_location_id=excluded.active_location_id,updated_at=excluded.updated_at`)
      .bind(crypto.randomUUID(), base.context.organizationId, base.context.email, property.id, property.id, now),
    db().prepare(`INSERT INTO domain_outbox_events
      (id,organization_id,property_id,event_type,entity_type,entity_id,idempotency_key,payload_json,status,occurred_at,processed_at)
      VALUES (?,?,?,'user.property_context.changed','property_context',?,?,?,'PENDING',?,NULL)`)
      .bind(eventId, base.context.organizationId, property.id, property.id,
        `user.property_context.changed:${base.context.email}:${now}`,
        JSON.stringify({ userEmail: base.context.email, propertyId: property.id, propertyCode: property.code }), now),
  ]);
  return { property: { id: property.id, code: property.code, name: property.name, address: property.address }, eventId };
}

function clean(value: unknown, length = 500) {
  return String(value ?? "").trim().slice(0, length);
}

function validateRecord(input: any) {
  const recordType = clean(input.recordType, 40).toUpperCase();
  if (!RECORD_TYPES.has(recordType)) throw new Error("Choose a supported front-desk record type.");
  const title = clean(input.title, 180);
  if (!title) throw new Error("Title is required.");
  if (["INCIDENT", "PET", "GUEST_REQUEST"].includes(recordType) && !clean(input.roomNumber, 30)) {
    throw new Error("Room or location is required for this record type.");
  }
  if (recordType === "INCIDENT" && !clean(input.description, 4000)) throw new Error("Incident chronology is required.");
  if (recordType === "PET" && !clean(input.guestReference, 120)) throw new Error("Guest reference is required for a pet record.");
  if (recordType === "GUEST_REQUEST" && Number(input.quantity || 0) < 1) throw new Error("Request quantity must be at least one.");
  return { recordType, title };
}

export async function createOperationalRecord(userEmail: string, input: any) {
  const base = await contextFor(userEmail);
  if (!base) return null;
  const property = await allowedProperty(base.context, input.propertyId);
  if (!property) return { forbidden: true };
  const { recordType, title } = validateRecord(input);
  const priority = PRIORITIES.has(clean(input.priority, 20).toUpperCase()) ? clean(input.priority, 20).toUpperCase() : "NORMAL";
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const correlationId = crypto.randomUUID();
  const due = input.dueAt && !Number.isNaN(new Date(input.dueAt).getTime()) ? new Date(input.dueAt).toISOString() : null;
  const details = {
    animalType: clean(input.animalType, 40), petCount: Number(input.petCount || 0) || null,
    serviceAnimal: Boolean(input.serviceAnimal), feePostingStatus: clean(input.feePostingStatus, 40),
    incidentSeverity: clean(input.incidentSeverity, 30), emergencyServices: Boolean(input.emergencyServices),
    witnesses: clean(input.witnesses, 1200), immediateActions: clean(input.immediateActions, 2000),
    requestItem: clean(input.requestItem, 120), promiseTime: clean(input.promiseTime, 80),
    visibility: clean(input.visibility, 40) || "DEPARTMENT",
  };
  const eventType = recordType === "INCIDENT" ? "front_desk.incident.created"
    : recordType === "PET" ? "front_desk.pet.registered"
      : recordType === "GUEST_REQUEST" ? "guest.request.created"
        : `front_desk.${recordType.toLowerCase()}.created`;
  await db().batch([
    db().prepare(`INSERT INTO front_desk_operational_records
      (id,organization_id,property_id,correlation_id,record_type,category,title,description,room_number,
       guest_reference,reservation_reference,priority,status,assigned_department,assigned_to,quantity,unit_cost_cents,
       fee_cents,due_at,acknowledged_at,started_at,completed_at,verified_at,closed_at,source_type,source_reference,
       details_json,ai_status,ai_confidence,ai_explanation,created_by,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'RECEIVED',?,?,?,?,?,?,NULL,NULL,NULL,NULL,NULL,?,?,?,?,?,?,?,?)`)
      .bind(id, base.context.organizationId, property.id, correlationId, recordType, clean(input.category, 80) || recordType,
        title, clean(input.description, 4000), clean(input.roomNumber, 30) || null, clean(input.guestReference, 120) || null,
        clean(input.reservationReference, 120) || null, priority, clean(input.assignedDepartment, 60) || "FRONT_DESK",
        clean(input.assignedTo, 180) || null, Number(input.quantity || 0) || null, Number(input.unitCostCents || 0) || null,
        Number(input.feeCents || 0) || null, due, clean(input.sourceType, 40) || "MANUAL",
        clean(input.sourceReference, 300) || null, JSON.stringify(details), "READY_FOR_AUTOMATION",
        input.aiConfidence == null ? null : Number(input.aiConfidence), clean(input.aiExplanation, 1000) || null,
        base.context.email, now, now),
    db().prepare(`INSERT INTO operational_status_history
      (id,organization_id,property_id,entity_type,entity_id,from_status,to_status,reason_code,note,actor_email,created_at)
      VALUES (?,?,?,?,?,NULL,'RECEIVED','CREATED',?,?,?)`)
      .bind(crypto.randomUUID(), base.context.organizationId, property.id, "front_desk_record", id,
        "Record created and validated.", base.context.email, now),
    db().prepare(`INSERT INTO domain_outbox_events
      (id,organization_id,property_id,event_type,entity_type,entity_id,idempotency_key,payload_json,status,occurred_at,processed_at)
      VALUES (?,?,?,?,?,?,?,?, 'PENDING',?,NULL)`)
      .bind(crypto.randomUUID(), base.context.organizationId, property.id, eventType, "front_desk_record", id,
        `${eventType}:${id}`, JSON.stringify({ correlationId, recordType, priority, roomNumber: clean(input.roomNumber, 30) }), now),
  ]);
  await emitReportEvent({
    organizationId: base.context.organizationId, propertyId: property.id, sourceModule: "FRONT_DESK", eventType: eventType.toUpperCase().replaceAll(".", "_"),
    entityType: "front_desk_record", entityId: id, idempotencyKey: `${eventType}:${id}:report`, occurredAt: now,
    payload: { propertyId: property.id, correlationId, recordType, priority },
    facts: [{ factType: recordType.toLowerCase(), entityType: "front_desk_record", entityId: id,
      sourceTable: "front_desk_operational_records", sourceRecordId: id, department: "FRONT_DESK",
      roomReference: clean(input.roomNumber, 30), status: "RECEIVED", occurredAt: now }],
  });
  return { id, correlationId, eventType };
}

export async function transitionOperationalRecord(userEmail: string, input: any) {
  const base = await contextFor(userEmail);
  if (!base) return null;
  const current = await db().prepare(`SELECT * FROM front_desk_operational_records
    WHERE id=? AND organization_id=?`).bind(clean(input.id, 80), base.context.organizationId).first<any>();
  if (!current) throw new Error("Operational record was not found.");
  const property = await allowedProperty(base.context, current.property_id);
  if (!property) return { forbidden: true };
  const toStatus = clean(input.status, 40).toUpperCase();
  if (!STATUSES.has(toStatus)) throw new Error("Choose a valid workflow status.");
  if (!(TRANSITIONS[current.status] ?? []).includes(toStatus)) throw new Error(`Cannot move ${current.status} directly to ${toStatus}.`);
  const reason = clean(input.reasonCode, 80);
  if (["BLOCKED", "CANCELLED"].includes(toStatus) && !reason) throw new Error("A reason code is required for blocked or cancelled work.");
  if (toStatus === "VERIFIED" && base.context.role !== "admin") throw new Error("Supervisor or administrator verification is required.");
  const now = new Date().toISOString();
  const timestamps: Record<string, string | null> = {
    acknowledged_at: toStatus === "ACKNOWLEDGED" ? now : current.acknowledged_at,
    started_at: toStatus === "IN_PROGRESS" && !current.started_at ? now : current.started_at,
    completed_at: toStatus === "COMPLETED" ? now : current.completed_at,
    verified_at: toStatus === "VERIFIED" ? now : current.verified_at,
    closed_at: toStatus === "CLOSED" ? now : current.closed_at,
  };
  const eventType = `front_desk.${current.record_type.toLowerCase()}.${toStatus.toLowerCase()}`;
  await db().batch([
    db().prepare(`UPDATE front_desk_operational_records SET status=?,assigned_to=COALESCE(?,assigned_to),
      acknowledged_at=?,started_at=?,completed_at=?,verified_at=?,closed_at=?,updated_at=? WHERE id=? AND organization_id=?`)
      .bind(toStatus, clean(input.assignedTo, 180) || null, timestamps.acknowledged_at, timestamps.started_at,
        timestamps.completed_at, timestamps.verified_at, timestamps.closed_at, now, current.id, base.context.organizationId),
    db().prepare(`INSERT INTO operational_status_history
      (id,organization_id,property_id,entity_type,entity_id,from_status,to_status,reason_code,note,actor_email,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(), base.context.organizationId, property.id, "front_desk_record", current.id,
        current.status, toStatus, reason || null, clean(input.note, 1000), base.context.email, now),
    db().prepare(`INSERT INTO domain_outbox_events
      (id,organization_id,property_id,event_type,entity_type,entity_id,idempotency_key,payload_json,status,occurred_at,processed_at)
      VALUES (?,?,?,?,?,?,?,?, 'PENDING',?,NULL)`)
      .bind(crypto.randomUUID(), base.context.organizationId, property.id, eventType, "front_desk_record", current.id,
        `${eventType}:${current.id}:${now}`, JSON.stringify({ from: current.status, to: toStatus, reason }), now),
  ]);
  await emitReportEvent({
    organizationId: base.context.organizationId, propertyId: property.id, sourceModule: "FRONT_DESK",
    eventType: eventType.toUpperCase().replaceAll(".", "_"), entityType: "front_desk_record",
    entityId: current.id, idempotencyKey: `${eventType}:${current.id}:${now}:report`, occurredAt: now,
    payload: { propertyId: property.id, from: current.status, to: toStatus, reason },
  });
  return { id: current.id, status: toStatus };
}

export async function createPropertyContext(userEmail: string, input: any) {
  const base = await contextFor(userEmail);
  if (!base || base.context.role !== "admin") return null;
  const code = clean(input.code, 30).toUpperCase().replace(/[^A-Z0-9-]/g, "");
  const name = clean(input.name, 140);
  if (!code || !name) throw new Error("Property code and official name are required.");
  const databaseMode = clean(input.databaseMode, 30).toUpperCase() === "DEDICATED_DATABASE" ? "DEDICATED_DATABASE" : "SHARED_SCHEMA";
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const status = databaseMode === "DEDICATED_DATABASE" && !clean(input.databaseBinding, 80) ? "CONFIGURATION_REQUIRED" : "ACTIVE";
  await db().batch([
    db().prepare(`INSERT INTO property_contexts
      (id,organization_id,code,name,address,timezone,database_mode,database_binding,status,created_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id, base.context.organizationId, code, name, clean(input.address, 300), clean(input.timezone, 80) || "America/Chicago",
        databaseMode, clean(input.databaseBinding, 80) || null, status, base.context.email, now, now),
    db().prepare(`INSERT INTO property_assignments
      (id,organization_id,property_id,user_email,department,role_label,is_default,status,created_at)
      VALUES (?,?,?,?,?,?,0,'ACTIVE',?)`)
      .bind(crypto.randomUUID(), base.context.organizationId, id, base.context.email, "EXECUTIVE", "Administrator", now),
    db().prepare(`INSERT INTO domain_outbox_events
      (id,organization_id,property_id,event_type,entity_type,entity_id,idempotency_key,payload_json,status,occurred_at,processed_at)
      VALUES (?,?,?,'property.created','property',?,?,?, 'PENDING',?,NULL)`)
      .bind(crypto.randomUUID(), base.context.organizationId, id, id, `property.created:${id}`,
        JSON.stringify({ code, name, databaseMode, status }), now),
  ]);
  return { id, status, databaseMode, manualAction: status === "CONFIGURATION_REQUIRED"
    ? "Provision a dedicated database binding and run the tenant migration before activation." : null };
}
