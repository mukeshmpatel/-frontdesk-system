import { env } from "cloudflare:workers";
import { activeStaffContext } from "./staff";
import { authorizedPropertyScope } from "./property-scope";
import { emitReportEvent } from "./reporting-layer";
import { recordSystemAudit, sha256 } from "./platform-controls";
import {
  businessDateInTimezone,
  computeCashReconciliation,
  normalizeBusinessDate,
  normalizeShiftCode,
  parseCashReport,
  type CashSessionRow,
  type CashSourceRow,
} from "../lib/cash-reconciliation-engine";

type Scope = Awaited<ReturnType<typeof authorizedPropertyScope>> extends infer T ? Exclude<T, null> : never;
type Policy = {
  id: string;
  organization_id: string;
  property_id: string;
  timezone: string;
  expected_shift_codes_json: string;
  discrepancy_threshold_cents: number;
  escalation_window_minutes: number;
  scheduled_local_time: string;
  enabled: number;
};

function database(): D1Database {
  if (!env.DB) throw new Error("Cash reconciliation storage is unavailable.");
  return env.DB;
}

async function managerAuthorized(scope: Scope) {
  if (scope.context.role === "admin") return true;
  const profile = await database().prepare(
    `SELECT role_tier FROM user_access_profiles
     WHERE organization_id=? AND lower(user_email)=lower(?) AND access_status='ACTIVE' LIMIT 1`,
  ).bind(scope.context.organizationId, scope.context.email).first<{ role_tier: string }>();
  return ["MANAGER", "CORPORATE"].includes(String(profile?.role_tier ?? "").toUpperCase());
}

async function requireScope(userEmail: string, propertyId?: string | null, manager = false) {
  const scope = await authorizedPropertyScope(userEmail, propertyId);
  if (!scope) throw new Error("An authorized property is required.");
  if (manager && !(await managerAuthorized(scope))) throw new Error("A property manager or corporate administrator is required for this action.");
  return scope;
}

function safeShiftCodes(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      const shifts = Array.from(new Set(parsed.map(normalizeShiftCode))).slice(0, 12);
      if (shifts.length) return shifts;
    }
  } catch {
    // The stored policy is repaired to the safe baseline below.
  }
  return ["AM", "PM", "NIGHT"];
}

async function ensurePolicy(organizationId: string, property: { id: string; timezone?: string | null }, actor: string) {
  const now = new Date().toISOString();
  await database().prepare(
    `INSERT OR IGNORE INTO cash_reconciliation_policies
     (id,organization_id,property_id,timezone,expected_shift_codes_json,discrepancy_threshold_cents,
      escalation_window_minutes,scheduled_local_time,enabled,updated_by,created_at,updated_at)
     VALUES(?,?,?,?,?,1000,30,'03:30',1,?,?,?)`,
  ).bind(crypto.randomUUID(), organizationId, property.id, property.timezone || "America/Chicago", '["AM","PM","NIGHT"]', actor, now, now).run();
  const policy = await database().prepare(
    `SELECT * FROM cash_reconciliation_policies WHERE organization_id=? AND property_id=? LIMIT 1`,
  ).bind(organizationId, property.id).first<Policy>();
  if (!policy) throw new Error("Cash reconciliation policy could not be initialized.");
  if (!safeShiftCodes(policy.expected_shift_codes_json).length) throw new Error("Cash reconciliation shift policy is invalid.");
  return policy;
}

async function hashContent(content: string) {
  return sha256(content.replace(/\r\n/g, "\n").trim());
}

export async function importCashSourceReport(userEmail: string, input: {
  propertyId?: string | null;
  businessDate: string;
  sourceType: "PMS_EXPORT" | "EMAIL_REPORT" | "MANUAL_UPLOAD" | "PMS_LIVE";
  sourceReference: string;
  fileName?: string;
  content: string;
}) {
  const scope = await requireScope(userEmail, input.propertyId, true);
  if (input.sourceType === "PMS_LIVE") throw new Error("Live PMS cash retrieval is not configured. Import an authorized PMS export or scheduled email report instead.");
  if (!["PMS_EXPORT", "EMAIL_REPORT", "MANUAL_UPLOAD"].includes(input.sourceType)) throw new Error("Choose an authorized cash source type.");
  const businessDate = normalizeBusinessDate(input.businessDate);
  const sourceReference = input.sourceReference.trim().slice(0, 300);
  if (!sourceReference) throw new Error("Enter the report name, email subject, or PMS export reference.");
  const rows = parseCashReport(input.content, businessDate);
  const contentSha256 = await hashContent(input.content);
  const existing = await database().prepare(
    `SELECT id,status,row_count,total_cash_cents,business_date FROM cash_source_batches
     WHERE organization_id=? AND property_id=? AND content_sha256=? LIMIT 1`,
  ).bind(scope.context.organizationId, scope.property.id, contentSha256).first<Record<string, unknown>>();
  if (existing) {
    if (existing.status !== "PARSED") throw new Error("This report was imported before, but its stored parse is not usable. Import a corrected report with changed content.");
    await database().batch([
      database().prepare(`UPDATE cash_source_batches SET active=0 WHERE organization_id=? AND property_id=? AND business_date=? AND id!=?`)
        .bind(scope.context.organizationId, scope.property.id, businessDate, existing.id),
      database().prepare(`UPDATE cash_source_batches SET active=1 WHERE id=?`).bind(existing.id),
    ]);
    await recordSystemAudit({
      organizationId: scope.context.organizationId, propertyId: scope.property.id,
      eventType: "CASH_SOURCE_REPORT_REACTIVATED", entityType: "CASH_SOURCE_BATCH", entityId: String(existing.id),
      authorType: "USER", authorId: scope.context.email, correlationId: String(existing.id),
      delta: { businessDate, contentSha256, duplicateContentReused: true },
    });
    return { ...existing, active: 1, duplicate: true, contentSha256 };
  }
  const now = new Date().toISOString();
  const batchId = crypto.randomUUID();
  const totalCashCents = rows.reduce((sum, row) => sum + row.amountCents, 0);
  await database().prepare(
    `INSERT INTO cash_source_batches
     (id,organization_id,property_id,business_date,source_type,source_reference,file_name,content_sha256,
      row_count,total_cash_cents,active,status,parse_error,imported_by,imported_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,0,'REVIEW_REQUIRED',NULL,?,?)`,
  ).bind(batchId, scope.context.organizationId, scope.property.id, businessDate, input.sourceType,
    sourceReference, input.fileName?.trim().slice(0, 180) || null, contentSha256, rows.length,
    totalCashCents, scope.context.email, now).run();
  try {
    for (let offset = 0; offset < rows.length; offset += 100) {
      const chunk = rows.slice(offset, offset + 100);
      await database().batch(chunk.map((row) => database().prepare(
        `INSERT INTO cash_source_transactions
         (id,batch_id,organization_id,property_id,business_date,shift_code,source_row_number,
          source_reference,occurred_at,amount_cents,raw_row_text)
         VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(crypto.randomUUID(), batchId, scope.context.organizationId, scope.property.id, row.businessDate,
        row.shiftCode, row.sourceRowNumber, row.sourceReference, row.occurredAt, row.amountCents, row.rawRowText)));
    }
    await database().batch([
      database().prepare(`UPDATE cash_source_batches SET active=0 WHERE organization_id=? AND property_id=? AND business_date=? AND id!=?`)
        .bind(scope.context.organizationId, scope.property.id, businessDate, batchId),
      database().prepare(`UPDATE cash_source_batches SET status='PARSED',active=1 WHERE id=?`).bind(batchId),
    ]);
  } catch (error) {
    await database().prepare(`UPDATE cash_source_batches SET status='FAILED',parse_error=? WHERE id=?`)
      .bind(error instanceof Error ? error.message.slice(0, 500) : "Source row persistence failed.", batchId).run();
    throw error;
  }
  const audit = await recordSystemAudit({
    organizationId: scope.context.organizationId, propertyId: scope.property.id,
    eventType: "CASH_SOURCE_REPORT_IMPORTED", entityType: "CASH_SOURCE_BATCH", entityId: batchId,
    authorType: "USER", authorId: scope.context.email, correlationId: batchId,
    delta: { businessDate, sourceType: input.sourceType, sourceReference, rowCount: rows.length, totalCashCents, contentSha256 },
    metadata: { rawReportStored: false, rawRowsStored: true, livePmsUsed: false },
  });
  return { id: batchId, status: "PARSED", rowCount: rows.length, totalCashCents, contentSha256, duplicate: false, auditEvidenceUrl: `aaiq://audit/${audit.id}` };
}

async function sourceRows(organizationId: string, propertyId: string, businessDate: string): Promise<CashSourceRow[]> {
  const result = await database().prepare(
    `SELECT t.business_date,t.shift_code,t.amount_cents,t.source_reference,t.occurred_at,
            t.source_row_number,t.raw_row_text
     FROM cash_source_transactions t JOIN cash_source_batches b ON b.id=t.batch_id
     WHERE t.organization_id=? AND t.property_id=? AND t.business_date=? AND b.status='PARSED' AND b.active=1
     ORDER BY t.shift_code,t.source_row_number`,
  ).bind(organizationId, propertyId, businessDate).all<Record<string, unknown>>();
  return result.results.map((row) => ({
    businessDate: String(row.business_date), shiftCode: String(row.shift_code), amountCents: Number(row.amount_cents),
    sourceReference: String(row.source_reference), occurredAt: row.occurred_at ? String(row.occurred_at) : null,
    sourceRowNumber: Number(row.source_row_number), rawRowText: String(row.raw_row_text),
  }));
}

async function sessionRows(organizationId: string, propertyId: string, businessDate: string): Promise<CashSessionRow[]> {
  const result = await database().prepare(
    `SELECT s.id,s.shift_code,s.employee_email,s.status,s.counted_cash_cents,s.submitted_at,s.verified_at,
            v.received_cash_cents
     FROM shift_cash_sessions s
     LEFT JOIN shift_drop_verifications v ON v.id=(SELECT v2.id FROM shift_drop_verifications v2
       WHERE v2.session_id=s.id ORDER BY v2.verified_at DESC LIMIT 1)
     WHERE s.organization_id=? AND s.property_id=? AND s.business_date=?
     ORDER BY s.shift_code,s.created_at`,
  ).bind(organizationId, propertyId, businessDate).all<Record<string, unknown>>();
  return result.results.map((row) => ({
    id: String(row.id), shiftCode: String(row.shift_code || "UNASSIGNED"), employeeEmail: String(row.employee_email),
    status: String(row.status), employeeCountedCents: Number(row.counted_cash_cents || 0),
    managerReceivedCents: row.received_cash_cents === null || row.received_cash_cents === undefined ? null : Number(row.received_cash_cents),
    submittedAt: row.submitted_at ? String(row.submitted_at) : null, verifiedAt: row.verified_at ? String(row.verified_at) : null,
  }));
}

async function sourceBatchSummary(organizationId: string, propertyId: string, businessDate: string) {
  const result = await database().prepare(
    `SELECT id,source_type,source_reference,file_name,content_sha256,row_count,total_cash_cents,active,status,imported_by,imported_at
     FROM cash_source_batches WHERE organization_id=? AND property_id=? AND business_date=?
     ORDER BY imported_at`,
  ).bind(organizationId, propertyId, businessDate).all<Record<string, unknown>>();
  return result.results;
}

async function namedManager(organizationId: string, propertyId: string) {
  return database().prepare(
    `SELECT m.user_email,m.display_name,p.phone
     FROM staff_members m
     LEFT JOIN employee_profiles p ON p.organization_id=m.organization_id AND lower(p.user_email)=lower(m.user_email)
     WHERE m.organization_id=? AND m.status='active'
       AND (m.role='admin' OR upper(coalesce(p.job_title,'')) LIKE '%MANAGER%' OR upper(coalesce(p.job_title,'')) LIKE '%GENERAL MANAGER%')
       AND (m.role='admin' OR EXISTS(SELECT 1 FROM property_assignments a WHERE a.organization_id=m.organization_id
         AND a.property_id=? AND lower(a.user_email)=lower(m.user_email) AND a.status='ACTIVE'))
     ORDER BY CASE WHEN upper(coalesce(p.job_title,'')) LIKE '%GENERAL MANAGER%' THEN 0 WHEN m.role='admin' THEN 1 ELSE 2 END LIMIT 1`,
  ).bind(organizationId, propertyId).first<{ user_email: string; display_name: string; phone: string | null }>();
}

async function reconciliationChecksum(businessDate: string, result: ReturnType<typeof computeCashReconciliation>, batches: Record<string, unknown>[]) {
  return sha256(JSON.stringify({
    businessDate,
    expectedTotalCents: result.expectedTotalCents,
    countedTotalCents: result.countedTotalCents,
    varianceCents: result.varianceCents,
    sourceStatus: result.sourceStatus,
    reconciliationStatus: result.reconciliationStatus,
    shifts: result.shifts,
    sourceBatchIds: batches.filter((batch) => batch.status === "PARSED" && Number(batch.active) === 1).map((batch) => String(batch.id)).sort(),
  }));
}

async function maintainDiscrepancyTask(input: {
  organizationId: string;
  propertyId: string;
  reconciliationId: string;
  businessDate: string;
  taskId?: string | null;
  result: ReturnType<typeof computeCashReconciliation>;
  policy: Policy;
  actor: string;
}) {
  const clean = input.result.reconciliationStatus === "RECONCILED_CLEAN";
  if (clean && input.taskId) {
    await database().prepare(`UPDATE operational_work_orders SET status='COMPLETE',progress=100,completed_at=?,updated_at=? WHERE id=? AND organization_id=?`)
      .bind(new Date().toISOString(), new Date().toISOString(), input.taskId, input.organizationId).run();
    return input.taskId;
  }
  if (clean) return null;
  const now = new Date();
  const dueAt = new Date(now.getTime() + input.policy.escalation_window_minutes * 60_000).toISOString();
  const manager = await namedManager(input.organizationId, input.propertyId);
  const variance = input.result.varianceCents;
  const priority = variance !== null && Math.abs(variance) >= input.policy.discrepancy_threshold_cents ? "CRITICAL" : "HIGH";
  const title = input.result.sourceStatus !== "AVAILABLE"
    ? `Cash source unavailable — ${input.businessDate}`
    : `Cash reconciliation requires review — ${input.businessDate}`;
  const description = JSON.stringify({
    businessDate: input.businessDate, status: input.result.reconciliationStatus,
    expectedTotalCents: input.result.expectedTotalCents, countedTotalCents: input.result.countedTotalCents,
    varianceCents: variance, unresolvedGapCount: input.result.unresolvedGapCount,
    shifts: input.result.shifts.filter((shift) => shift.gaps.length || shift.varianceCents),
    route: `/aaiq-cash-custody?businessDate=${encodeURIComponent(input.businessDate)}`,
  });
  const id = input.taskId || crypto.randomUUID();
  if (input.taskId) {
    await database().prepare(
      `UPDATE operational_work_orders SET title=?,description=?,assigned_to=?,status='ASSIGNED',progress=0,priority=?,due_at=?,updated_at=?,completed_at=NULL
       WHERE id=? AND organization_id=? AND property_id=?`,
    ).bind(title, description, manager?.user_email || null, priority, dueAt, now.toISOString(), id, input.organizationId, input.propertyId).run();
  } else {
    await database().prepare(
      `INSERT INTO operational_work_orders
       (id,organization_id,property_id,department,work_type,title,description,room_number,assigned_to,status,
        progress,priority,parent_order_id,due_at,created_by,created_at,updated_at,completed_at)
       VALUES(?,?,?,'FRONT_DESK','CASH_RECONCILIATION',?,?,NULL,?,'ASSIGNED',0,?,?,? ,?,?,?,NULL)`,
    ).bind(id, input.organizationId, input.propertyId, title, description, manager?.user_email || null,
      priority, input.reconciliationId, dueAt, input.actor, now.toISOString(), now.toISOString()).run();
    await emitReportEvent({
      organizationId: input.organizationId, propertyId: input.propertyId, sourceModule: "AAIQ_CASH_CUSTODY",
      eventType: "CASH_RECONCILIATION_TASK_CREATED", entityType: "work_order", entityId: id,
      correlationId: input.reconciliationId, idempotencyKey: `cash-reconciliation-task:${input.reconciliationId}`,
      payload: { businessDate: input.businessDate, priority, reconciliationStatus: input.result.reconciliationStatus },
      facts: [{ factType: "operational-task", entityType: "work_order", entityId: id, value: 1, unit: "task",
        department: "FRONT_DESK", employeeEmail: manager?.user_email || null, status: "ASSIGNED",
        sourceTable: "operational_work_orders", sourceRecordId: id, dimensions: { priority, workType: "CASH_RECONCILIATION" } }],
    });
  }
  return id;
}

async function performCashReconciliation(input: {
  organizationId: string;
  property: { id: string; timezone?: string | null };
  businessDate: string;
  actor: string;
  triggerType: "MANUAL" | "SCHEDULED";
}) {
  const businessDate = normalizeBusinessDate(input.businessDate);
  const policy = await ensurePolicy(input.organizationId, input.property, input.actor);
  const [sources, sessions, batches, before] = await Promise.all([
    sourceRows(input.organizationId, input.property.id, businessDate),
    sessionRows(input.organizationId, input.property.id, businessDate),
    sourceBatchSummary(input.organizationId, input.property.id, businessDate),
    database().prepare(`SELECT * FROM daily_cash_reconciliation WHERE organization_id=? AND property_id=? AND business_date=? LIMIT 1`)
      .bind(input.organizationId, input.property.id, businessDate).first<Record<string, unknown>>(),
  ]);
  const result = computeCashReconciliation({ expectedShiftCodes: safeShiftCodes(policy.expected_shift_codes_json), sourceRows: sources, sessions });
  const checksum = await reconciliationChecksum(businessDate, result, batches);
  const id = String(before?.id || crypto.randomUUID());
  const now = new Date().toISOString();
  const taskId = await maintainDiscrepancyTask({
    organizationId: input.organizationId, propertyId: input.property.id, reconciliationId: id,
    businessDate, taskId: before?.task_id ? String(before.task_id) : null, result, policy, actor: input.actor,
  });
  await database().prepare(
    `INSERT INTO daily_cash_reconciliation
     (id,organization_id,property_id,business_date,expected_total_cents,counted_total_cents,variance_cents,
      shift_breakdown_json,data_sources_used_json,source_status,reconciliation_status,unresolved_gap_count,
      computed_checksum,independent_verification_status,task_id,escalation_id,trigger_type,triggered_by,
      computed_at,verified_at,updated_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'PENDING',?,?,?, ?,?,NULL,?)
     ON CONFLICT(organization_id,property_id,business_date) DO UPDATE SET
       expected_total_cents=excluded.expected_total_cents,counted_total_cents=excluded.counted_total_cents,
       variance_cents=excluded.variance_cents,shift_breakdown_json=excluded.shift_breakdown_json,
       data_sources_used_json=excluded.data_sources_used_json,source_status=excluded.source_status,
       reconciliation_status=excluded.reconciliation_status,unresolved_gap_count=excluded.unresolved_gap_count,
       computed_checksum=excluded.computed_checksum,independent_verification_status='PENDING',
       task_id=excluded.task_id,trigger_type=excluded.trigger_type,triggered_by=excluded.triggered_by,
       computed_at=excluded.computed_at,verified_at=NULL,updated_at=excluded.updated_at`,
  ).bind(id, input.organizationId, input.property.id, businessDate, result.expectedTotalCents, result.countedTotalCents,
    result.varianceCents, JSON.stringify(result.shifts), JSON.stringify(batches), result.sourceStatus,
    result.reconciliationStatus, result.unresolvedGapCount, checksum, taskId, before?.escalation_id || null,
    input.triggerType, input.actor, now, now).run();
  const audit = await recordSystemAudit({
    organizationId: input.organizationId, propertyId: input.property.id,
    eventType: "DAILY_CASH_RECONCILIATION_COMPUTED", entityType: "DAILY_CASH_RECONCILIATION", entityId: id,
    authorType: input.triggerType === "SCHEDULED" ? "SYSTEM" : "USER", authorId: input.actor, correlationId: id,
    before: before ? { status: before.reconciliation_status as string, checksum: before.computed_checksum as string } : null,
    after: { businessDate, ...result, checksum, taskId },
    delta: { triggerType: input.triggerType, sourceRowCount: sources.length, sessionCount: sessions.length, unresolvedGapCount: result.unresolvedGapCount },
  });
  return { id, businessDate, ...result, checksum, taskId, policy, auditEvidenceUrl: `aaiq://audit/${audit.id}` };
}

export async function runCashReconciliation(userEmail: string, input: { propertyId?: string | null; businessDate: string; triggerType?: "MANUAL" }) {
  const scope = await requireScope(userEmail, input.propertyId, true);
  const result = await performCashReconciliation({
    organizationId: scope.context.organizationId, property: scope.property, businessDate: input.businessDate,
    actor: scope.context.email, triggerType: "MANUAL",
  });
  const verification = await verifyStoredCashReconciliation({
    organizationId: scope.context.organizationId,
    property: scope.property,
    businessDate: input.businessDate,
    actor: scope.context.email,
  });
  return { ...result, independentVerification: verification };
}

async function independentSnapshot(organizationId: string, property: { id: string; timezone?: string | null }, businessDate: string, actor: string) {
  const policy = await ensurePolicy(organizationId, property, actor);
  // This path intentionally executes fresh source/session/batch queries and never reads stored totals.
  const [sources, sessions, batches] = await Promise.all([
    sourceRows(organizationId, property.id, businessDate),
    sessionRows(organizationId, property.id, businessDate),
    sourceBatchSummary(organizationId, property.id, businessDate),
  ]);
  const result = computeCashReconciliation({ expectedShiftCodes: safeShiftCodes(policy.expected_shift_codes_json), sourceRows: sources, sessions });
  return { result, sources, sessions, batches, checksum: await reconciliationChecksum(businessDate, result, batches) };
}

async function verifyStoredCashReconciliation(input: {
  organizationId: string;
  property: { id: string; timezone?: string | null };
  businessDate: string;
  actor: string;
}) {
  const businessDate = normalizeBusinessDate(input.businessDate);
  const stored = await database().prepare(
    `SELECT * FROM daily_cash_reconciliation WHERE organization_id=? AND property_id=? AND business_date=? LIMIT 1`,
  ).bind(input.organizationId, input.property.id, businessDate).first<Record<string, unknown>>();
  if (!stored) throw new Error("Run the daily cash reconciliation before independent verification.");
  const independent = await independentSnapshot(input.organizationId, input.property, businessDate, input.actor);
  const passed = independent.checksum === stored.computed_checksum;
  const now = new Date().toISOString();
  const audit = await recordSystemAudit({
    organizationId: input.organizationId, propertyId: input.property.id,
    eventType: passed ? "CASH_RECONCILIATION_INDEPENDENT_CHECK_PASSED" : "CASH_RECONCILIATION_INDEPENDENT_CHECK_FAILED",
    entityType: "DAILY_CASH_RECONCILIATION", entityId: String(stored.id), authorType: "SYSTEM",
    authorId: "AAIQ-CASH-INDEPENDENT-VERIFIER", correlationId: String(stored.id),
    before: { storedChecksum: stored.computed_checksum as string }, after: { independentChecksum: independent.checksum },
    delta: { passed, sourceRowsRequeried: independent.sources.length, sessionsRequeried: independent.sessions.length },
  });
  await database().batch([
    database().prepare(
      `UPDATE daily_cash_reconciliation SET independent_verification_status=?,verified_at=?,updated_at=? WHERE id=?`,
    ).bind(passed ? "PASS" : "FAIL", now, now, stored.id),
    database().prepare(
      `INSERT INTO workflow_verification_runs
       (id,organization_id,property_id,workflow_key,trigger_description,source_data_snapshot_json,
        decision_output,action_taken,before_state_json,after_state_json,verification_method,verification_result,
       failure_case_tested,failure_behavior_observed,audit_evidence_url,run_at,reviewed_by,reviewed_at)
       VALUES(?,?,?,'cash-reconciliation.daily',?,?,?,?,?,?,?,?,0,NULL,?,?,NULL,NULL)`,
    ).bind(crypto.randomUUID(), input.organizationId, input.property.id,
      `Independent re-query for ${businessDate}`,
      JSON.stringify({ businessDate, sourceBatchIds: independent.batches.map((batch) => batch.id), sessionIds: independent.sessions.map((session) => session.id) }),
      passed ? "Stored result matches independent computation." : "Stored result differs from independent computation.",
      "No external financial action. Compared a separate source/session query to the stored checksum.",
      JSON.stringify({ storedChecksum: stored.computed_checksum, storedStatus: stored.reconciliation_status }),
      JSON.stringify({ independentChecksum: independent.checksum, result: independent.result }),
      "Separate D1 re-query + deterministic checksum comparison", passed ? "pass" : "fail",
      `aaiq://audit/${audit.id}`, now),
  ]);
  return { passed, status: passed ? "PASS" : "FAIL", storedChecksum: stored.computed_checksum, independentChecksum: independent.checksum, auditEvidenceUrl: `aaiq://audit/${audit.id}` };
}

export async function independentlyVerifyCashReconciliation(userEmail: string, input: { propertyId?: string | null; businessDate: string }) {
  const scope = await requireScope(userEmail, input.propertyId, true);
  return verifyStoredCashReconciliation({
    organizationId: scope.context.organizationId,
    property: scope.property,
    businessDate: input.businessDate,
    actor: scope.context.email,
  });
}

export async function cashReconciliationDetail(userEmail: string, input: { propertyId?: string | null; businessDate?: string | null }) {
  const scope = await requireScope(userEmail, input.propertyId, false);
  const policy = await ensurePolicy(scope.context.organizationId, scope.property, "AAIQ-CASH-POLICY");
  const businessDate = normalizeBusinessDate(input.businessDate || businessDateInTimezone(policy.timezone));
  const reconciliation = await database().prepare(
    `SELECT * FROM daily_cash_reconciliation WHERE organization_id=? AND property_id=? AND business_date=? LIMIT 1`,
  ).bind(scope.context.organizationId, scope.property.id, businessDate).first<Record<string, unknown>>();
  return {
    property: scope.property, businessDate, canManage: await managerAuthorized(scope),
    policy: { ...policy, expectedShiftCodes: safeShiftCodes(policy.expected_shift_codes_json) },
    reconciliation: reconciliation ? {
      ...reconciliation,
      shifts: JSON.parse(String(reconciliation.shift_breakdown_json || "[]")),
      dataSources: JSON.parse(String(reconciliation.data_sources_used_json || "[]")),
    } : null,
  };
}

export async function cashReconciliationSources(userEmail: string, input: { propertyId?: string | null; businessDate: string }) {
  const scope = await requireScope(userEmail, input.propertyId, false);
  const businessDate = normalizeBusinessDate(input.businessDate);
  const [batches, transactions, sessions, receipts, verifications] = await Promise.all([
    sourceBatchSummary(scope.context.organizationId, scope.property.id, businessDate),
    database().prepare(
      `SELECT t.id,t.batch_id,t.shift_code,t.source_row_number,t.source_reference,t.occurred_at,t.amount_cents,t.raw_row_text
       FROM cash_source_transactions t JOIN cash_source_batches b ON b.id=t.batch_id
       WHERE t.organization_id=? AND t.property_id=? AND t.business_date=? AND b.status='PARSED' AND b.active=1
       ORDER BY t.shift_code,t.source_row_number`,
    ).bind(scope.context.organizationId, scope.property.id, businessDate).all<Record<string, unknown>>().then((result) => result.results),
    database().prepare(
      `SELECT id,employee_email,shift_code,status,expected_cash_cents,counted_cash_cents,variance_cents,submitted_at,verified_by,verified_at,created_at
       FROM shift_cash_sessions WHERE organization_id=? AND property_id=? AND business_date=? ORDER BY shift_code,created_at`,
    ).bind(scope.context.organizationId, scope.property.id, businessDate).all<Record<string, unknown>>().then((result) => result.results),
    database().prepare(
      `SELECT r.* FROM shift_drop_custody_receipts r JOIN shift_cash_sessions s ON s.id=r.session_id
       WHERE s.organization_id=? AND s.property_id=? AND s.business_date=? ORDER BY r.acknowledged_at`,
    ).bind(scope.context.organizationId, scope.property.id, businessDate).all<Record<string, unknown>>().then((result) => result.results),
    database().prepare(
      `SELECT v.* FROM shift_drop_verifications v JOIN shift_cash_sessions s ON s.id=v.session_id
       WHERE s.organization_id=? AND s.property_id=? AND s.business_date=? ORDER BY v.verified_at`,
    ).bind(scope.context.organizationId, scope.property.id, businessDate).all<Record<string, unknown>>().then((result) => result.results),
  ]);
  return { property: scope.property, businessDate, batches, transactions, sessions, receipts, verifications };
}

export async function updateCashReconciliationPolicy(userEmail: string, input: {
  propertyId?: string | null;
  expectedShiftCodes: string[];
  discrepancyThresholdCents: number;
  escalationWindowMinutes: number;
  scheduledLocalTime: string;
}) {
  const scope = await requireScope(userEmail, input.propertyId, true);
  const shifts = Array.from(new Set(input.expectedShiftCodes.map(normalizeShiftCode))).slice(0, 12);
  if (!shifts.length) throw new Error("Configure at least one expected physical cash shift.");
  const threshold = Number(input.discrepancyThresholdCents);
  const window = Number(input.escalationWindowMinutes);
  if (!Number.isInteger(threshold) || threshold < 0 || threshold > 100_000_000) throw new Error("Enter a valid discrepancy threshold in cents.");
  if (!Number.isInteger(window) || window < 0 || window > 10_080) throw new Error("Escalation window must be between 0 and 10,080 minutes.");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.scheduledLocalTime)) throw new Error("Scheduled time must use 24-hour HH:MM.");
  const policy = await ensurePolicy(scope.context.organizationId, scope.property, scope.context.email);
  const now = new Date().toISOString();
  await database().prepare(
    `UPDATE cash_reconciliation_policies SET expected_shift_codes_json=?,discrepancy_threshold_cents=?,
     escalation_window_minutes=?,scheduled_local_time=?,updated_by=?,updated_at=? WHERE id=?`,
  ).bind(JSON.stringify(shifts), threshold, window, input.scheduledLocalTime, scope.context.email, now, policy.id).run();
  await recordSystemAudit({ organizationId: scope.context.organizationId, propertyId: scope.property.id,
    eventType: "CASH_RECONCILIATION_POLICY_UPDATED", entityType: "CASH_RECONCILIATION_POLICY", entityId: policy.id,
    authorType: "USER", authorId: scope.context.email, correlationId: policy.id,
    delta: { expectedShiftCodes: shifts, discrepancyThresholdCents: threshold, escalationWindowMinutes: window, scheduledLocalTime: input.scheduledLocalTime } });
  return { id: policy.id, expectedShiftCodes: shifts, discrepancyThresholdCents: threshold, escalationWindowMinutes: window, scheduledLocalTime: input.scheduledLocalTime };
}

export async function runCashReconciliationEscalations(filter?: { organizationId: string; propertyId: string }) {
  const now = new Date().toISOString();
  const rows = await database().prepare(
    `SELECT r.*,p.discrepancy_threshold_cents,p.escalation_window_minutes,w.due_at
     FROM daily_cash_reconciliation r JOIN cash_reconciliation_policies p
       ON p.organization_id=r.organization_id AND p.property_id=r.property_id
     LEFT JOIN operational_work_orders w ON w.id=r.task_id
     LEFT JOIN notification_escalations e ON e.organization_id=r.organization_id
       AND e.source_type='CASH_RECONCILIATION' AND e.source_id=r.id
     WHERE r.reconciliation_status!='RECONCILED_CLEAN' AND r.variance_cents IS NOT NULL
       AND abs(r.variance_cents)>=p.discrepancy_threshold_cents AND w.due_at<=? AND e.id IS NULL
       AND (? IS NULL OR r.organization_id=?) AND (? IS NULL OR r.property_id=?)
     ORDER BY w.due_at LIMIT 100`,
  ).bind(now, filter?.organizationId ?? null, filter?.organizationId ?? null,
    filter?.propertyId ?? null, filter?.propertyId ?? null).all<Record<string, unknown>>();
  let escalated = 0;
  for (const row of rows.results) {
    const manager = await namedManager(String(row.organization_id), String(row.property_id));
    if (!manager) continue;
    const escalationId = crypto.randomUUID();
    const outboxId = crypto.randomUUID();
    const recipient = manager.phone?.trim() || manager.user_email;
    const route = manager.phone?.trim() ? "SMS" : "IN_APP";
    const varianceCents = Number(row.variance_cents);
    const varianceLabel = `${varianceCents < 0 ? "shortage" : "overage"} $${(Math.abs(varianceCents) / 100).toFixed(2)}`;
    await database().batch([
      database().prepare(
        `INSERT INTO notification_escalations
         (id,organization_id,source_type,source_id,status,urgency_score,acknowledged_at,escalated_at,manager_recipient,created_at,updated_at)
         VALUES(?,?,'CASH_RECONCILIATION',?,'ESCALATED',100,NULL,?,?,?,?,?)`,
      ).bind(escalationId, row.organization_id, row.id, now, recipient, now, now),
      database().prepare(
        `INSERT INTO notification_outbox
         (id,organization_id,escalation_id,route,priority,recipient,subject,body,status,attempts,provider_message_id,last_error,available_at,created_at,updated_at)
         VALUES(?,?,?,?,'CRITICAL',?,?,?,'PENDING',0,NULL,NULL,?,?,?)`,
      ).bind(outboxId, row.organization_id, escalationId, route, recipient,
        `Cash reconciliation escalation — ${row.business_date}`,
        `Property cash reconciliation has an unresolved ${varianceLabel}. Open AAIQ Cash & Check Custody and review the source and shift evidence.`, now, now, now),
      database().prepare(
        `INSERT INTO staff_notifications
         (id,organization_id,event_id,recipient_email,sender_email,title,message,status,created_at,read_at)
         VALUES(?,?,NULL,?,'AAIQ-AUTOMATION',?,?,'unread',?,NULL)`,
      ).bind(crypto.randomUUID(), row.organization_id, manager.user_email,
        "Cash reconciliation requires immediate review", `${row.business_date}: unresolved ${varianceLabel}.`, now),
      database().prepare(`UPDATE daily_cash_reconciliation SET escalation_id=?,updated_at=? WHERE id=?`)
        .bind(escalationId, now, row.id),
    ]);
    await recordSystemAudit({ organizationId: String(row.organization_id), propertyId: String(row.property_id),
      eventType: "CASH_RECONCILIATION_ESCALATED", entityType: "DAILY_CASH_RECONCILIATION", entityId: String(row.id),
      authorType: "SYSTEM", authorId: "AAIQ-CASH-ESCALATION", correlationId: escalationId,
      delta: { businessDate: row.business_date as string, varianceCents, thresholdCents: Number(row.discrepancy_threshold_cents), manager: manager.user_email, route },
      metadata: { taskId: row.task_id as string, outboxId } });
    escalated += 1;
  }
  return { examined: rows.results.length, escalated, completedAt: now };
}

export async function runCashReconciliationEscalationsForUser(userEmail: string, propertyId?: string | null) {
  const scope = await requireScope(userEmail, propertyId, true);
  return runCashReconciliationEscalations({
    organizationId: scope.context.organizationId,
    propertyId: scope.property.id,
  });
}

function previousDate(date: string) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

export async function runScheduledCashReconciliations(now = new Date()) {
  const policies = await database().prepare(
    `SELECT p.*,c.timezone AS property_timezone FROM cash_reconciliation_policies p
     JOIN property_contexts c ON c.id=p.property_id AND c.organization_id=p.organization_id
     WHERE p.enabled=1`,
  ).all<Policy & { property_timezone: string }>();
  let run = 0;
  for (const policy of policies.results) {
    const timezone = policy.timezone || policy.property_timezone || "America/Chicago";
    const time = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
    const scheduledMinutes = Number(policy.scheduled_local_time.slice(0, 2)) * 60 + Number(policy.scheduled_local_time.slice(3, 5));
    const currentMinutes = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
    if (currentMinutes < scheduledMinutes || currentMinutes >= scheduledMinutes + 15) continue;
    const businessDate = previousDate(businessDateInTimezone(timezone, now));
    const prior = await database().prepare(
      `SELECT id,trigger_type,computed_at FROM daily_cash_reconciliation WHERE organization_id=? AND property_id=? AND business_date=? LIMIT 1`,
    ).bind(policy.organization_id, policy.property_id, businessDate).first<Record<string, unknown>>();
    if (prior?.trigger_type === "SCHEDULED") continue;
    await performCashReconciliation({ organizationId: policy.organization_id,
      property: { id: policy.property_id, timezone }, businessDate, actor: "AAIQ-CASH-SCHEDULER", triggerType: "SCHEDULED" });
    await verifyStoredCashReconciliation({ organizationId: policy.organization_id,
      property: { id: policy.property_id, timezone }, businessDate, actor: "AAIQ-CASH-SCHEDULER" });
    run += 1;
  }
  return { eligiblePolicies: policies.results.length, run, completedAt: now.toISOString() };
}
