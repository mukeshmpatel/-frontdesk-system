import { env } from "cloudflare:workers";
import { activeStaffContext } from "./staff";
import { emitReportEvent } from "./reporting-layer";
import { recordSystemAudit, sha256 } from "./platform-controls";
import { authorizedPropertyScope } from "./property-scope";
import {
  decideHousekeepingInspection,
  HOUSEKEEPING_POLICY_VERSION,
  parseDepartureReport,
  planHousekeepingAssignments,
  REQUIRED_HOUSEKEEPING_EVIDENCE,
  type HousekeeperCandidate,
  type PlannedAssignment,
} from "../lib/housekeeping-departure-engine";

type StaffContext = Awaited<ReturnType<typeof activeStaffContext>> extends infer T ? Exclude<T, null> : never;
type Scope = {
  context: StaffContext;
  property: Record<string, any>;
  assignmentDepartment: string;
  assignmentRole: string;
  canManage: boolean;
};

function database(): D1Database {
  if (!env.DB) throw new Error("Housekeeping workflow storage is unavailable.");
  return env.DB;
}

function propertyDate(timezone: string, at = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone || "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

async function scopeFor(email: string, requestedPropertyId?: string | null): Promise<Scope | null> {
  const scoped = await authorizedPropertyScope(email, requestedPropertyId);
  if (!scoped) return null;
  const { context, property: canonical } = scoped;
  if (context.role === "admin") {
    return { context, property: canonical, assignmentDepartment: "EXECUTIVE", assignmentRole: "ADMINISTRATOR", canManage: true };
  }
  const property = await database().prepare(`SELECT p.*,a.department assignment_department,a.role_label assignment_role
    FROM property_contexts p JOIN property_assignments a ON a.organization_id=p.organization_id AND a.property_id=p.id
    WHERE p.organization_id=? AND p.id=? AND lower(a.user_email)=lower(?) AND a.status='ACTIVE' AND p.status='ACTIVE' LIMIT 1`)
    .bind(context.organizationId, canonical.id, context.email).first<Record<string, any>>();
  if (!property) return null;
  const role = String(property.assignment_role || "").toUpperCase();
  return { context, property, assignmentDepartment: String(property.assignment_department || "").toUpperCase(),
    assignmentRole: role, canManage: /SUPERVISOR|MANAGER|ADMIN|OWNER/.test(role) };
}

async function eligibleHousekeepers(scope: Scope): Promise<HousekeeperCandidate[]> {
  const result = await database().prepare(`SELECT m.user_email email,m.display_name display_name,
      CASE WHEN EXISTS(SELECT 1 FROM time_entries t WHERE t.organization_id=m.organization_id AND t.property_id=a.property_id
        AND lower(t.user_email)=lower(m.user_email) AND t.status='open' AND t.clock_out_at IS NULL) THEN 1 ELSE 0 END clocked_in,
      (SELECT COUNT(*) FROM housekeeping_assignments h WHERE h.organization_id=m.organization_id AND h.property_id=a.property_id
        AND lower(h.assigned_to_email)=lower(m.user_email) AND h.assignment_status NOT IN ('VERIFIED','CANCELLED')) open_load
    FROM property_assignments a JOIN staff_members m ON m.organization_id=a.organization_id AND lower(m.user_email)=lower(a.user_email)
    WHERE a.organization_id=? AND a.property_id=? AND a.status='ACTIVE' AND m.status='active'
      AND (upper(a.department)='HOUSEKEEPING' OR upper(a.role_label) LIKE '%HOUSEKEEP%')
    ORDER BY clocked_in DESC,open_load,m.user_email`)
    .bind(scope.context.organizationId, scope.property.id).all<Record<string, any>>();
  return result.results.map(row => ({ email: String(row.email).toLowerCase(), displayName: String(row.display_name),
    openLoad: Number(row.open_load || 0), clockedIn: Number(row.clocked_in) === 1 }));
}

async function ensureDigitalDuty(scope: Scope) {
  const now = new Date().toISOString();
  await database().prepare(`INSERT INTO digital_employee_duties
    (id,organization_id,authority_definition_id,role_key,duty_key,duty_name,trigger_type,trigger_definition,data_sources_json,
     decision_logic_description,tool_or_action_used,verification_method,confidence_threshold,retry_policy,escalation_condition,
     escalation_target,status,created_at,updated_at)
    VALUES(?,?,NULL,'HOUSEKEEPING_SUPERVISOR','DEPARTURE_ASSIGNMENT_CHAIN','Prepare and monitor departure-room assignments','event',?, ?,?,?,?,0.80,?,?,?,'working_incomplete',?,?)
    ON CONFLICT(organization_id,role_key,duty_key) DO UPDATE SET trigger_definition=excluded.trigger_definition,
      data_sources_json=excluded.data_sources_json,decision_logic_description=excluded.decision_logic_description,
      tool_or_action_used=excluded.tool_or_action_used,verification_method=excluded.verification_method,
      escalation_condition=excluded.escalation_condition,escalation_target=excluded.escalation_target,updated_at=excluded.updated_at`)
    .bind(crypto.randomUUID(), scope.context.organizationId,
      "A property-scoped PMS API, email attachment, or manual departure report is accepted.",
      JSON.stringify(["housekeeping_departure_batches", "housekeeping_departures", "property_assignments", "time_entries"]),
      `Deterministic ${HOUSEKEEPING_POLICY_VERSION} priority and lowest-open-load eligible roster assignment.`,
      "Create property-scoped operational work orders and staff queues; no physical cleaning is claimed.",
      "Required evidence coverage, supervisor checklist, linked maintenance defects, and immutable audit trace.",
      "No eligible roster, overdue work, missing evidence, failed checklist, or low-confidence visual decision.",
      "Property housekeeping supervisor, then property administrator.", now, now).run();
  return database().prepare(`SELECT id FROM digital_employee_duties WHERE organization_id=? AND role_key='HOUSEKEEPING_SUPERVISOR'
    AND duty_key='DEPARTURE_ASSIGNMENT_CHAIN'`).bind(scope.context.organizationId).first<{ id: string }>();
}

async function summarizeBatch(scope: Scope, id: string) {
  const [batch, departures, assignments] = await Promise.all([
    database().prepare("SELECT * FROM housekeeping_departure_batches WHERE id=? AND organization_id=? AND property_id=?")
      .bind(id, scope.context.organizationId, scope.property.id).first(),
    database().prepare("SELECT * FROM housekeeping_departures WHERE batch_id=? AND organization_id=? AND property_id=? ORDER BY source_row_number")
      .bind(id, scope.context.organizationId, scope.property.id).all(),
    database().prepare(`SELECT a.*,d.room_number FROM housekeeping_assignments a JOIN housekeeping_departures d ON d.id=a.departure_id
      WHERE d.batch_id=? AND a.organization_id=? AND a.property_id=? ORDER BY a.priority_score DESC,d.room_number`)
      .bind(id, scope.context.organizationId, scope.property.id).all(),
  ]);
  return { batch, departures: departures.results, assignments: assignments.results };
}

async function managerFor(scope: Scope) {
  return database().prepare(`SELECT m.user_email FROM property_assignments a JOIN staff_members m
    ON m.organization_id=a.organization_id AND lower(m.user_email)=lower(a.user_email)
    WHERE a.organization_id=? AND a.property_id=? AND a.status='ACTIVE' AND m.status='active'
      AND (upper(a.role_label) LIKE '%SUPERVISOR%' OR upper(a.role_label) LIKE '%MANAGER%' OR upper(a.role_label) LIKE '%ADMIN%'
        OR m.role='admin') ORDER BY CASE WHEN m.role='admin' THEN 0 ELSE 1 END,m.user_email LIMIT 1`)
    .bind(scope.context.organizationId, scope.property.id).first<{ user_email: string }>();
}

async function createAssignmentEscalation(scope: Scope, assignmentId: string, room: string, reason: string, severity = "HIGH") {
  const existing = await database().prepare(`SELECT id FROM automation_exceptions WHERE organization_id=? AND property_id=?
    AND source_type='HOUSEKEEPING_ASSIGNMENT' AND source_id=? AND status='OPEN' LIMIT 1`)
    .bind(scope.context.organizationId, scope.property.id, assignmentId).first<{ id: string }>();
  if (existing) return existing.id;
  const manager = await managerFor(scope), now = new Date().toISOString(), id = crypto.randomUUID(), recipient = manager?.user_email || scope.context.email;
  const escalationId = crypto.randomUUID();
  await database().batch([
    database().prepare(`INSERT INTO automation_exceptions(id,organization_id,property_id,source_type,source_id,exception_state,severity,
      title,detail,extracted_json,missing_fields_json,recommended_action,owner_email,status,retry_count,next_retry_at,created_at,updated_at)
      VALUES(?,?,?,'HOUSEKEEPING_ASSIGNMENT',?,'NEEDS_HUMAN',?,?,?,?,'[]',?,?,'OPEN',0,NULL,?,?)`)
      .bind(id, scope.context.organizationId, scope.property.id, assignmentId, severity, `Housekeeping exception · Room ${room}`,
        reason, JSON.stringify({ room, assignmentId }), "Review roster, source facts, or assignment evidence.", recipient, now, now),
    database().prepare(`INSERT INTO notification_escalations(id,organization_id,source_type,source_id,status,urgency_score,
      acknowledged_at,escalated_at,manager_recipient,created_at,updated_at) VALUES(?,?,'HOUSEKEEPING_ASSIGNMENT',?,'ESCALATED',?,NULL,?,?,?,?)`)
      .bind(escalationId, scope.context.organizationId, assignmentId, severity === "CRITICAL" ? 100 : 80, now, recipient, now, now),
    database().prepare(`INSERT INTO staff_notifications(id,organization_id,event_id,recipient_email,sender_email,title,message,status,created_at,read_at)
      VALUES(?,?,NULL,?,'AAIQ-HOUSEKEEPING',?,?,'unread',?,NULL)`)
      .bind(crypto.randomUUID(), scope.context.organizationId, recipient, `Housekeeping exception · Room ${room}`, reason, now),
    database().prepare(`INSERT INTO notification_outbox(id,organization_id,escalation_id,route,priority,recipient,subject,body,status,attempts,
      provider_message_id,last_error,available_at,created_at,updated_at) VALUES(?,?,?,'IN_APP',?,?,?,?,'PENDING',0,NULL,NULL,?,?,?)`)
      .bind(crypto.randomUUID(), scope.context.organizationId, escalationId, severity === "CRITICAL" ? "CRITICAL" : "HIGH", recipient,
        `Housekeeping exception · Room ${room}`, reason, now, now, now),
  ]);
  await database().prepare(`UPDATE housekeeping_assignments SET escalated_at=COALESCE(escalated_at,?),updated_at=?
    WHERE id=? AND organization_id=? AND property_id=?`)
    .bind(now, now, assignmentId, scope.context.organizationId, scope.property.id).run();
  await recordSystemAudit({ organizationId: scope.context.organizationId, propertyId: scope.property.id,
    eventType: "HOUSEKEEPING_ASSIGNMENT_ESCALATED", entityType: "HOUSEKEEPING_ASSIGNMENT", entityId: assignmentId,
    authorType: "SYSTEM", authorId: "AAIQ-HOUSEKEEPING-SUPERVISOR", correlationId: assignmentId,
    delta: { reason, severity, recipient, exceptionId: id } });
  return id;
}

export async function ingestDepartureReport(email: string, input: {
  requestedPropertyId?: string | null; businessDate?: string; sourceType?: string; sourceReference?: string;
  fileName?: string | null; objectKey?: string | null; text: string;
}) {
  const scope = await scopeFor(email, input.requestedPropertyId);
  if (!scope || !scope.canManage) return null;
  const businessDate = /^\d{4}-\d{2}-\d{2}$/.test(input.businessDate || "") ? input.businessDate! : propertyDate(String(scope.property.timezone));
  const sourceType = ["PMS_API", "EMAIL_ATTACHMENT", "MANUAL_UPLOAD"].includes(input.sourceType || "") ? input.sourceType! : "MANUAL_UPLOAD";
  const sourceReference = (input.sourceReference || `${sourceType}:${input.fileName || businessDate}`).trim().slice(0, 240);
  if (!input.text.trim()) throw new Error("Departure source content is required.");
  if (input.text.length > 2_000_000) throw new Error("Departure reports must be 2MB or smaller.");
  const digest = await sha256(`${businessDate}\n${input.text}`);
  const existing = await database().prepare(`SELECT id FROM housekeeping_departure_batches WHERE organization_id=? AND property_id=? AND content_sha256=?`)
    .bind(scope.context.organizationId, scope.property.id, digest).first<{ id: string }>();
  if (existing) return { ...(await summarizeBatch(scope, existing.id)), duplicate: true };
  const parsed = parseDepartureReport(input.text), now = new Date(), batchId = crypto.randomUUID();
  const seenRooms = new Set<string>(), rows = [], duplicateIssues = [] as typeof parsed.issues;
  for (const row of parsed.rows) {
    if (seenRooms.has(row.roomNumber)) duplicateIssues.push({ sourceRowNumber: row.sourceRowNumber, reason: "DUPLICATE_ROOM_IN_SOURCE", rawRowText: row.rawRowText });
    else { seenRooms.add(row.roomNumber); rows.push(row); }
  }
  const issues = [...parsed.issues, ...duplicateIssues], status = issues.length ? "REVIEW_REQUIRED" : "PARSED";
  await database().prepare(`INSERT INTO housekeeping_departure_batches(id,organization_id,property_id,business_date,source_type,source_reference,
    file_name,object_key,content_sha256,row_count,accepted_row_count,exception_count,status,parse_issues_json,imported_by,imported_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(batchId, scope.context.organizationId, scope.property.id, businessDate, sourceType,
    sourceReference, input.fileName?.slice(0, 180) || null, input.objectKey || null, digest, parsed.totalDataRows, rows.length, issues.length,
    status, JSON.stringify(issues), scope.context.email, now.toISOString()).run();
  const candidates = await eligibleHousekeepers(scope), planned = planHousekeepingAssignments(rows, candidates, now), duty = await ensureDigitalDuty(scope);
  let created = 0, unassigned = 0, skippedOpen = 0;
  for (const plan of planned) {
    const departureId = crypto.randomUUID();
    const duplicateOpen = await database().prepare(`SELECT a.id FROM housekeeping_assignments a JOIN housekeeping_departures d ON d.id=a.departure_id
      WHERE a.organization_id=? AND a.property_id=? AND d.room_number=? AND a.assignment_status NOT IN ('VERIFIED','CANCELLED') LIMIT 1`)
      .bind(scope.context.organizationId, scope.property.id, plan.departure.roomNumber).first<{ id: string }>();
    if (duplicateOpen) {
      await database().prepare(`INSERT INTO housekeeping_departures(id,batch_id,organization_id,property_id,business_date,source_row_number,
        room_number,departure_status,guest_reference,departed_at,expected_arrival_at,early_arrival,vip,raw_row_text,normalized_json,
        parse_confidence,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'CANCELLED',?)`)
        .bind(departureId, batchId, scope.context.organizationId, scope.property.id, businessDate, plan.departure.sourceRowNumber,
          plan.departure.roomNumber, plan.departure.departureStatus, plan.departure.guestReference, plan.departure.departedAt,
          plan.departure.expectedArrivalAt, plan.departure.earlyArrival ? 1 : 0, plan.departure.vip ? 1 : 0, plan.departure.rawRowText,
          JSON.stringify({ skippedReason: "OPEN_ASSIGNMENT_EXISTS", existingAssignmentId: duplicateOpen.id }), plan.departure.parseConfidence, now.toISOString()).run();
      skippedOpen += 1; continue;
    }
    const assignmentId = crypto.randomUUID(), workOrderId = crypto.randomUUID(), assignmentStatus = plan.assignedToEmail ? "ASSIGNED" : "UNASSIGNED";
    await database().batch([
      database().prepare(`INSERT INTO housekeeping_departures(id,batch_id,organization_id,property_id,business_date,source_row_number,
        room_number,departure_status,guest_reference,departed_at,expected_arrival_at,early_arrival,vip,raw_row_text,normalized_json,
        parse_confidence,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(departureId, batchId, scope.context.organizationId, scope.property.id, businessDate, plan.departure.sourceRowNumber,
          plan.departure.roomNumber, plan.departure.departureStatus, plan.departure.guestReference, plan.departure.departedAt,
          plan.departure.expectedArrivalAt, plan.departure.earlyArrival ? 1 : 0, plan.departure.vip ? 1 : 0, plan.departure.rawRowText,
          JSON.stringify(plan.departure), plan.departure.parseConfidence, assignmentStatus, now.toISOString()),
      database().prepare(`INSERT INTO operational_work_orders(id,organization_id,property_id,department,work_type,title,description,room_number,
        assigned_to,status,progress,priority,parent_order_id,due_at,created_by,created_at,updated_at,completed_at)
        VALUES(?,?,?,'HOUSEKEEPING','DEPARTURE_ROOM_TURN',?,?,?, ?,?,0,?,NULL,?,?,?,?,NULL)`)
        .bind(workOrderId, scope.context.organizationId, scope.property.id, `Room ${plan.departure.roomNumber} departure turn`,
          `Source-backed ${plan.departure.departureStatus.toLowerCase().replaceAll("_", " ")} room. Priority: ${plan.decisionReason.facts.join(", ") || "standard queue"}.`,
          plan.departure.roomNumber, plan.assignedToEmail || "Housekeeping supervisor queue", assignmentStatus,
          plan.priority, plan.dueAt, scope.context.email, now.toISOString(), now.toISOString()),
      database().prepare(`INSERT INTO housekeeping_assignments(id,organization_id,property_id,departure_id,work_order_id,assigned_to_email,
        assignment_status,priority,priority_score,decision_reason_json,decision_policy_version,roster_source,due_at,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(assignmentId, scope.context.organizationId, scope.property.id, departureId, workOrderId,
          plan.assignedToEmail, assignmentStatus, plan.priority, plan.priorityScore, JSON.stringify(plan.decisionReason), HOUSEKEEPING_POLICY_VERSION,
          plan.rosterSource, plan.dueAt, now.toISOString(), now.toISOString()),
      database().prepare(`UPDATE operational_work_orders SET asset_id=(SELECT id FROM property_assets WHERE organization_id=? AND property_id=?
        AND asset_type='ROOM' AND room_number=? LIMIT 1) WHERE id=? AND organization_id=? AND property_id=?`).bind(scope.context.organizationId, scope.property.id,
          plan.departure.roomNumber, workOrderId, scope.context.organizationId, scope.property.id),
      ...(duty ? [database().prepare(`INSERT INTO digital_employee_work_queue(id,organization_id,property_id,duty_id,item_reference,
        trigger_snapshot_json,decision_output,action_output_json,verification_output_json,audit_evidence_url,queued_at,started_at,completed_at,
        outcome,retry_count,confidence_score) VALUES(?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,?,0,?)`)
        .bind(crypto.randomUUID(), scope.context.organizationId, scope.property.id, duty.id, assignmentId,
          JSON.stringify({ batchId, departureId, room: plan.departure.roomNumber, sourceType }), JSON.stringify(plan.decisionReason),
          JSON.stringify({ workOrderId, assignedTo: plan.assignedToEmail, status: assignmentStatus }), null,
          `/api/housekeeping/assignments/${assignmentId}/handoff-trace`, now.toISOString(), assignmentStatus === "UNASSIGNED" ? "escalated" : null,
          plan.departure.parseConfidence)] : []),
    ]);
    await recordSystemAudit({ organizationId: scope.context.organizationId, propertyId: scope.property.id,
      eventType: "HOUSEKEEPING_ASSIGNMENT_DECIDED", entityType: "HOUSEKEEPING_ASSIGNMENT", entityId: assignmentId,
      authorType: "SYSTEM", authorId: "AAIQ-DIGITAL-HOUSEKEEPING", correlationId: assignmentId,
      delta: { room: plan.departure.roomNumber, assignedTo: plan.assignedToEmail, priority: plan.priority,
        priorityScore: plan.priorityScore, policy: HOUSEKEEPING_POLICY_VERSION, rosterSource: plan.rosterSource } });
    await emitReportEvent({ organizationId: scope.context.organizationId, propertyId: scope.property.id, sourceModule: "HOUSEKEEPING", eventType: "HOUSEKEEPING_ASSIGNMENT_CREATED",
      entityType: "housekeeping_assignment", entityId: assignmentId, idempotencyKey: `housekeeping:${assignmentId}:created`,
      occurredAt: now.toISOString(), payload: { propertyId: scope.property.id, workOrderId, room: plan.departure.roomNumber,
        priority: plan.priority, assignedTo: plan.assignedToEmail, status: assignmentStatus } });
    if (!plan.assignedToEmail) { unassigned += 1; await createAssignmentEscalation(scope, assignmentId, plan.departure.roomNumber,
      "No active property-authorized Housekeeping employee was available. A supervisor must assign this room before work can begin.", "CRITICAL"); }
    created += 1;
  }
  await recordSystemAudit({ organizationId: scope.context.organizationId, propertyId: scope.property.id,
    eventType: "HOUSEKEEPING_DEPARTURE_BATCH_INGESTED", entityType: "HOUSEKEEPING_DEPARTURE_BATCH", entityId: batchId,
    authorType: "USER", authorId: scope.context.email, correlationId: batchId,
    delta: { sourceType, sourceReference, businessDate, acceptedRows: rows.length, parseIssues: issues.length, created, unassigned, skippedOpen } });
  return { ...(await summarizeBatch(scope, batchId)), duplicate: false, created, unassigned, skippedOpen };
}

function effectiveEvidence(rows: Record<string, any>[]) {
  const byKey = new Map<string, Record<string, any>>();
  for (const row of rows) {
    const key = `${row.evidence_area}:${row.evidence_stage}`;
    if (!byKey.has(key)) byKey.set(key, row);
  }
  return [...byKey.values()];
}

export async function housekeepingAssignmentsToday(email: string, requestedPropertyId?: string | null) {
  const scope = await scopeFor(email, requestedPropertyId);
  if (!scope) return null;
  const businessDate = propertyDate(String(scope.property.timezone));
  const visibility = scope.canManage ? "" : "AND lower(a.assigned_to_email)=lower(?)";
  const values = scope.canManage ? [scope.context.organizationId, scope.property.id, businessDate] :
    [scope.context.organizationId, scope.property.id, businessDate, scope.context.email];
  const [assignments, latestBatch, openExceptions, roster] = await Promise.all([
    database().prepare(`SELECT a.*,d.batch_id,d.business_date,d.room_number,d.departure_status,d.vip,d.early_arrival,d.departed_at,
      d.expected_arrival_at,d.parse_confidence,w.title,w.description,w.status work_order_status,w.progress,w.asset_id
      FROM housekeeping_assignments a JOIN housekeeping_departures d ON d.id=a.departure_id
      JOIN operational_work_orders w ON w.id=a.work_order_id
      WHERE a.organization_id=? AND a.property_id=? AND d.business_date=? ${visibility}
      ORDER BY CASE a.priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END,a.due_at,d.room_number`)
      .bind(...values).all<Record<string, any>>(),
    database().prepare(`SELECT id,business_date,source_type,source_reference,file_name,row_count,accepted_row_count,exception_count,status,imported_at
      FROM housekeeping_departure_batches WHERE organization_id=? AND property_id=? ORDER BY imported_at DESC LIMIT 1`)
      .bind(scope.context.organizationId, scope.property.id).first(),
    database().prepare(`SELECT id,source_id,severity,title,detail,owner_email,status,created_at FROM automation_exceptions
      WHERE organization_id=? AND property_id=? AND source_type='HOUSEKEEPING_ASSIGNMENT' AND status='OPEN' ORDER BY created_at DESC`)
      .bind(scope.context.organizationId, scope.property.id).all(),
    scope.canManage ? eligibleHousekeepers(scope) : Promise.resolve([]),
  ]);
  const ids = assignments.results.map(row => String(row.work_order_id));
  let reviews: Record<string, any>[] = [], handoffs: Record<string, any>[] = [];
  if (ids.length) {
    const placeholders = ids.map(() => "?").join(",");
    reviews = (await database().prepare(`SELECT * FROM work_evidence_reviews WHERE organization_id=? AND property_id=?
      AND work_order_id IN (${placeholders}) ORDER BY created_at DESC`).bind(scope.context.organizationId, scope.property.id, ...ids).all<Record<string, any>>()).results;
    const assignmentIds = assignments.results.map(row => String(row.id)), assignmentPlaceholders = assignmentIds.map(() => "?").join(",");
    handoffs = (await database().prepare(`SELECT h.*,w.status maintenance_status,w.assigned_to maintenance_assignee,w.priority maintenance_priority
      FROM housekeeping_maintenance_handoffs h JOIN operational_work_orders w ON w.id=h.maintenance_work_order_id
      WHERE h.organization_id=? AND h.property_id=? AND h.assignment_id IN (${assignmentPlaceholders}) ORDER BY h.created_at DESC`)
      .bind(scope.context.organizationId, scope.property.id, ...assignmentIds).all<Record<string, any>>()).results;
  }
  return { property: { id: scope.property.id, code: scope.property.code, name: scope.property.name, timezone: scope.property.timezone },
    businessDate, roleMode: scope.canManage ? "SUPERVISOR" : "HOUSEKEEPER", latestBatch,
    sourceCapability: { pmsApi: "NOT_CONNECTED", emailAttachment: "AVAILABLE_WHEN_EMAIL_CONNECTOR_DELIVERS_CONTENT", manualUpload: "AVAILABLE" },
    assignments: assignments.results.map(row => ({ ...row,
      evidence: effectiveEvidence(reviews.filter(review => review.work_order_id === row.work_order_id)),
      handoffs: handoffs.filter(handoff => handoff.assignment_id === row.id) })),
    requiredEvidence: REQUIRED_HOUSEKEEPING_EVIDENCE, exceptions: openExceptions.results, roster };
}

async function assignmentInScope(scope: Scope, assignmentId: string) {
  return database().prepare(`SELECT a.*,d.room_number,d.business_date,d.departure_status,d.batch_id,w.status work_order_status,w.progress
    FROM housekeeping_assignments a JOIN housekeeping_departures d ON d.id=a.departure_id JOIN operational_work_orders w ON w.id=a.work_order_id
    WHERE a.id=? AND a.organization_id=? AND a.property_id=?`).bind(assignmentId, scope.context.organizationId, scope.property.id)
    .first<Record<string, any>>();
}

function mayWork(scope: Scope, assignment: Record<string, any>) {
  return scope.canManage || String(assignment.assigned_to_email || "").toLowerCase() === scope.context.email.toLowerCase();
}

async function maintenanceAssignee(scope: Scope) {
  return database().prepare(`SELECT m.user_email,(SELECT COUNT(*) FROM operational_work_orders w WHERE w.organization_id=a.organization_id
    AND w.property_id=a.property_id AND lower(w.assigned_to)=lower(m.user_email) AND w.department='MAINTENANCE'
    AND w.status NOT IN ('COMPLETE','VERIFIED')) open_load FROM property_assignments a JOIN staff_members m
    ON m.organization_id=a.organization_id AND lower(m.user_email)=lower(a.user_email)
    WHERE a.organization_id=? AND a.property_id=? AND a.status='ACTIVE' AND m.status='active'
      AND (upper(a.department)='MAINTENANCE' OR upper(a.role_label) LIKE '%MAINTENANCE%') ORDER BY open_load,m.user_email LIMIT 1`)
    .bind(scope.context.organizationId, scope.property.id).first<{ user_email: string; open_load: number }>();
}

function defectKey(key: string) { return key.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 80) || "OTHER"; }

async function createMaintenanceHandoffs(scope: Scope, assignment: Record<string, any>, inspectionId: string,
  failed: Array<{ key: string; passed: boolean; note?: string }>, confidence: number | null) {
  const created: Array<{ handoffId: string; workOrderId: string; defectKey: string }> = [], assignee = await maintenanceAssignee(scope), now = new Date();
  for (const failure of failed) {
    const key = defectKey(failure.key), existing = await database().prepare(`SELECT id,maintenance_work_order_id FROM housekeeping_maintenance_handoffs
      WHERE organization_id=? AND property_id=? AND assignment_id=? AND defect_key=?`)
      .bind(scope.context.organizationId, scope.property.id, assignment.id, key).first<{ id: string; maintenance_work_order_id: string }>();
    if (existing) { created.push({ handoffId: existing.id, workOrderId: existing.maintenance_work_order_id, defectKey: key }); continue; }
    const handoffId = crypto.randomUUID(), workOrderId = crypto.randomUUID(), detail = (failure.note || `Housekeeping inspection failed ${failure.key}.`).slice(0, 1000);
    await database().batch([
      database().prepare(`INSERT INTO operational_work_orders(id,organization_id,property_id,department,work_type,title,description,room_number,
        assigned_to,status,progress,priority,parent_order_id,due_at,created_by,created_at,updated_at,completed_at)
        VALUES(?,?,?,'MAINTENANCE','HOUSEKEEPING_INSPECTION_DEFECT',?,?,?,?,'ASSIGNED',0,'HIGH',?,?,?,?,?,NULL)`)
        .bind(workOrderId, scope.context.organizationId, scope.property.id, `Room ${assignment.room_number} · ${failure.key.replaceAll("_", " ")}`,
          detail, assignment.room_number, assignee?.user_email || "Maintenance supervisor queue", assignment.work_order_id,
          new Date(now.getTime() + 30 * 60_000).toISOString(), scope.context.email, now.toISOString(), now.toISOString()),
      database().prepare(`INSERT INTO housekeeping_maintenance_handoffs(id,organization_id,property_id,assignment_id,
        housekeeping_work_order_id,maintenance_work_order_id,defect_key,defect_category,defect_summary,defect_detail,
        source_inspection_id,source_evidence_review_id,confidence,status,created_by,created_at,resolved_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,NULL,?,'OPEN',?,?,NULL)`)
        .bind(handoffId, scope.context.organizationId, scope.property.id, assignment.id, assignment.work_order_id, workOrderId,
          key, failure.key.slice(0, 100), `Room ${assignment.room_number} ${failure.key.replaceAll("_", " ").toLowerCase()} failed`, detail,
          inspectionId, confidence, scope.context.email, now.toISOString()),
    ]);
    await recordSystemAudit({ organizationId: scope.context.organizationId, propertyId: scope.property.id,
      eventType: "HOUSEKEEPING_MAINTENANCE_HANDOFF_CREATED", entityType: "HOUSEKEEPING_MAINTENANCE_HANDOFF", entityId: handoffId,
      authorType: "USER", authorId: scope.context.email, correlationId: assignment.id,
      delta: { room: assignment.room_number, defectKey: key, maintenanceWorkOrderId: workOrderId, assignedTo: assignee?.user_email || null } });
    await emitReportEvent({ organizationId: scope.context.organizationId, propertyId: scope.property.id, sourceModule: "HOUSEKEEPING", eventType: "MAINTENANCE_HANDOFF_CREATED",
      entityType: "work_order", entityId: workOrderId, idempotencyKey: `housekeeping-handoff:${handoffId}`,
      occurredAt: now.toISOString(), payload: { propertyId: scope.property.id, assignmentId: assignment.id, room: assignment.room_number, defectKey: key } });
    created.push({ handoffId, workOrderId, defectKey: key });
  }
  return created;
}

const requiredChecklistKeys = ["ENTRY_DOOR", "BEDS_LINENS", "BATHROOM", "VANITY_AMENITIES", "FLOOR_CORNERS", "FINAL_ROOM_STANDARD"];
function checklistFrom(value: unknown) {
  if (!Array.isArray(value)) throw new Error("Complete the six-item brand-standard checklist.");
  const list = value.map(item => ({ key: defectKey(String((item as any)?.key || "")), passed: Boolean((item as any)?.passed), note: String((item as any)?.note || "").trim().slice(0, 500) }));
  for (const key of requiredChecklistKeys) if (!list.some(item => item.key === key)) throw new Error(`Checklist item ${key.replaceAll("_", " ").toLowerCase()} is required.`);
  return list;
}

export async function actOnHousekeepingAssignment(email: string, assignmentId: string, input: Record<string, unknown>, requestedPropertyId?: string | null) {
  const scope = await scopeFor(email, requestedPropertyId), action = String(input.action || "").toUpperCase();
  if (!scope) return null;
  const assignment = await assignmentInScope(scope, assignmentId);
  if (!assignment || !mayWork(scope, assignment)) return null;
  const now = new Date().toISOString();
  if (action === "REASSIGN") {
    if (!scope.canManage) return null;
    if (["VERIFIED", "CANCELLED", "MAINTENANCE_HOLD"].includes(String(assignment.assignment_status)))
      throw new Error(`Reassignment is not allowed from ${String(assignment.assignment_status).toLowerCase().replaceAll("_", " ")}.`);
    const targetEmail = String(input.assignedToEmail || "").trim().toLowerCase();
    const candidates = await eligibleHousekeepers(scope);
    const candidate = candidates.find(item => item.email === targetEmail);
    if (!candidate) throw new Error("Choose an active Housekeeping employee assigned to this property.");
    const nextStatus = assignment.assignment_status === "UNASSIGNED" ? "ASSIGNED" : String(assignment.assignment_status);
    const priorDecision = JSON.parse(String(assignment.decision_reason_json || "{}"));
    const decision = { ...priorDecision, reassignment: { assignedBy: scope.context.email, assignedTo: candidate.email,
      assignedAt: now, candidateClockedIn: candidate.clockedIn, candidateOpenLoad: candidate.openLoad } };
    await database().batch([
      database().prepare(`UPDATE housekeeping_assignments SET assigned_to_email=?,assignment_status=?,roster_source=?,
        decision_reason_json=?,escalated_at=NULL,updated_at=? WHERE id=? AND organization_id=? AND property_id=?`)
        .bind(candidate.email, nextStatus, candidate.clockedIn ? "CLOCKED_IN" : "PROPERTY_ASSIGNMENT", JSON.stringify(decision), now,
          assignment.id, scope.context.organizationId, scope.property.id),
      database().prepare(`UPDATE operational_work_orders SET assigned_to=?,status=CASE WHEN status='UNASSIGNED' THEN 'ASSIGNED' ELSE status END,
        updated_at=? WHERE id=? AND organization_id=? AND property_id=?`)
        .bind(candidate.email, now, assignment.work_order_id, scope.context.organizationId, scope.property.id),
      database().prepare(`UPDATE automation_exceptions SET status='CLOSED',updated_at=? WHERE organization_id=? AND property_id=?
        AND source_type='HOUSEKEEPING_ASSIGNMENT' AND source_id=? AND status='OPEN'`)
        .bind(now, scope.context.organizationId, scope.property.id, assignment.id),
      database().prepare(`UPDATE notification_escalations SET status='ACKNOWLEDGED',acknowledged_at=?,updated_at=?
        WHERE organization_id=? AND source_type='HOUSEKEEPING_ASSIGNMENT' AND source_id=? AND status='ESCALATED'`)
        .bind(now, now, scope.context.organizationId, assignment.id),
    ]);
    await recordSystemAudit({ organizationId: scope.context.organizationId, propertyId: scope.property.id,
      eventType: "HOUSEKEEPING_ASSIGNMENT_REASSIGNED", entityType: "HOUSEKEEPING_ASSIGNMENT", entityId: assignment.id,
      authorType: "USER", authorId: scope.context.email, correlationId: assignment.id,
      before: { assignedTo: assignment.assigned_to_email, status: assignment.assignment_status },
      after: { assignedTo: candidate.email, status: nextStatus },
      delta: { candidateClockedIn: candidate.clockedIn, candidateOpenLoad: candidate.openLoad } });
    return { id: assignment.id, status: nextStatus, assignedTo: candidate.email };
  }
  if (action === "ACCEPT" || action === "START") {
    const next = action === "ACCEPT" ? "ACCEPTED" : "IN_PROGRESS";
    const allowed = action === "ACCEPT" ? ["ASSIGNED"] : ["ASSIGNED", "ACCEPTED"];
    if (!allowed.includes(String(assignment.assignment_status))) throw new Error(`${action.toLowerCase()} is not allowed from ${assignment.assignment_status}.`);
    await database().batch([
      database().prepare(`UPDATE housekeeping_assignments SET assignment_status=?,${action === "ACCEPT" ? "accepted_at" : "started_at"}=?,updated_at=?
        WHERE id=? AND organization_id=? AND property_id=?`)
        .bind(next, now, now, assignment.id, scope.context.organizationId, scope.property.id),
      database().prepare(`UPDATE operational_work_orders SET status=?,progress=?,updated_at=?
        WHERE id=? AND organization_id=? AND property_id=?`)
        .bind(next, action === "ACCEPT" ? 25 : 50, now, assignment.work_order_id, scope.context.organizationId, scope.property.id),
    ]);
    await recordSystemAudit({ organizationId: scope.context.organizationId, propertyId: scope.property.id,
      eventType: `HOUSEKEEPING_ASSIGNMENT_${next}`, entityType: "HOUSEKEEPING_ASSIGNMENT", entityId: assignment.id,
      authorType: "USER", authorId: scope.context.email, correlationId: assignment.id,
      before: { status: assignment.assignment_status }, after: { status: next }, delta: { action } });
    return { id: assignment.id, status: next };
  }
  if (action !== "SUBMIT" && action !== "INSPECT") throw new Error("Unsupported housekeeping assignment action.");
  if (action === "INSPECT" && !scope.canManage) return null;
  const checklist = checklistFrom(input.checklist), reviews = (await database().prepare(`SELECT * FROM work_evidence_reviews
    WHERE organization_id=? AND property_id=? AND work_order_id=? ORDER BY created_at DESC`)
    .bind(scope.context.organizationId, scope.property.id, assignment.work_order_id).all<Record<string, any>>()).results;
  const evidence = effectiveEvidence(reviews).map(row => ({ area: String(row.evidence_area), stage: String(row.evidence_stage), status: String(row.review_status) }));
  const confidence = action === "INSPECT" ? Math.max(0, Math.min(1, Number(input.confidence ?? 1))) : null;
  const decision = decideHousekeepingInspection({ evidence, checklist, confidence, supervisorDecision: action === "INSPECT" });
  if (decision.outcome === "MISSING_EVIDENCE") throw new Error(`Required evidence is missing: ${decision.missing.map(item => `${item.area} ${item.stage}`).join(", ")}.`);
  const inspectionId = crypto.randomUUID(), result = decision.outcome === "MAINTENANCE_HOLD" ? "FAIL" : decision.outcome === "SUPERVISOR_REVIEW" ? "LOW_CONFIDENCE" : "PASS";
  await database().prepare(`INSERT INTO housekeeping_assignment_inspections(id,organization_id,property_id,assignment_id,inspection_type,
    checklist_json,result,confidence,provider_label,notes,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(inspectionId, scope.context.organizationId, scope.property.id, assignment.id,
      action === "INSPECT" ? "SUPERVISOR_REVIEW" : "HOUSEKEEPER_CHECKLIST", JSON.stringify(checklist), result, confidence,
      action === "INSPECT" ? "HUMAN_SUPERVISOR" : "HOUSEKEEPER_SELF_CHECK", String(input.notes || "").slice(0, 1000), scope.context.email, now).run();
  const handoffs = decision.failed.length ? await createMaintenanceHandoffs(scope, assignment, inspectionId, decision.failed, confidence) : [];
  const next = decision.outcome === "MAINTENANCE_HOLD" ? "MAINTENANCE_HOLD" : decision.outcome === "VERIFIED" ? "VERIFIED" : "SUPERVISOR_REVIEW";
  const workStatus = next === "VERIFIED" ? "VERIFIED" : next === "MAINTENANCE_HOLD" ? "BLOCKED_MAINTENANCE" : "AWAITING_EVIDENCE_REVIEW";
  await database().batch([
    database().prepare(`UPDATE housekeeping_assignments SET assignment_status=?,evidence_submitted_at=COALESCE(evidence_submitted_at,?),
      verified_at=CASE WHEN ?='VERIFIED' THEN ? ELSE verified_at END,updated_at=?
      WHERE id=? AND organization_id=? AND property_id=?`)
      .bind(next, now, next, now, now, assignment.id, scope.context.organizationId, scope.property.id),
    database().prepare(`UPDATE operational_work_orders SET status=?,progress=?,completed_at=CASE WHEN ?='VERIFIED' THEN ? ELSE completed_at END,
      updated_at=? WHERE id=? AND organization_id=? AND property_id=?`)
      .bind(workStatus, next === "VERIFIED" ? 100 : 95, next, now, now, assignment.work_order_id, scope.context.organizationId, scope.property.id),
    database().prepare(`UPDATE housekeeping_departures SET status=CASE WHEN ?='VERIFIED' THEN 'COMPLETED' ELSE status END
      WHERE id=? AND organization_id=? AND property_id=?`)
      .bind(next, assignment.departure_id, scope.context.organizationId, scope.property.id),
  ]);
  if (next === "VERIFIED") {
    await database().prepare(`UPDATE work_evidence_reviews SET review_status='MANAGER_APPROVED',reviewer_email=?,reviewer_note=?,reviewed_at=?
      WHERE organization_id=? AND property_id=? AND work_order_id=? AND review_status='PENDING_SUPERVISOR_REVIEW'`)
      .bind(scope.context.email, "Supervisor verified required coverage and brand-standard checklist.", now,
        scope.context.organizationId, scope.property.id, assignment.work_order_id).run();
    await database().prepare(`INSERT INTO workflow_verification_runs(id,organization_id,property_id,workflow_key,trigger_description,
      source_data_snapshot_json,decision_output,action_taken,before_state_json,after_state_json,verification_method,verification_result,
      failure_case_tested,failure_behavior_observed,audit_evidence_url,run_at,reviewed_by,reviewed_at)
      VALUES(?,?,?,'HOUSEKEEPING_DEPARTURE_CHAIN',?,?,?,?,?,?,?,'pass',0,NULL,?,?,?,?)`)
      .bind(crypto.randomUUID(), scope.context.organizationId, scope.property.id, `Departure room ${assignment.room_number} supervisor review`,
        JSON.stringify({ batchId: assignment.batch_id, departureId: assignment.departure_id, requiredEvidence: REQUIRED_HOUSEKEEPING_EVIDENCE }),
        JSON.stringify({ inspectionId, result, confidence }), "Supervisor verified room; no autonomous physical-action claim.",
        JSON.stringify({ status: assignment.assignment_status }), JSON.stringify({ status: next }),
        "Human supervisor checklist plus required private evidence coverage", `/api/housekeeping/assignments/${assignment.id}/handoff-trace`, now,
        scope.context.email, now).run();
  } else if (next === "SUPERVISOR_REVIEW" && action === "INSPECT") {
    await createAssignmentEscalation(scope, assignment.id, assignment.room_number,
      "Inspection confidence was below the governed threshold. A second supervisor review is required.", "HIGH");
  }
  await recordSystemAudit({ organizationId: scope.context.organizationId, propertyId: scope.property.id,
    eventType: next === "VERIFIED" ? "HOUSEKEEPING_ASSIGNMENT_VERIFIED" : next === "MAINTENANCE_HOLD" ? "HOUSEKEEPING_DEFECT_HANDOFF" : "HOUSEKEEPING_EVIDENCE_SUBMITTED",
    entityType: "HOUSEKEEPING_ASSIGNMENT", entityId: assignment.id, authorType: "USER", authorId: scope.context.email,
    correlationId: assignment.id, before: { status: assignment.assignment_status }, after: { status: next },
    delta: { inspectionId, result, confidence, handoffWorkOrders: handoffs.map(item => item.workOrderId) } });
  return { id: assignment.id, status: next, inspectionId, handoffs };
}

export async function attachHousekeepingEvidence(email: string, assignmentId: string, file: { name: string; type: string; size: number },
  objectKey: string, contentSha256: string, area: string, stage: string, requestedPropertyId?: string | null) {
  const scope = await scopeFor(email, requestedPropertyId);
  if (!scope) return null;
  const assignment = await assignmentInScope(scope, assignmentId);
  if (!assignment || !mayWork(scope, assignment)) return null;
  const normalizedArea = defectKey(area), normalizedStage = stage.toUpperCase();
  if (!REQUIRED_HOUSEKEEPING_EVIDENCE.some(required => required.area === normalizedArea && required.stage === normalizedStage))
    throw new Error("This evidence area/stage is not part of the governed housekeeping checklist.");
  const duplicate = await database().prepare(`SELECT id FROM work_order_attachments WHERE organization_id=? AND property_id=?
    AND work_order_id=? AND content_sha256=?`).bind(scope.context.organizationId, scope.property.id, assignment.work_order_id, contentSha256)
    .first<{ id: string }>();
  if (duplicate) return { id: duplicate.id, duplicate: true };
  const id = crypto.randomUUID(), reviewId = crypto.randomUUID(), now = new Date().toISOString();
  await database().batch([
    database().prepare(`INSERT INTO work_order_attachments(id,organization_id,property_id,work_order_id,object_key,file_name,content_type,
      size_bytes,uploaded_by,created_at,content_sha256) VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id, scope.context.organizationId, scope.property.id, assignment.work_order_id, objectKey, file.name.slice(0, 180),
        file.type || "application/octet-stream", file.size, scope.context.email, now, contentSha256),
    database().prepare(`INSERT INTO work_evidence_reviews(id,organization_id,property_id,work_order_id,attachment_id,evidence_area,evidence_stage,
      review_status,quality_score,deficiencies_json,provider_label,reviewer_email,reviewer_note,reviewed_at,created_at)
      VALUES(?,?,?,?,?,?,?,'PENDING_SUPERVISOR_REVIEW',NULL,'[]','UPLOAD_INTEGRITY_ONLY_V1',NULL,NULL,NULL,?)`)
      .bind(reviewId, scope.context.organizationId, scope.property.id, assignment.work_order_id, id, normalizedArea, normalizedStage, now),
  ]);
  await recordSystemAudit({ organizationId: scope.context.organizationId, propertyId: scope.property.id,
    eventType: "HOUSEKEEPING_EVIDENCE_RECEIVED", entityType: "WORK_ORDER_ATTACHMENT", entityId: id,
    authorType: "USER", authorId: scope.context.email, correlationId: assignment.id,
    delta: { assignmentId, workOrderId: assignment.work_order_id, area: normalizedArea, stage: normalizedStage,
      checksum: contentSha256, visualInterpretation: "NOT_PERFORMED" } });
  return { id, reviewId, duplicate: false, reviewStatus: "PENDING_SUPERVISOR_REVIEW" };
}

export async function housekeepingHandoffTrace(email: string, assignmentId: string, requestedPropertyId?: string | null) {
  const scope = await scopeFor(email, requestedPropertyId);
  if (!scope) return null;
  const assignment = await assignmentInScope(scope, assignmentId);
  if (!assignment || (!scope.canManage && !mayWork(scope, assignment))) return null;
  const [departure, batch, evidence, inspections, handoffs, audit] = await Promise.all([
    database().prepare("SELECT * FROM housekeeping_departures WHERE id=? AND organization_id=? AND property_id=?")
      .bind(assignment.departure_id, scope.context.organizationId, scope.property.id).first(),
    database().prepare(`SELECT b.* FROM housekeeping_departure_batches b JOIN housekeeping_departures d ON d.batch_id=b.id
      WHERE d.id=? AND b.organization_id=? AND b.property_id=?`).bind(assignment.departure_id, scope.context.organizationId, scope.property.id).first(),
    database().prepare(`SELECT r.*,a.file_name,a.content_type,a.size_bytes,a.content_sha256 FROM work_evidence_reviews r
      JOIN work_order_attachments a ON a.id=r.attachment_id WHERE r.organization_id=? AND r.property_id=? AND r.work_order_id=? ORDER BY r.created_at`)
      .bind(scope.context.organizationId, scope.property.id, assignment.work_order_id).all(),
    database().prepare(`SELECT * FROM housekeeping_assignment_inspections WHERE organization_id=? AND property_id=? AND assignment_id=? ORDER BY created_at`)
      .bind(scope.context.organizationId, scope.property.id, assignment.id).all(),
    database().prepare(`SELECT h.*,w.title maintenance_title,w.status maintenance_status,w.assigned_to maintenance_assignee,w.priority maintenance_priority
      FROM housekeeping_maintenance_handoffs h JOIN operational_work_orders w ON w.id=h.maintenance_work_order_id
      WHERE h.organization_id=? AND h.property_id=? AND h.assignment_id=? ORDER BY h.created_at`)
      .bind(scope.context.organizationId, scope.property.id, assignment.id).all(),
    database().prepare(`SELECT event_type,entity_type,entity_id,author_type,author_id,delta_json,occurred_at FROM system_audit_trail
      WHERE organization_id=? AND property_id=? AND correlation_id=? ORDER BY occurred_at`)
      .bind(scope.context.organizationId, scope.property.id, assignment.id).all(),
  ]);
  return { property: { id: scope.property.id, code: scope.property.code, name: scope.property.name }, batch, departure, assignment,
    decision: JSON.parse(String(assignment.decision_reason_json || "{}")), evidence: evidence.results, inspections: inspections.results,
    handoffs: handoffs.results, auditTimeline: audit.results };
}

export async function runHousekeepingEscalations() {
  const now = new Date(), rows = await database().prepare(`SELECT a.id,a.organization_id,a.property_id,a.assignment_status,a.due_at,d.room_number
    FROM housekeeping_assignments a JOIN housekeeping_departures d ON d.id=a.departure_id
    WHERE a.assignment_status IN ('UNASSIGNED','ASSIGNED','ACCEPTED','IN_PROGRESS','SUPERVISOR_REVIEW')
      AND a.escalated_at IS NULL AND (a.assignment_status='UNASSIGNED' OR a.due_at<=?) ORDER BY a.due_at LIMIT 100`)
    .bind(now.toISOString()).all<Record<string, any>>();
  let escalated = 0;
  for (const row of rows.results) {
    const context = await database().prepare(`SELECT o.owner_email email,o.name organization_name FROM staff_organizations o
      WHERE o.id=?`).bind(row.organization_id).first<{ email: string; organization_name: string }>();
    const property = await database().prepare("SELECT * FROM property_contexts WHERE id=? AND organization_id=?")
      .bind(row.property_id, row.organization_id).first<Record<string, any>>();
    if (!context || !property) continue;
    const scope = { context: { organizationId: row.organization_id, organizationName: context.organization_name,
      email: context.email.toLowerCase(), displayName: context.email, role: "admin" as const }, property,
      assignmentDepartment: "EXECUTIVE", assignmentRole: "ADMINISTRATOR", canManage: true };
    await createAssignmentEscalation(scope, row.id, row.room_number, row.assignment_status === "UNASSIGNED"
      ? "No eligible housekeeper is assigned. Supervisor action is required."
      : `Housekeeping work is overdue in ${row.assignment_status.toLowerCase().replaceAll("_", " ")} status.`,
      row.assignment_status === "UNASSIGNED" ? "CRITICAL" : "HIGH");
    escalated += 1;
  }
  return { examined: rows.results.length, escalated, completedAt: now.toISOString() };
}
