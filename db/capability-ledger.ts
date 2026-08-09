import { env } from "cloudflare:workers";
import { activeStaffContext } from "./staff";
import { recordSystemAudit } from "./platform-controls";
import { CAPABILITY_LEDGER_BASELINE, CAPABILITY_LEDGER_BASELINE_VERSION, type BaselineCapabilityStatus } from "../lib/capability-ledger-baseline";

function db(): D1Database {
  if (!env.DB) throw new Error("AAIQ capability verification storage is unavailable.");
  return env.DB;
}

const STATUSES: BaselineCapabilityStatus[] = ["working_verified", "working_incomplete", "simulated", "ui_shell", "broken", "blocked_credentials"];

async function seedBaseline(organizationId: string) {
  const current = await db().prepare(`SELECT COUNT(*) count,MIN(baseline_version) min_version,MAX(baseline_version) max_version FROM capability_ledger WHERE organization_id=?`).bind(organizationId).first<any>();
  if (Number(current?.count || 0) === CAPABILITY_LEDGER_BASELINE.length && current?.min_version === CAPABILITY_LEDGER_BASELINE_VERSION && current?.max_version === CAPABILITY_LEDGER_BASELINE_VERSION) return;
  const now = new Date().toISOString();
  const statements = CAPABILITY_LEDGER_BASELINE.map(item => db().prepare(`
    INSERT INTO capability_ledger
      (id,organization_id,item_key,item_name,item_type,owning_module,status,last_verified_at,
       evidence_artifact_path,known_gap_description,reviewed_by,source_path,baseline_version,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,NULL,NULL,?,NULL,?,?,?,?)
    ON CONFLICT(organization_id,item_key) DO UPDATE SET
      item_name=excluded.item_name,
      item_type=excluded.item_type,
      owning_module=excluded.owning_module,
      status=CASE
        WHEN capability_ledger.status='working_verified' AND capability_ledger.reviewed_by IS NOT NULL
          THEN capability_ledger.status
        ELSE excluded.status
      END,
      known_gap_description=CASE
        WHEN capability_ledger.status='working_verified' AND capability_ledger.reviewed_by IS NOT NULL
          THEN capability_ledger.known_gap_description
        ELSE excluded.known_gap_description
      END,
      source_path=excluded.source_path,
      baseline_version=excluded.baseline_version,
      updated_at=excluded.updated_at
  `).bind(
    crypto.randomUUID(), organizationId, item.itemKey, item.itemName, item.itemType,
    item.owningModule, item.status, item.knownGapDescription, item.sourcePath, CAPABILITY_LEDGER_BASELINE_VERSION, now, now,
  ));
  for (let index = 0; index < statements.length; index += 75) await db().batch(statements.slice(index, index + 75));
}

export async function capabilityLedger(userEmail: string, filters: { itemType?: string; owningModule?: string; status?: string } = {}) {
  const context = await activeStaffContext(userEmail);
  if (!context) return null;
  await seedBaseline(context.organizationId);
  const clauses = ["organization_id=?"], values: unknown[] = [context.organizationId];
  if (filters.itemType) { clauses.push("item_type=?"); values.push(filters.itemType); }
  if (filters.owningModule) { clauses.push("owning_module=?"); values.push(filters.owningModule); }
  if (filters.status) { clauses.push("status=?"); values.push(filters.status); }
  const [rows, statusSummary, typeSummary, verificationRuns] = await Promise.all([
    db().prepare(`SELECT * FROM capability_ledger WHERE ${clauses.join(" AND ")} ORDER BY item_type,owning_module,item_name`).bind(...values).all(),
    db().prepare(`SELECT status,COUNT(*) count FROM capability_ledger WHERE organization_id=? GROUP BY status ORDER BY status`).bind(context.organizationId).all(),
    db().prepare(`SELECT item_type,COUNT(*) count FROM capability_ledger WHERE organization_id=? GROUP BY item_type ORDER BY item_type`).bind(context.organizationId).all(),
    db().prepare(`SELECT * FROM workflow_verification_runs WHERE organization_id=? ORDER BY run_at DESC LIMIT 50`).bind(context.organizationId).all(),
  ]);
  const moduleStatuses = Object.fromEntries((rows.results as any[])
    .filter(row => row.item_type === "module")
    .map(row => [row.owning_module, { status: row.status, reviewedBy: row.reviewed_by, gap: row.known_gap_description }]));
  return {
    role: context.role,
    generatedBaselineDate: "2026-08-03",
    rows: rows.results,
    summaries: { byStatus: statusSummary.results, byType: typeSummary.results },
    moduleStatuses,
    verificationRuns: verificationRuns.results,
    rules: {
      structuralChecksAreNotFunctionalProof: true,
      codexSelfCertificationForbidden: true,
      verifiedRequiresHumanReviewAndFailureCase: true,
    },
  };
}

export async function reviewCapabilityItem(userEmail: string, input: Record<string, unknown>) {
  const context = await activeStaffContext(userEmail);
  if (!context || context.role !== "admin") return null;
  await seedBaseline(context.organizationId);
  const itemKey = String(input.itemKey || "").trim();
  const status = String(input.status || "").trim() as BaselineCapabilityStatus;
  const knownGap = String(input.knownGapDescription || "").trim().slice(0, 5000);
  if (!itemKey || !STATUSES.includes(status)) throw new Error("Choose a valid capability item and status.");
  const current = await db().prepare(`SELECT * FROM capability_ledger WHERE organization_id=? AND item_key=?`).bind(context.organizationId, itemKey).first<any>();
  if (!current) throw new Error("Capability ledger item was not found.");
  const now = new Date().toISOString();
  let evidencePath: string | null = null, verifiedAt: string | null = null, reviewedBy: string | null = null;
  if (status === "working_verified") {
    const workflowRunId = String(input.workflowRunId || "").trim();
    if (!workflowRunId) throw new Error("A stored workflow verification run is required before human verification.");
    const run = await db().prepare(`SELECT * FROM workflow_verification_runs WHERE id=? AND organization_id=?`).bind(workflowRunId, context.organizationId).first<any>();
    if (!run || run.verification_result !== "pass" || Number(run.failure_case_tested) !== 1 || !run.audit_evidence_url) {
      throw new Error("The selected run must pass, include a tested failure case, and provide an openable evidence URL.");
    }
    reviewedBy = context.email;
    verifiedAt = now;
    evidencePath = run.audit_evidence_url;
    await db().prepare(`UPDATE workflow_verification_runs SET reviewed_by=?,reviewed_at=? WHERE id=? AND organization_id=?`).bind(context.email, now, workflowRunId, context.organizationId).run();
  }
  await db().prepare(`UPDATE capability_ledger SET status=?,last_verified_at=?,evidence_artifact_path=?,known_gap_description=?,reviewed_by=?,updated_at=? WHERE organization_id=? AND item_key=?`)
    .bind(status, verifiedAt, evidencePath, knownGap || current.known_gap_description, reviewedBy, now, context.organizationId, itemKey).run();
  await recordSystemAudit({
    organizationId: context.organizationId,
    eventType: "CAPABILITY_LEDGER_HUMAN_REVIEWED",
    entityType: "CAPABILITY_LEDGER_ITEM",
    entityId: current.id,
    authorType: "USER",
    authorId: context.email,
    correlationId: crypto.randomUUID(),
    before: { status: current.status, reviewedBy: current.reviewed_by },
    after: { status, reviewedBy, evidencePath },
    delta: { itemKey, knownGapDescription: knownGap || current.known_gap_description },
  });
  return { itemKey, status, reviewedBy, verifiedAt, evidencePath };
}
