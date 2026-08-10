import { env } from "cloudflare:workers";
import { activeStaffContext } from "./staff";
import { emitReportEvent } from "./reporting-layer";
import { recordSystemAudit, sha256 } from "./platform-controls";
import { authorizedPropertyScope } from "./property-scope";
import {
  assertMaintenanceTransition,
  classifyMaintenanceRisk,
  MAINTENANCE_EVIDENCE,
  MAINTENANCE_POLICY_VERSION,
  maintenanceProgress,
  maintenanceWorkOrderStatus,
  type MaintenanceState,
} from "../lib/maintenance-repair-engine";

type StaffContext = Exclude<Awaited<ReturnType<typeof activeStaffContext>>, null>;
type Scope = { context: StaffContext; property: Record<string, any>; assignmentDepartment: string; assignmentRole: string; canManage: boolean };

function database(): D1Database {
  if (!env.DB) throw new Error("Maintenance workflow storage is unavailable.");
  return env.DB;
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
  const department = String(property.assignment_department || "").toUpperCase(), role = String(property.assignment_role || "").toUpperCase();
  return { context, property, assignmentDepartment: department, assignmentRole: role,
    canManage: /SUPERVISOR|MANAGER|ADMIN|OWNER/.test(role) || ["EXECUTIVE", "MANAGEMENT"].includes(department) };
}

async function maintenanceRoster(scope: Scope) {
  const result = await database().prepare(`SELECT m.user_email email,m.display_name display_name,a.role_label,
      CASE WHEN EXISTS(SELECT 1 FROM time_entries t WHERE t.organization_id=m.organization_id AND t.property_id=a.property_id
        AND lower(t.user_email)=lower(m.user_email) AND t.status='open' AND t.clock_out_at IS NULL) THEN 1 ELSE 0 END clocked_in,
      (SELECT COUNT(*) FROM maintenance_cases c WHERE c.organization_id=m.organization_id AND c.property_id=a.property_id
        AND lower(c.assigned_to_email)=lower(m.user_email) AND c.state NOT IN ('RETURNED_TO_SERVICE','CANCELLED')) open_load
    FROM property_assignments a JOIN staff_members m ON m.organization_id=a.organization_id AND lower(m.user_email)=lower(a.user_email)
    WHERE a.organization_id=? AND a.property_id=? AND a.status='ACTIVE' AND m.status='active'
      AND (upper(a.department)='MAINTENANCE' OR upper(a.role_label) LIKE '%MAINTENANCE%')
    ORDER BY clocked_in DESC,open_load,m.user_email`)
    .bind(scope.context.organizationId, scope.property.id).all<Record<string, any>>();
  return result.results.map(row => ({ email: String(row.email).toLowerCase(), displayName: String(row.display_name),
    roleLabel: String(row.role_label), clockedIn: Number(row.clocked_in) === 1, openLoad: Number(row.open_load || 0) }));
}

async function managerFor(scope: Scope) {
  return database().prepare(`SELECT m.user_email FROM property_assignments a JOIN staff_members m
    ON m.organization_id=a.organization_id AND lower(m.user_email)=lower(a.user_email)
    WHERE a.organization_id=? AND a.property_id=? AND a.status='ACTIVE' AND m.status='active'
      AND (upper(a.role_label) LIKE '%SUPERVISOR%' OR upper(a.role_label) LIKE '%MANAGER%' OR upper(a.role_label) LIKE '%ADMIN%'
        OR m.role='admin') ORDER BY CASE WHEN m.role='admin' THEN 0 ELSE 1 END,m.user_email LIMIT 1`)
    .bind(scope.context.organizationId, scope.property.id).first<{ user_email: string }>();
}

async function ensureDigitalDuty(scope: Scope) {
  const now = new Date().toISOString();
  await database().prepare(`INSERT INTO digital_employee_duties
    (id,organization_id,authority_definition_id,role_key,duty_key,duty_name,trigger_type,trigger_definition,data_sources_json,
     decision_logic_description,tool_or_action_used,verification_method,confidence_threshold,retry_policy,escalation_condition,
     escalation_target,status,created_at,updated_at)
    VALUES(?,?,NULL,'MAINTENANCE_DISPATCHER','DEFECT_TO_REPAIR_CHAIN','Triage and monitor maintenance defects','event',?,?,?,?,?,0.90,?,?,?,'working_incomplete',?,?)
    ON CONFLICT(organization_id,role_key,duty_key) DO UPDATE SET trigger_definition=excluded.trigger_definition,
      data_sources_json=excluded.data_sources_json,decision_logic_description=excluded.decision_logic_description,
      tool_or_action_used=excluded.tool_or_action_used,verification_method=excluded.verification_method,
      escalation_condition=excluded.escalation_condition,escalation_target=excluded.escalation_target,updated_at=excluded.updated_at`)
    .bind(crypto.randomUUID(), scope.context.organizationId,
      "A property-scoped issue, Housekeeping handoff, approved report, email intake, or configured IoT alert is received.",
      JSON.stringify(["maintenance_cases", "operational_work_orders", "property_assets", "property_assignments", "supply_inventory"]),
      `Deterministic ${MAINTENANCE_POLICY_VERSION} risk/SLA classification and lowest-open-load eligible roster assignment.`,
      "Create and monitor local work queues, reservations, exceptions, and evidence requests; no physical repair is claimed.",
      "Diagnosis, repair/test record, evidence coverage, independent return-to-service approval, and immutable trace.",
      "Retry idempotent intake or monitoring work up to three times; never retry physical, safety-clearance, approval, or financial actions.",
      "Life-safety fact, no eligible technician, breached SLA, insufficient stock, failed test, or rejected verification.",
      "Property Maintenance supervisor, then property administrator.", now, now).run();
  return database().prepare(`SELECT id FROM digital_employee_duties WHERE organization_id=? AND role_key='MAINTENANCE_DISPATCHER'
    AND duty_key='DEFECT_TO_REPAIR_CHAIN'`).bind(scope.context.organizationId).first<{ id: string }>();
}

async function createException(scope: Scope, caseId: string, title: string, detail: string, severity: "MEDIUM" | "HIGH" | "CRITICAL") {
  const existing = await database().prepare(`SELECT id FROM automation_exceptions WHERE organization_id=? AND property_id=?
    AND source_type='MAINTENANCE_CASE' AND source_id=? AND title=? AND status='OPEN' LIMIT 1`)
    .bind(scope.context.organizationId, scope.property.id, caseId, title).first<{ id: string }>();
  if (existing) return existing.id;
  const manager = await managerFor(scope), recipient = manager?.user_email || scope.context.email, now = new Date().toISOString(), id = crypto.randomUUID();
  await database().batch([
    database().prepare(`INSERT INTO automation_exceptions(id,organization_id,property_id,source_type,source_id,exception_state,severity,
      title,detail,extracted_json,missing_fields_json,recommended_action,owner_email,status,retry_count,next_retry_at,created_at,updated_at)
      VALUES(?,?,?,'MAINTENANCE_CASE',?,'NEEDS_HUMAN',?,?,?,'{}','[]','Open the Maintenance case, review the trace, and record a decision.',?,'OPEN',0,NULL,?,?)`)
      .bind(id, scope.context.organizationId, scope.property.id, caseId, severity, title, detail, recipient, now, now),
    database().prepare(`INSERT INTO staff_notifications(id,organization_id,event_id,recipient_email,sender_email,title,message,status,created_at,read_at)
      VALUES(?,?,NULL,?,'AAIQ-MAINTENANCE',?,?,'unread',?,NULL)`)
      .bind(crypto.randomUUID(), scope.context.organizationId, recipient, title, detail, now),
  ]);
  return id;
}

async function appendEvent(scope: Scope, caseId: string, eventType: string, fromState: string | null, toState: string | null,
  actorType: "USER" | "SYSTEM", actorId: string, detail: Record<string, unknown>) {
  await database().prepare(`INSERT INTO maintenance_case_events(id,organization_id,property_id,case_id,event_type,from_state,to_state,
    actor_type,actor_id,detail_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(), scope.context.organizationId, scope.property.id, caseId, eventType, fromState, toState,
      actorType, actorId, JSON.stringify(detail), new Date().toISOString()).run();
}

async function eligibleAssignee(scope: Scope, requested?: string | null) {
  const roster = await maintenanceRoster(scope);
  if (requested) return roster.find(person => person.email === requested.toLowerCase()) || null;
  return roster[0] || null;
}

function legacyRisk(order: Record<string, any>) {
  const text = `${order.title || ""} ${order.description || ""}`.toUpperCase();
  const hazardType = /FIRE|SMOKE|GAS/.test(text) ? "FIRE_SMOKE_GAS" : /ARC|SHOCK|ELECTRIC/.test(text) ? "ELECTRICAL_SHOCK" :
    /FLOOD|BURST PIPE/.test(text) ? "ACTIVE_FLOOD" : /LEAK/.test(text) ? "WATER_LEAK" : /LOCK|SECURITY/.test(text) ? "LOCK_SECURITY" : "NONE";
  return classifyMaintenanceRisk({ hazardType, guestImpact: /GUEST|OCCUPIED/.test(text), roomOutage: Boolean(order.room_number) || /OUT OF ORDER|OOO|DOWN/.test(text), activeLeak: /ACTIVE LEAK/.test(text) });
}

async function adoptLegacyMaintenance(scope: Scope) {
  const legacy = await database().prepare(`SELECT w.* FROM operational_work_orders w LEFT JOIN maintenance_cases c
    ON c.organization_id=w.organization_id AND c.property_id=w.property_id AND c.work_order_id=w.id
    WHERE w.organization_id=? AND w.property_id=? AND w.department='MAINTENANCE' AND c.id IS NULL`)
    .bind(scope.context.organizationId, scope.property.id).all<Record<string, any>>();
  if (!legacy.results.length) return 0;
  const roster = await maintenanceRoster(scope), eligible = new Set(roster.map(person => person.email)), now = new Date();
  for (const order of legacy.results) {
    const risk = legacyRisk(order), completed = ["COMPLETE", "VERIFIED"].includes(String(order.status)), requested = String(order.assigned_to || "").toLowerCase();
    const chosen = eligible.has(requested) ? roster.find(person => person.email === requested)! : roster[0] || null;
    const state: MaintenanceState = String(order.status) === "VERIFIED" ? "RETURNED_TO_SERVICE" : completed ? "AWAITING_VERIFICATION" :
      risk.safetyHold ? "SAFETY_HOLD" : chosen ? "ASSIGNED" : "UNASSIGNED";
    const id = crypto.randomUUID(), dueAt = order.due_at || new Date(now.getTime() + risk.responseTargetMinutes * 60_000).toISOString();
    await database().prepare(`INSERT INTO maintenance_cases(id,organization_id,property_id,work_order_id,source_type,source_reference,
      idempotency_key,summary,description,room_number,asset_id,hazard_type,guest_impact,room_outage,active_leak,safety_hold,priority,
      response_target_minutes,classification_reason,risk_facts_json,state,assigned_to_email,assignment_reason,warranty_disposition,due_at,
      returned_to_service_at,outage_started_at,outage_ended_at,created_by,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id, scope.context.organizationId, scope.property.id, order.id,
        String(order.work_type) === "HOUSEKEEPING_ESCALATION" ? "HOUSEKEEPING" : String(order.work_type) === "COMPLIANCE" ? "COMPLIANCE" : "MANUAL",
        `legacy-work-order:${order.id}`, `legacy:${order.id}`, String(order.title || "Maintenance work order"), String(order.description || ""), order.room_number ?? null,
        order.asset_id ?? null, risk.facts.find(fact => fact.startsWith("hazard:"))?.slice(7).toUpperCase() || "NONE", risk.facts.includes("current guest impact") ? 1 : 0,
        order.room_number ? 1 : 0, risk.facts.includes("active water leak") ? 1 : 0, risk.safetyHold ? 1 : 0, risk.priority,
        risk.responseTargetMinutes, risk.reason, JSON.stringify(risk.facts), state, chosen?.email || null,
        chosen ? `Adopted with eligible property roster member ${chosen.email}.` : "No eligible Maintenance employee was available during adoption.",
        "UNKNOWN", dueAt, state === "RETURNED_TO_SERVICE" ? order.completed_at || now.toISOString() : null,
        order.room_number && !completed ? order.created_at : null, state === "RETURNED_TO_SERVICE" ? order.completed_at || now.toISOString() : null,
        String(order.created_by || "AAIQ-MAINTENANCE-ADOPTION"), String(order.created_at || now.toISOString()), now.toISOString()).run();
    await appendEvent(scope, id, "LEGACY_WORK_ORDER_ADOPTED", null, state, "SYSTEM", "AAIQ-MAINTENANCE-ADOPTION",
      { workOrderId: order.id, originalStatus: order.status, originalAssignedTo: order.assigned_to, assignedTo: chosen?.email || null, policy: MAINTENANCE_POLICY_VERSION });
    if (!chosen) await createException(scope, id, `Unassigned Maintenance case · ${order.title}`, "No active property-scoped Maintenance employee is available.", "HIGH");
    if (risk.safetyHold) await createException(scope, id, `Safety hold · ${order.title}`, risk.reason, "CRITICAL");
  }
  return legacy.results.length;
}

export async function maintenanceCenter(email: string, requestedPropertyId?: string | null) {
  const scope = await scopeFor(email, requestedPropertyId);
  if (!scope) return null;
  await ensureDigitalDuty(scope);
  const adopted = await adoptLegacyMaintenance(scope);
  const [cases, events, diagnoses, actions, parts, evidence, reviews, assets, inventory, exceptions] = await Promise.all([
    database().prepare(`SELECT c.*,w.title work_order_title,w.status work_order_status,w.progress work_order_progress,
      a.name asset_name,a.code asset_code,a.manufacturer,a.model,a.serial_number,a.warranty_expires_at
      FROM maintenance_cases c JOIN operational_work_orders w ON w.id=c.work_order_id AND w.organization_id=c.organization_id AND w.property_id=c.property_id
      LEFT JOIN property_assets a ON a.id=c.asset_id AND a.organization_id=c.organization_id AND a.property_id=c.property_id
      WHERE c.organization_id=? AND c.property_id=? ORDER BY CASE c.priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END,c.created_at DESC`)
      .bind(scope.context.organizationId, scope.property.id).all(),
    database().prepare(`SELECT * FROM maintenance_case_events WHERE organization_id=? AND property_id=? ORDER BY created_at DESC LIMIT 500`)
      .bind(scope.context.organizationId, scope.property.id).all(),
    database().prepare(`SELECT * FROM maintenance_diagnoses WHERE organization_id=? AND property_id=? ORDER BY created_at DESC`)
      .bind(scope.context.organizationId, scope.property.id).all(),
    database().prepare(`SELECT * FROM maintenance_repair_actions WHERE organization_id=? AND property_id=? ORDER BY created_at DESC`)
      .bind(scope.context.organizationId, scope.property.id).all(),
    database().prepare(`SELECT * FROM maintenance_parts_reservations WHERE organization_id=? AND property_id=? ORDER BY reserved_at DESC`)
      .bind(scope.context.organizationId, scope.property.id).all(),
    database().prepare(`SELECT l.*,r.review_status,r.reviewer_email,r.reviewer_note,a.file_name,a.content_type,a.size_bytes
      FROM maintenance_evidence_links l JOIN work_evidence_reviews r ON r.attachment_id=l.attachment_id
      JOIN work_order_attachments a ON a.id=l.attachment_id WHERE l.organization_id=? AND l.property_id=? ORDER BY l.created_at DESC`)
      .bind(scope.context.organizationId, scope.property.id).all(),
    database().prepare(`SELECT * FROM maintenance_return_to_service_reviews WHERE organization_id=? AND property_id=? ORDER BY created_at DESC`)
      .bind(scope.context.organizationId, scope.property.id).all(),
    database().prepare(`SELECT id,asset_type,code,name,room_number,manufacturer,model,serial_number,warranty_expires_at,status
      FROM property_assets WHERE organization_id=? AND property_id=? AND asset_type IN ('ROOM','SPACE','EQUIPMENT') ORDER BY asset_type,code`)
      .bind(scope.context.organizationId, scope.property.id).all(),
    database().prepare(`SELECT sku,name,category,quantity,committed_quantity,issue_unit FROM supply_inventory
      WHERE organization_id=? AND property_id=? ORDER BY category,name`).bind(scope.context.organizationId, scope.property.id).all(),
    database().prepare(`SELECT id,source_id,severity,title,detail,owner_email,status,created_at FROM automation_exceptions
      WHERE organization_id=? AND property_id=? AND source_type='MAINTENANCE_CASE' ORDER BY created_at DESC LIMIT 100`)
      .bind(scope.context.organizationId, scope.property.id).all(),
  ]);
  const roster = await maintenanceRoster(scope), rows = (cases.results as Record<string, any>[]).map(item => ({ ...item,
    events: (events.results as Record<string, any>[]).filter(row => row.case_id === item.id),
    diagnoses: (diagnoses.results as Record<string, any>[]).filter(row => row.case_id === item.id),
    actions: (actions.results as Record<string, any>[]).filter(row => row.case_id === item.id),
    parts: (parts.results as Record<string, any>[]).filter(row => row.case_id === item.id),
    evidence: (evidence.results as Record<string, any>[]).filter(row => row.case_id === item.id),
    reviews: (reviews.results as Record<string, any>[]).filter(row => row.case_id === item.id),
    exceptions: (exceptions.results as Record<string, any>[]).filter(row => row.source_id === item.id),
  }));
  return { roleMode: scope.canManage ? "SUPERVISOR" : "TECHNICIAN", property: scope.property, roster, cases: rows,
    assets: assets.results, inventory: inventory.results, requiredEvidence: MAINTENANCE_EVIDENCE, policyVersion: MAINTENANCE_POLICY_VERSION,
    adoptedLegacyOrders: adopted, limitations: { physicalRepairHuman: true, lifeSafetyHuman: true, externalCommitmentsApprovalRequired: true,
      visionProviderConnected: false, briefingAgentReadOnly: true } };
}

export async function createMaintenanceCase(email: string, input: Record<string, unknown>, requestedPropertyId?: string | null) {
  const scope = await scopeFor(email, requestedPropertyId);
  if (!scope) return null;
  const summary = String(input.summary || "").trim().slice(0, 160), description = String(input.description || "").trim().slice(0, 3000);
  if (!summary || !description) throw new Error("A factual defect summary and description are required.");
  const sourceType = ["HOUSEKEEPING","FRONT_DESK","GUEST","PMS_REPORT","EMAIL_ATTACHMENT","MANUAL","IOT_ALERT","COMPLIANCE"]
    .includes(String(input.sourceType || "").toUpperCase()) ? String(input.sourceType).toUpperCase() : "MANUAL";
  const sourceReference = String(input.sourceReference || "direct-entry").trim().slice(0, 240), room = String(input.roomNumber || "").trim().slice(0, 20) || null;
  const assetId = String(input.assetId || "").trim() || null;
  if (assetId) {
    const asset = await database().prepare(`SELECT id,room_number FROM property_assets WHERE id=? AND organization_id=? AND property_id=? AND status!='INACTIVE'`)
      .bind(assetId, scope.context.organizationId, scope.property.id).first<Record<string, any>>();
    if (!asset) throw new Error("The selected asset is not active in this property.");
  }
  const normalized = JSON.stringify({ sourceType, sourceReference, summary: summary.toLowerCase(), room, assetId });
  const idempotencyKey = await sha256(normalized), existing = await database().prepare(`SELECT id FROM maintenance_cases
    WHERE organization_id=? AND property_id=? AND idempotency_key=?`).bind(scope.context.organizationId, scope.property.id, idempotencyKey).first<{ id: string }>();
  if (existing) return { id: existing.id, duplicate: true };
  const hazardType = String(input.hazardType || "NONE").toUpperCase(), risk = classifyMaintenanceRisk({ hazardType,
    guestImpact: Boolean(input.guestImpact), roomOutage: Boolean(input.roomOutage), activeLeak: Boolean(input.activeLeak) });
  const assignee = await eligibleAssignee(scope), state: MaintenanceState = risk.safetyHold ? "SAFETY_HOLD" : assignee ? "ASSIGNED" : "UNASSIGNED";
  const now = new Date(), id = crypto.randomUUID(), workOrderId = crypto.randomUUID(), dueAt = new Date(now.getTime() + risk.responseTargetMinutes * 60_000).toISOString();
  const assignmentReason = risk.safetyHold ? "Repair authority is paused until a qualified human clears the safety hold." : assignee ?
    `${assignee.clockedIn ? "Clocked-in" : "Active"} eligible property technician with ${assignee.openLoad} open case(s).` :
    "No active property-scoped Maintenance employee was available.";
  await database().batch([
    database().prepare(`INSERT INTO operational_work_orders(id,organization_id,property_id,department,work_type,title,description,room_number,
      asset_id,assigned_to,status,progress,priority,parent_order_id,due_at,created_by,created_at,updated_at,completed_at)
      VALUES(?,?,?,'MAINTENANCE','CORRECTIVE_REPAIR',?,?,?,?,?,?,?,?,NULL,?,?,?,?,NULL)`)
      .bind(workOrderId, scope.context.organizationId, scope.property.id, summary, description, room, assetId, assignee?.email || null,
        maintenanceWorkOrderStatus(state), maintenanceProgress(state), risk.priority, dueAt, scope.context.email, now.toISOString(), now.toISOString()),
    database().prepare(`INSERT INTO maintenance_cases(id,organization_id,property_id,work_order_id,source_type,source_reference,idempotency_key,
      summary,description,room_number,asset_id,hazard_type,guest_impact,room_outage,active_leak,safety_hold,priority,response_target_minutes,
      classification_reason,risk_facts_json,state,assigned_to_email,assignment_reason,warranty_disposition,due_at,outage_started_at,
      created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id, scope.context.organizationId, scope.property.id, workOrderId, sourceType, sourceReference, idempotencyKey, summary, description,
        room, assetId, hazardType, input.guestImpact ? 1 : 0, input.roomOutage ? 1 : 0, input.activeLeak ? 1 : 0, risk.safetyHold ? 1 : 0,
        risk.priority, risk.responseTargetMinutes, risk.reason, JSON.stringify(risk.facts), state, assignee?.email || null, assignmentReason,
        "UNKNOWN", dueAt, input.roomOutage ? now.toISOString() : null, scope.context.email, now.toISOString(), now.toISOString()),
  ]);
  await appendEvent(scope, id, "CASE_CREATED_AND_TRIAGED", null, state, "SYSTEM", "AAIQ-DIGITAL-MAINTENANCE",
    { sourceType, sourceReference, risk, assignedTo: assignee?.email || null, assignmentReason, policy: MAINTENANCE_POLICY_VERSION });
  await recordSystemAudit({ organizationId: scope.context.organizationId, propertyId: scope.property.id,
    eventType: "MAINTENANCE_CASE_CREATED", entityType: "MAINTENANCE_CASE", entityId: id, authorType: "USER", authorId: scope.context.email,
    correlationId: id, delta: { workOrderId, sourceType, priority: risk.priority, state, assignedTo: assignee?.email || null, policy: MAINTENANCE_POLICY_VERSION } });
  await emitReportEvent({ organizationId: scope.context.organizationId, propertyId: scope.property.id, sourceModule: "MAINTENANCE",
    eventType: "MAINTENANCE_CASE_CREATED", entityType: "maintenance_case", entityId: id,
    idempotencyKey: `maintenance:${id}:created`, occurredAt: now.toISOString(), payload: { workOrderId, sourceType, risk, state },
    facts: [{ factType: "maintenance-work", entityType: "maintenance_case", entityId: id, sourceTable: "maintenance_cases",
      sourceRecordId: id, department: "MAINTENANCE", employeeEmail: assignee?.email || null, roomReference: room, status: state,
      occurredAt: now.toISOString(), dimensions: { priority: risk.priority, sourceType, workType: "CORRECTIVE_REPAIR", policy: MAINTENANCE_POLICY_VERSION } }] });
  if (!assignee) await createException(scope, id, `Unassigned Maintenance case · ${summary}`, "No eligible Maintenance employee is assigned to this property.", "HIGH");
  if (risk.safetyHold) await createException(scope, id, `Safety hold · ${summary}`, risk.reason, "CRITICAL");
  return { id, workOrderId, state, priority: risk.priority, assignedTo: assignee?.email || null, duplicate: false };
}

async function loadCase(scope: Scope, id: string) {
  return database().prepare(`SELECT c.*,a.warranty_expires_at FROM maintenance_cases c LEFT JOIN property_assets a
    ON a.id=c.asset_id AND a.organization_id=c.organization_id AND a.property_id=c.property_id
    WHERE c.id=? AND c.organization_id=? AND c.property_id=?`).bind(id, scope.context.organizationId, scope.property.id).first<Record<string, any>>();
}

function operatorAllowed(scope: Scope, item: Record<string, any>) {
  return scope.canManage || String(item.assigned_to_email || "").toLowerCase() === scope.context.email.toLowerCase();
}

async function transition(scope: Scope, item: Record<string, any>, next: MaintenanceState, eventType: string,
  actorType: "USER" | "SYSTEM", actorId: string, detail: Record<string, unknown>, safetyCleared = false) {
  assertMaintenanceTransition(String(item.state), next, { safetyCleared });
  const now = new Date().toISOString(), progress = maintenanceProgress(next), workStatus = maintenanceWorkOrderStatus(next);
  await database().batch([
    database().prepare(`UPDATE maintenance_cases SET state=?,safety_hold=CASE WHEN ?='SAFETY_HOLD' THEN 1 WHEN ? THEN 0 ELSE safety_hold END,
      acknowledged_at=CASE WHEN ?='ACKNOWLEDGED' THEN COALESCE(acknowledged_at,?) ELSE acknowledged_at END,
      diagnosis_completed_at=CASE WHEN ?='REPAIRING' THEN COALESCE(diagnosis_completed_at,?) ELSE diagnosis_completed_at END,
      repair_started_at=CASE WHEN ?='REPAIRING' THEN COALESCE(repair_started_at,?) ELSE repair_started_at END,
      repair_completed_at=CASE WHEN ?='TESTING' THEN COALESCE(repair_completed_at,?) ELSE repair_completed_at END,
      verification_requested_at=CASE WHEN ?='AWAITING_VERIFICATION' THEN ? ELSE verification_requested_at END,
      returned_to_service_at=CASE WHEN ?='RETURNED_TO_SERVICE' THEN ? ELSE returned_to_service_at END,
      outage_ended_at=CASE WHEN ?='RETURNED_TO_SERVICE' THEN ? ELSE outage_ended_at END,updated_at=?
      WHERE id=? AND organization_id=? AND property_id=?`)
      .bind(next, next, safetyCleared ? 1 : 0, next, now, next, now, next, now, next, now, next, now, next, now, next, now, now,
        item.id, scope.context.organizationId, scope.property.id),
    database().prepare(`UPDATE operational_work_orders SET status=?,progress=?,assigned_to=?,updated_at=?,
      completed_at=CASE WHEN ?='VERIFIED' THEN ? ELSE completed_at END WHERE id=? AND organization_id=? AND property_id=?`)
      .bind(workStatus, progress, item.assigned_to_email, now, workStatus, now, item.work_order_id, scope.context.organizationId, scope.property.id),
  ]);
  await appendEvent(scope, item.id, eventType, String(item.state), next, actorType, actorId, detail);
  const auditDetail = JSON.parse(JSON.stringify(detail)) as Record<string, string | number | boolean | null>;
  await recordSystemAudit({ organizationId: scope.context.organizationId, propertyId: scope.property.id, eventType,
    entityType: "MAINTENANCE_CASE", entityId: item.id, authorType: actorType, authorId: actorId, correlationId: item.id,
    before: { state: String(item.state) }, after: { state: next }, delta: auditDetail });
  await emitReportEvent({ organizationId: scope.context.organizationId, propertyId: scope.property.id, sourceModule: "MAINTENANCE",
    eventType, entityType: "maintenance_case", entityId: item.id, idempotencyKey: `maintenance:${item.id}:${eventType}:${now}`,
    occurredAt: now, payload: { fromState: item.state, toState: next, ...detail }, facts: [{ factType: "maintenance-work",
      entityType: "maintenance_case", entityId: item.id, sourceTable: "maintenance_cases", sourceRecordId: item.id,
      department: "MAINTENANCE", employeeEmail: item.assigned_to_email, roomReference: item.room_number, status: next,
      occurredAt: now, dimensions: { priority: item.priority, eventType, policy: MAINTENANCE_POLICY_VERSION } }] });
  return { id: item.id, state: next };
}

export async function actOnMaintenanceCase(email: string, id: string, input: Record<string, unknown>, requestedPropertyId?: string | null) {
  const scope = await scopeFor(email, requestedPropertyId);
  if (!scope) return null;
  const item = await loadCase(scope, id);
  if (!item) return null;
  const action = String(input.action || "").toUpperCase(), now = new Date().toISOString();
  if (action === "REASSIGN") {
    if (!scope.canManage) return null;
    const assignee = await eligibleAssignee(scope, String(input.assignedToEmail || ""));
    if (!assignee) throw new Error("Choose an active Maintenance employee assigned to this property.");
    const next = item.state === "UNASSIGNED" ? "ASSIGNED" : item.state as MaintenanceState;
    if (item.state === "UNASSIGNED") assertMaintenanceTransition(item.state, next);
    await database().batch([
      database().prepare(`UPDATE maintenance_cases SET assigned_to_email=?,assignment_reason=?,state=?,updated_at=? WHERE id=? AND organization_id=? AND property_id=?`)
        .bind(assignee.email, `Supervisor selected an eligible property technician with ${assignee.openLoad} open case(s).`, next, now, id, scope.context.organizationId, scope.property.id),
      database().prepare(`UPDATE operational_work_orders SET assigned_to=?,status=?,progress=?,updated_at=? WHERE id=? AND organization_id=? AND property_id=?`)
        .bind(assignee.email, maintenanceWorkOrderStatus(next), maintenanceProgress(next), now, item.work_order_id, scope.context.organizationId, scope.property.id),
    ]);
    await appendEvent(scope, id, "MAINTENANCE_CASE_REASSIGNED", item.state, next, "USER", scope.context.email,
      { from: item.assigned_to_email, to: assignee.email, eligiblePropertyRoster: true });
    await recordSystemAudit({ organizationId: scope.context.organizationId, propertyId: scope.property.id, eventType: "MAINTENANCE_CASE_REASSIGNED",
      entityType: "MAINTENANCE_CASE", entityId: id, authorType: "USER", authorId: scope.context.email, correlationId: id,
      before: { assignedTo: item.assigned_to_email }, after: { assignedTo: assignee.email }, delta: { eligiblePropertyRoster: true } });
    return { id, state: next, assignedTo: assignee.email };
  }
  if (!operatorAllowed(scope, item)) return null;
  if (action === "ACKNOWLEDGE") return transition(scope, item, "ACKNOWLEDGED", "MAINTENANCE_CASE_ACKNOWLEDGED", "USER", scope.context.email, {});
  if (action === "START_DIAGNOSIS") return transition(scope, item, "DIAGNOSING", "MAINTENANCE_DIAGNOSIS_STARTED", "USER", scope.context.email, {});
  if (action === "SAVE_DIAGNOSIS") {
    if (item.state !== "DIAGNOSING") throw new Error("Start diagnosis before recording findings.");
    const finding = String(input.finding || "").trim().slice(0, 2000), cause = String(input.probableCause || "").trim().slice(0, 1000),
      failureCode = String(input.failureCode || "UNCLASSIFIED").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "_").slice(0, 60),
      warranty = ["UNKNOWN","NOT_APPLICABLE","CLAIM_RECOMMENDED","AUTHORIZED_REPAIR"].includes(String(input.warrantyDisposition)) ? String(input.warrantyDisposition) : "UNKNOWN";
    if (!finding || !cause) throw new Error("The factual finding and probable cause are required.");
    await database().batch([
      database().prepare(`INSERT INTO maintenance_diagnoses(id,organization_id,property_id,case_id,failure_code,finding,probable_cause,
        warranty_disposition,diagnosed_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)`)
        .bind(crypto.randomUUID(), scope.context.organizationId, scope.property.id, id, failureCode, finding, cause, warranty, scope.context.email, now),
      database().prepare(`UPDATE maintenance_cases SET warranty_disposition=?,diagnosis_completed_at=?,updated_at=?
        WHERE id=? AND organization_id=? AND property_id=?`).bind(warranty, now, now, id, scope.context.organizationId, scope.property.id),
    ]);
    await appendEvent(scope, id, "MAINTENANCE_DIAGNOSIS_RECORDED", item.state, item.state, "USER", scope.context.email,
      { failureCode, warrantyDisposition: warranty, finding, probableCause: cause });
    await recordSystemAudit({ organizationId: scope.context.organizationId, propertyId: scope.property.id, eventType: "MAINTENANCE_DIAGNOSIS_RECORDED",
      entityType: "MAINTENANCE_CASE", entityId: id, authorType: "USER", authorId: scope.context.email, correlationId: id,
      delta: { failureCode, warrantyDisposition: warranty } });
    return { id, state: item.state, diagnosisRecorded: true };
  }
  if (action === "START_REPAIR") {
    const diagnosis = await database().prepare(`SELECT id,warranty_disposition FROM maintenance_diagnoses WHERE organization_id=? AND property_id=? AND case_id=? ORDER BY created_at DESC LIMIT 1`)
      .bind(scope.context.organizationId, scope.property.id, id).first<Record<string, any>>();
    if (!diagnosis) throw new Error("Record the diagnosis before starting repair.");
    const warrantyActive = item.warranty_expires_at && new Date(String(item.warranty_expires_at)).getTime() >= Date.now();
    if (warrantyActive && ["UNKNOWN", "CLAIM_RECOMMENDED"].includes(String(diagnosis.warranty_disposition))) {
      throw new Error("This asset appears to be under warranty. Obtain and record repair authorization, or document why the warranty is not applicable, before repair.");
    }
    return transition(scope, item, "REPAIRING", "MAINTENANCE_REPAIR_STARTED", "USER", scope.context.email,
      { diagnosisId: diagnosis.id, warrantyDisposition: diagnosis.warranty_disposition });
  }
  if (action === "RESERVE_PART") {
    if (!["DIAGNOSING","REPAIRING","AWAITING_PART"].includes(item.state)) throw new Error("Parts can be reserved only during diagnosis or repair.");
    const sku = String(input.sku || "").trim(), quantity = Number(input.quantity);
    if (!sku || !Number.isInteger(quantity) || quantity < 1) throw new Error("Choose a part and enter a valid whole quantity.");
    const stock = await database().prepare(`SELECT name,quantity,committed_quantity FROM supply_inventory WHERE organization_id=? AND property_id=? AND sku=?`)
      .bind(scope.context.organizationId, scope.property.id, sku).first<Record<string, any>>();
    if (!stock || Number(stock.quantity) - Number(stock.committed_quantity || 0) < quantity) {
      if (item.state !== "AWAITING_PART") await transition(scope, item, "AWAITING_PART", "MAINTENANCE_PART_UNAVAILABLE", "SYSTEM", "AAIQ-MAINTENANCE-PARTS",
        { sku, quantity, available: stock ? Number(stock.quantity) - Number(stock.committed_quantity || 0) : 0 });
      await createException(scope, id, `Part approval required · ${sku || "unknown item"}`,
        "Property stock is insufficient. AAIQ did not order or financially commit; management must approve replenishment.", "HIGH");
      return { id, state: "AWAITING_PART", reserved: false };
    }
    const reservationId = crypto.randomUUID();
    await database().batch([
      database().prepare(`UPDATE supply_inventory SET committed_quantity=committed_quantity+?,updated_at=?
        WHERE organization_id=? AND property_id=? AND sku=?`).bind(quantity, now, scope.context.organizationId, scope.property.id, sku),
      database().prepare(`INSERT INTO maintenance_parts_reservations(id,organization_id,property_id,case_id,sku,quantity,status,reserved_by,reserved_at)
        VALUES(?,?,?,?,?,?,'RESERVED',?,?)`).bind(reservationId, scope.context.organizationId, scope.property.id, id, sku, quantity, scope.context.email, now),
    ]);
    await appendEvent(scope, id, "MAINTENANCE_PART_RESERVED", item.state, item.state, "USER", scope.context.email,
      { reservationId, sku, quantity, localReservationOnly: true });
    await recordSystemAudit({ organizationId: scope.context.organizationId, propertyId: scope.property.id, eventType: "MAINTENANCE_PART_RESERVED",
      entityType: "MAINTENANCE_CASE", entityId: id, authorType: "USER", authorId: scope.context.email, correlationId: id,
      delta: { reservationId, sku, quantity, localReservationOnly: true } });
    return { id, state: item.state, reservationId, reserved: true };
  }
  if (action === "RESUME_WITH_PART") {
    if (item.state !== "AWAITING_PART") throw new Error("This case is not waiting for a part.");
    const reserved = await database().prepare(`SELECT id FROM maintenance_parts_reservations WHERE organization_id=? AND property_id=? AND case_id=? AND status='RESERVED' LIMIT 1`)
      .bind(scope.context.organizationId, scope.property.id, id).first();
    if (!reserved) throw new Error("Reserve the required property stock before resuming repair.");
    return transition(scope, item, "REPAIRING", "MAINTENANCE_REPAIR_RESUMED", "USER", scope.context.email, { reservationVerified: true });
  }
  if (action === "RECORD_ACTION") {
    const actionType = String(input.actionType || "").toUpperCase();
    if (item.state === "TESTING" ? actionType !== "TEST" : item.state !== "REPAIRING" || !["REPAIR","OBSERVATION","TEMPORARY_CONTROL"].includes(actionType)) {
      throw new Error(item.state === "TESTING" ? "Record a TEST result during the testing stage." : "Repair actions can be recorded only while repair is active.");
    }
    const description = String(input.description || "").trim().slice(0, 2000), outcome = String(input.outcome || "").trim().toUpperCase().slice(0, 80);
    if (!description || !outcome) throw new Error("A factual action description and outcome are required.");
    const measurement = input.measurementValue === "" || input.measurementValue == null ? null : Number(input.measurementValue);
    if (measurement !== null && !Number.isFinite(measurement)) throw new Error("Measurement must be numeric.");
    const actionId = crypto.randomUUID();
    await database().prepare(`INSERT INTO maintenance_repair_actions(id,organization_id,property_id,case_id,action_type,description,outcome,
      measurement_value,measurement_unit,performed_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(actionId, scope.context.organizationId, scope.property.id, id, actionType, description, outcome, measurement,
        String(input.measurementUnit || "").trim().slice(0, 40) || null, scope.context.email, now).run();
    await appendEvent(scope, id, `MAINTENANCE_${actionType}_RECORDED`, item.state, item.state, "USER", scope.context.email,
      { actionId, outcome, measurement, measurementUnit: input.measurementUnit || null });
    await recordSystemAudit({ organizationId: scope.context.organizationId, propertyId: scope.property.id,
      eventType: `MAINTENANCE_${actionType}_RECORDED`, entityType: "MAINTENANCE_CASE", entityId: id,
      authorType: "USER", authorId: scope.context.email, correlationId: id, delta: { actionId, outcome } });
    return { id, state: item.state, actionId };
  }
  if (action === "START_TESTING") {
    const repair = await database().prepare(`SELECT id FROM maintenance_repair_actions WHERE organization_id=? AND property_id=? AND case_id=? AND action_type='REPAIR' LIMIT 1`)
      .bind(scope.context.organizationId, scope.property.id, id).first();
    if (!repair) throw new Error("Record at least one repair action before testing.");
    return transition(scope, item, "TESTING", "MAINTENANCE_TESTING_STARTED", "USER", scope.context.email, {});
  }
  if (action === "SUBMIT_VERIFICATION") {
    const test = await database().prepare(`SELECT id,outcome FROM maintenance_repair_actions WHERE organization_id=? AND property_id=? AND case_id=? AND action_type='TEST' ORDER BY created_at DESC LIMIT 1`)
      .bind(scope.context.organizationId, scope.property.id, id).first<Record<string, any>>();
    if (!test || !/PASS|NORMAL|WORKING|VERIFIED/.test(String(test.outcome).toUpperCase())) throw new Error("Record a passing factual test result before requesting verification.");
    const evidence = await database().prepare(`SELECT evidence_area,evidence_stage,review_status FROM maintenance_evidence_links l
      JOIN work_evidence_reviews r ON r.attachment_id=l.attachment_id WHERE l.organization_id=? AND l.property_id=? AND l.case_id=?`)
      .bind(scope.context.organizationId, scope.property.id, id).all<Record<string, any>>();
    const covered = new Set(evidence.results.map(row => `${row.evidence_area}:${row.evidence_stage}`));
    const missing = MAINTENANCE_EVIDENCE.filter(required => !covered.has(`${required.area}:${required.stage}`));
    if (missing.length) throw new Error(`Add required private evidence for: ${missing.map(item => item.label).join(", ")}.`);
    if (evidence.results.some(row => row.review_status === "REWORK_REQUIRED")) throw new Error("Correct the evidence marked for rework before requesting verification.");
    return transition(scope, item, "AWAITING_VERIFICATION", "MAINTENANCE_VERIFICATION_REQUESTED", "USER", scope.context.email,
      { testActionId: test.id, evidenceCoverage: MAINTENANCE_EVIDENCE.length });
  }
  if (action === "VERIFY_RETURN") {
    if (!scope.canManage) return null;
    if (item.state !== "AWAITING_VERIFICATION") throw new Error("This case is not awaiting return-to-service verification.");
    const performer = await database().prepare(`SELECT performed_by FROM maintenance_repair_actions WHERE organization_id=? AND property_id=?
      AND case_id=? AND action_type='REPAIR' ORDER BY created_at DESC LIMIT 1`).bind(scope.context.organizationId, scope.property.id, id).first<{ performed_by: string }>();
    if (performer && performer.performed_by.toLowerCase() === scope.context.email.toLowerCase()) throw new Error("The repair performer cannot approve their own return-to-service decision.");
    const checklist = typeof input.checklist === "object" && input.checklist ? input.checklist as Record<string, unknown> : {};
    const required = ["repairVerified","testVerified","areaSafe","assetOperational","documentationComplete"];
    if (!required.every(key => checklist[key] === true)) throw new Error("Every return-to-service checklist item must be confirmed.");
    const decision = ["APPROVED","REWORK_REQUIRED","SAFETY_HOLD"].includes(String(input.decision)) ? String(input.decision) : "REWORK_REQUIRED",
      note = String(input.note || "").trim().slice(0, 1500);
    if (!note) throw new Error("A verifier note is required.");
    const reviewId = crypto.randomUUID(), next: MaintenanceState = decision === "APPROVED" ? "RETURNED_TO_SERVICE" : decision === "SAFETY_HOLD" ? "SAFETY_HOLD" : "REWORK_REQUIRED";
    await database().prepare(`INSERT INTO maintenance_return_to_service_reviews(id,organization_id,property_id,case_id,decision,checklist_json,
      reviewer_email,reviewer_note,created_at) VALUES(?,?,?,?,?,?,?,?,?)`)
      .bind(reviewId, scope.context.organizationId, scope.property.id, id, decision, JSON.stringify(checklist), scope.context.email, note, now).run();
    if (decision === "APPROVED") {
      const reservations = await database().prepare(`SELECT id,sku,quantity FROM maintenance_parts_reservations WHERE organization_id=? AND property_id=? AND case_id=? AND status='RESERVED'`)
        .bind(scope.context.organizationId, scope.property.id, id).all<Record<string, any>>();
      const statements: D1PreparedStatement[] = [database().prepare(`UPDATE work_evidence_reviews SET review_status='MANAGER_APPROVED',reviewer_email=?,reviewer_note=?,reviewed_at=?
        WHERE organization_id=? AND property_id=? AND work_order_id=? AND review_status='PENDING_SUPERVISOR_REVIEW'`)
        .bind(scope.context.email, note, now, scope.context.organizationId, scope.property.id, item.work_order_id)];
      for (const reservation of reservations.results) statements.push(
        database().prepare(`UPDATE supply_inventory SET quantity=MAX(0,quantity-?),committed_quantity=MAX(0,committed_quantity-?),updated_at=?
          WHERE organization_id=? AND property_id=? AND sku=?`).bind(reservation.quantity, reservation.quantity, now, scope.context.organizationId, scope.property.id, reservation.sku),
        database().prepare(`UPDATE maintenance_parts_reservations SET status='ISSUED',issued_at=? WHERE id=? AND organization_id=? AND property_id=?`)
          .bind(now, reservation.id, scope.context.organizationId, scope.property.id));
      await database().batch(statements);
    }
    return transition(scope, item, next, decision === "APPROVED" ? "MAINTENANCE_RETURN_TO_SERVICE_APPROVED" :
      decision === "SAFETY_HOLD" ? "MAINTENANCE_SAFETY_HOLD_APPLIED" : "MAINTENANCE_REWORK_REQUIRED", "USER", scope.context.email,
      { reviewId, decision, independentVerifier: true, note });
  }
  if (action === "CLEAR_SAFETY_HOLD") {
    if (!scope.canManage || item.state !== "SAFETY_HOLD") return null;
    const qualifiedPerson = String(input.qualifiedPerson || "").trim().slice(0, 160), note = String(input.note || "").trim().slice(0, 1500);
    if (!qualifiedPerson || !note) throw new Error("Name the qualified person and record the safety-clearance evidence.");
    return transition(scope, item, "DIAGNOSING", "MAINTENANCE_SAFETY_HOLD_CLEARED", "USER", scope.context.email,
      { qualifiedPerson, note, humanClearance: true }, true);
  }
  if (action === "CANCEL") {
    if (!scope.canManage) return null;
    const reason = String(input.reason || "").trim().slice(0, 1000);
    if (!reason) throw new Error("A cancellation reason is required.");
    return transition(scope, item, "CANCELLED", "MAINTENANCE_CASE_CANCELLED", "USER", scope.context.email, { reason });
  }
  throw new Error("Unsupported Maintenance action.");
}

export async function attachMaintenanceEvidence(email: string, caseId: string, file: { name: string; type: string; size: number },
  objectKey: string, digest: string, area: string, stage: string, requestedPropertyId?: string | null) {
  const scope = await scopeFor(email, requestedPropertyId);
  if (!scope) return null;
  const item = await loadCase(scope, caseId);
  if (!item || !operatorAllowed(scope, item)) return null;
  const required = MAINTENANCE_EVIDENCE.find(entry => entry.area === area && entry.stage === stage);
  if (!required) throw new Error("Choose a required Maintenance evidence view.");
  const duplicate = await database().prepare(`SELECT id FROM maintenance_evidence_links WHERE organization_id=? AND property_id=? AND case_id=?
    AND content_sha256=? AND evidence_area=? AND evidence_stage=?`).bind(scope.context.organizationId, scope.property.id, caseId, digest, area, stage).first();
  if (duplicate) return { id: String((duplicate as { id: string }).id), duplicate: true };
  const attachmentId = crypto.randomUUID(), linkId = crypto.randomUUID(), reviewId = crypto.randomUUID(), now = new Date().toISOString();
  await database().batch([
    database().prepare(`INSERT INTO work_order_attachments(id,organization_id,property_id,work_order_id,object_key,file_name,content_type,size_bytes,uploaded_by,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(attachmentId, scope.context.organizationId, scope.property.id, item.work_order_id, objectKey,
        file.name.slice(0, 180), file.type, file.size, scope.context.email, now),
    database().prepare(`INSERT INTO work_evidence_reviews(id,organization_id,property_id,work_order_id,attachment_id,evidence_area,evidence_stage,
      review_status,quality_score,deficiencies_json,provider_label,reviewer_email,reviewer_note,reviewed_at,created_at)
      VALUES(?,?,?,?,?,?,?,'PENDING_SUPERVISOR_REVIEW',NULL,'[]','UPLOAD_INTEGRITY_ONLY_V1',NULL,NULL,NULL,?)`)
      .bind(reviewId, scope.context.organizationId, scope.property.id, item.work_order_id, attachmentId, area, stage, now),
    database().prepare(`INSERT INTO maintenance_evidence_links(id,organization_id,property_id,case_id,attachment_id,content_sha256,evidence_area,evidence_stage,created_at)
      VALUES(?,?,?,?,?,?,?,?,?)`).bind(linkId, scope.context.organizationId, scope.property.id, caseId, attachmentId, digest, area, stage, now),
  ]);
  await appendEvent(scope, caseId, "MAINTENANCE_EVIDENCE_ATTACHED", item.state, item.state, "USER", scope.context.email,
    { attachmentId, area, stage, providerLabel: "UPLOAD_INTEGRITY_ONLY_V1", visualReviewClaimed: false });
  await recordSystemAudit({ organizationId: scope.context.organizationId, propertyId: scope.property.id,
    eventType: "MAINTENANCE_EVIDENCE_ATTACHED", entityType: "MAINTENANCE_CASE", entityId: caseId,
    authorType: "USER", authorId: scope.context.email, correlationId: caseId,
    delta: { attachmentId, fileName: file.name.slice(0, 180), sizeBytes: file.size, area, stage, visualReviewClaimed: false } });
  return { id: linkId, attachmentId, duplicate: false };
}

export async function maintenanceCaseTrace(email: string, caseId: string, requestedPropertyId?: string | null) {
  const scope = await scopeFor(email, requestedPropertyId);
  if (!scope) return null;
  const item = await loadCase(scope, caseId);
  if (!item) return null;
  const [events, diagnoses, actions, parts, evidence, reviews, audit] = await Promise.all([
    database().prepare(`SELECT * FROM maintenance_case_events WHERE organization_id=? AND property_id=? AND case_id=? ORDER BY created_at`)
      .bind(scope.context.organizationId, scope.property.id, caseId).all(),
    database().prepare(`SELECT * FROM maintenance_diagnoses WHERE organization_id=? AND property_id=? AND case_id=? ORDER BY created_at`)
      .bind(scope.context.organizationId, scope.property.id, caseId).all(),
    database().prepare(`SELECT * FROM maintenance_repair_actions WHERE organization_id=? AND property_id=? AND case_id=? ORDER BY created_at`)
      .bind(scope.context.organizationId, scope.property.id, caseId).all(),
    database().prepare(`SELECT * FROM maintenance_parts_reservations WHERE organization_id=? AND property_id=? AND case_id=? ORDER BY reserved_at`)
      .bind(scope.context.organizationId, scope.property.id, caseId).all(),
    database().prepare(`SELECT l.*,r.review_status,a.file_name FROM maintenance_evidence_links l JOIN work_evidence_reviews r ON r.attachment_id=l.attachment_id
      JOIN work_order_attachments a ON a.id=l.attachment_id WHERE l.organization_id=? AND l.property_id=? AND l.case_id=? ORDER BY l.created_at`)
      .bind(scope.context.organizationId, scope.property.id, caseId).all(),
    database().prepare(`SELECT * FROM maintenance_return_to_service_reviews WHERE organization_id=? AND property_id=? AND case_id=? ORDER BY created_at`)
      .bind(scope.context.organizationId, scope.property.id, caseId).all(),
    database().prepare(`SELECT * FROM system_audit_trail WHERE organization_id=? AND property_id=? AND correlation_id=? ORDER BY occurred_at`)
      .bind(scope.context.organizationId, scope.property.id, caseId).all(),
  ]);
  await recordSystemAudit({ organizationId: scope.context.organizationId, propertyId: scope.property.id,
    eventType: "MAINTENANCE_CASE_TRACE_ACCESSED", entityType: "MAINTENANCE_CASE", entityId: caseId,
    authorType: "USER", authorId: scope.context.email, correlationId: caseId, delta: { action: "VIEW" } });
  return { case: item, events: events.results, diagnoses: diagnoses.results, actions: actions.results, parts: parts.results,
    evidence: evidence.results, reviews: reviews.results, auditTimeline: audit.results };
}

export async function runMaintenanceEscalations() {
  if (!env.DB) return { escalated: 0 };
  const overdue = await database().prepare(`SELECT c.*,p.name property_name FROM maintenance_cases c JOIN property_contexts p
    ON p.id=c.property_id AND p.organization_id=c.organization_id WHERE c.state NOT IN ('RETURNED_TO_SERVICE','CANCELLED','SAFETY_HOLD')
    AND c.due_at<=? ORDER BY c.priority,c.due_at LIMIT 200`).bind(new Date().toISOString()).all<Record<string, any>>();
  let escalated = 0;
  for (const item of overdue.results) {
    const existing = await database().prepare(`SELECT id FROM automation_exceptions WHERE organization_id=? AND property_id=? AND source_type='MAINTENANCE_CASE'
      AND source_id=? AND exception_state='SLA_BREACH' AND status='OPEN' LIMIT 1`).bind(item.organization_id, item.property_id, item.id).first();
    if (existing) continue;
    const owner = await database().prepare(`SELECT m.user_email FROM property_assignments a JOIN staff_members m
      ON m.organization_id=a.organization_id AND lower(m.user_email)=lower(a.user_email) WHERE a.organization_id=? AND a.property_id=?
      AND a.status='ACTIVE' AND m.status='active' AND (upper(a.role_label) LIKE '%MANAGER%' OR upper(a.role_label) LIKE '%ADMIN%' OR m.role='admin')
      ORDER BY CASE WHEN m.role='admin' THEN 0 ELSE 1 END LIMIT 1`).bind(item.organization_id, item.property_id).first<{ user_email: string }>();
    const now = new Date().toISOString(), recipient = owner?.user_email || item.created_by;
    await database().batch([
      database().prepare(`INSERT INTO automation_exceptions(id,organization_id,property_id,source_type,source_id,exception_state,severity,title,detail,
        extracted_json,missing_fields_json,recommended_action,owner_email,status,retry_count,next_retry_at,created_at,updated_at)
        VALUES(?,?,?,'MAINTENANCE_CASE',?,'SLA_BREACH',?,?,?,'{}','[]','Review assignment, safety, parts, and current repair state.',?,'OPEN',0,NULL,?,?)`)
        .bind(crypto.randomUUID(), item.organization_id, item.property_id, item.id, item.priority === "CRITICAL" ? "CRITICAL" : "HIGH",
          `Maintenance response target breached · ${item.summary}`, `Case ${item.id} at ${item.property_name} remained ${item.state} after ${item.due_at}.`, recipient, now, now),
      database().prepare(`INSERT INTO staff_notifications(id,organization_id,event_id,recipient_email,sender_email,title,message,status,created_at,read_at)
        VALUES(?,?,NULL,?,'AAIQ-MAINTENANCE',?,?,'unread',?,NULL)`).bind(crypto.randomUUID(), item.organization_id, recipient,
          `Maintenance SLA breach · ${item.summary}`, `Open case ${item.id}; current state ${item.state}; target ${item.due_at}.`, now),
      database().prepare(`INSERT INTO maintenance_case_events(id,organization_id,property_id,case_id,event_type,from_state,to_state,actor_type,actor_id,detail_json,created_at)
        VALUES(?,?,?,?,?, ?,?,'SYSTEM','AAIQ-MAINTENANCE-SLA',?,?)`).bind(crypto.randomUUID(), item.organization_id, item.property_id, item.id,
          "MAINTENANCE_SLA_BREACHED", item.state, item.state, JSON.stringify({ dueAt: item.due_at, recipient }), now),
    ]);
    await recordSystemAudit({ organizationId: item.organization_id, propertyId: item.property_id, eventType: "MAINTENANCE_SLA_BREACHED",
      entityType: "MAINTENANCE_CASE", entityId: item.id, authorType: "SYSTEM", authorId: "AAIQ-MAINTENANCE-SLA",
      correlationId: item.id, delta: { dueAt: item.due_at, state: item.state, recipient } });
    escalated += 1;
  }
  return { escalated };
}
