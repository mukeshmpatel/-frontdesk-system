import { env } from "cloudflare:workers";
import { activeStaffContext } from "./staff";
import { enterpriseOperations } from "./enterprise-operations";
import { ROLE_PARITY_PROFILES, roleParityCenter } from "./role-parity";
import { recordSystemAudit } from "./platform-controls";
import { buildRoleParityCases, evaluateRoleParityCase } from "../lib/role-parity-policy.mjs";
import { classifyShadowAction, releaseReviewAllowed, resolveEvalGate, severityForPolicyCase } from "../lib/quality-eval-engine.mjs";

const CATALOG_VERSION = "role-parity-policy-v2";
const MODEL_VERSION = "deterministic-policy-engine-v2";
const PROMPT_VERSION = "not-applicable";

function database(): D1Database {
  if (!env.DB) throw new Error("AAIQ evaluation storage is unavailable.");
  return env.DB;
}

function parseJson(value: unknown, fallback: any = null) {
  if (typeof value !== "string") return value ?? fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

async function scope(userEmail: string, requireAdmin = false) {
  const context = await activeStaffContext(userEmail);
  if (!context || (requireAdmin && context.role !== "admin")) return null;
  const operations = await enterpriseOperations(userEmail);
  if (!operations?.activeProperty) return null;
  return { context, property: operations.activeProperty };
}

export async function qualityEvaluationCenter(userEmail: string, selectedBatchId?: string | null) {
  const scoped = await scope(userEmail);
  if (!scoped) return null;
  const { context, property } = scoped;
  const [cases, batches, shadows, monitorRuns, workflowRuns] = await Promise.all([
    database().prepare(`SELECT role_code,COUNT(*) case_count,COUNT(DISTINCT task_code) covered_tasks,
      SUM(CASE WHEN severity='CRITICAL' THEN 1 ELSE 0 END) critical_cases
      FROM eval_cases WHERE organization_id=? AND property_id=? AND active=1 GROUP BY role_code ORDER BY role_code`)
      .bind(context.organizationId, property.id).all<any>(),
    database().prepare(`SELECT * FROM eval_batches WHERE organization_id=? AND property_id=? ORDER BY started_at DESC LIMIT 75`)
      .bind(context.organizationId, property.id).all<any>(),
    database().prepare(`SELECT s.*,c.severity,c.source_outcome,c.missing_verification,c.missing_audit_evidence,c.low_confidence,
      c.classification_json,d.duty_name,q.outcome,q.confidence_score,q.queued_at,q.completed_at
      FROM shadow_audits s
      JOIN quality_shadow_classifications c ON c.shadow_audit_id=s.id
      LEFT JOIN digital_employee_work_queue q ON q.id=s.live_action_ref
      LEFT JOIN digital_employee_duties d ON d.id=q.duty_id
      WHERE s.organization_id=? AND s.property_id=? ORDER BY CASE s.review_status WHEN 'PENDING' THEN 0 ELSE 1 END,c.sampled_at DESC LIMIT 100`)
      .bind(context.organizationId, property.id).all<any>(),
    database().prepare(`SELECT * FROM quality_monitor_runs WHERE organization_id=? AND property_id=? ORDER BY completed_at DESC LIMIT 20`)
      .bind(context.organizationId, property.id).all<any>(),
    database().prepare(`SELECT * FROM workflow_verification_runs WHERE organization_id=? AND property_id=? ORDER BY run_at DESC LIMIT 50`)
      .bind(context.organizationId, property.id).all<any>(),
  ]);
  const batchRows = batches.results as any[];
  const selectedBatch = selectedBatchId
    ? batchRows.find(row => row.id === selectedBatchId) || await database().prepare(`SELECT * FROM eval_batches WHERE id=? AND organization_id=? AND property_id=?`).bind(selectedBatchId, context.organizationId, property.id).first<any>()
    : batchRows[0] || null;
  const batchCases = selectedBatch ? (await database().prepare(`SELECT r.*,c.role_code,c.task_code,c.eval_type,c.severity,c.input_fixture_json,c.expected_outcome_json
      FROM eval_runs r JOIN eval_cases c ON c.id=r.eval_case_id
      WHERE r.organization_id=? AND r.property_id=? AND r.run_batch_id=?
      ORDER BY r.passed ASC,CASE c.severity WHEN 'CRITICAL' THEN 0 WHEN 'MAJOR' THEN 1 ELSE 2 END,c.task_code,c.id`)
    .bind(context.organizationId, property.id, selectedBatch.id).all<any>()).results : [];
  const coverageByRole = new Map((cases.results as any[]).map(row => [row.role_code, row]));
  const latestByRole = new Map<string, any>();
  for (const batch of batchRows) if (!latestByRole.has(batch.role_code)) latestByRole.set(batch.role_code, batch);
  const roleCoverage = ROLE_PARITY_PROFILES.map(profile => {
    const coverage = coverageByRole.get(profile.key) || {};
    return { roleCode: profile.key, roleName: profile.name, taskCount: profile.tasks.length, caseCount: Number(coverage.case_count || 0),
      coveredTasks: Number(coverage.covered_tasks || 0), criticalCases: Number(coverage.critical_cases || 0), latestBatch: latestByRole.get(profile.key) || null };
  });
  return {
    property, role: context.role, catalogVersion: CATALOG_VERSION, roleCoverage, batches: batchRows,
    selectedBatch, batchCases, shadows: shadows.results, monitorRuns: monitorRuns.results,
    workflowRuns: workflowRuns.results,
    judge: { status: "NOT_CONFIGURED", deterministicAvailable: true, judgedCasesRun: false,
      explanation: "Policy and authorization cases run deterministically. Judged or hybrid cases remain blocked until an independent judge model and pinned rubric contract are approved." },
    rules: { structuralChecksAreNotTaskProof: true, criticalFailureBlocksApproval: true,
      passedBatchRequiresNamedReview: true, shadowSamplerNeverChangesOperationalWork: true },
  };
}

export async function prepareGoldenLibrary(userEmail: string, input: Record<string, unknown>) {
  const scoped = await scope(userEmail, true);
  if (!scoped) return null;
  const { context, property } = scoped;
  const parity = await roleParityCenter(userEmail, property.id);
  if (!parity) throw new Error("The canonical role catalog is unavailable for this property.");
  const requestedRole = String(input.roleCode || "ALL").trim().toUpperCase();
  const tasks = (parity.tasks as any[]).filter(task => requestedRole === "ALL" || task.role_key === requestedRole);
  if (!tasks.length) throw new Error("Choose a role that exists in the canonical Role Parity catalog.");
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  for (const task of tasks) {
    for (const scenario of buildRoleParityCases(task.role_key, task.task_key)) {
      const id = `policy:${task.id}:${scenario.caseNumber}`;
      statements.push(database().prepare(`INSERT INTO eval_cases
        (id,organization_id,property_id,role_code,task_code,eval_type,input_fixture_json,expected_outcome_json,judge_rubric,severity,active,created_at,updated_at)
        VALUES(?,?,?,?,?,'DETERMINISTIC',?,?,NULL,?,1,?,?)
        ON CONFLICT(id) DO UPDATE SET input_fixture_json=excluded.input_fixture_json,expected_outcome_json=excluded.expected_outcome_json,
          severity=excluded.severity,active=1,updated_at=excluded.updated_at`)
        .bind(id, context.organizationId, property.id, task.role_key, task.task_key,
          JSON.stringify({ name: scenario.name, scenario: scenario.input, sourceCatalogVersion: CATALOG_VERSION, sourceTaskId: task.id }),
          JSON.stringify({ decision: scenario.expected }), severityForPolicyCase(scenario.name), now, now));
    }
  }
  for (let index = 0; index < statements.length; index += 75) await database().batch(statements.slice(index, index + 75));
  const audit = await recordSystemAudit({ organizationId: context.organizationId, propertyId: property.id,
    eventType: "QUALITY_GOLDEN_LIBRARY_PREPARED", entityType: "EVAL_CASE_LIBRARY", entityId: `${property.id}:${requestedRole}`,
    authorType: "USER", authorId: context.email, correlationId: crypto.randomUUID(),
    delta: { roleCode: requestedRole, tasks: tasks.length, cases: statements.length, catalogVersion: CATALOG_VERSION } });
  return { roleCode: requestedRole, tasks: tasks.length, cases: statements.length, catalogVersion: CATALOG_VERSION, auditId: audit.id };
}

export async function runEvalSuite(userEmail: string, input: Record<string, unknown>) {
  const scoped = await scope(userEmail, true);
  if (!scoped) return null;
  const { context, property } = scoped;
  const roleCode = String(input.roleCode || "").trim().toUpperCase();
  if (!roleCode || roleCode === "ALL") throw new Error("Run one role suite at a time so failures remain owned and explainable.");
  await prepareGoldenLibrary(userEmail, { roleCode });
  const cases = (await database().prepare(`SELECT * FROM eval_cases WHERE organization_id=? AND property_id=? AND role_code=? AND active=1 ORDER BY task_code,id`)
    .bind(context.organizationId, property.id, roleCode).all<any>()).results;
  if (!cases.length) throw new Error("No active golden cases exist for this role.");
  const baseline = await database().prepare(`SELECT * FROM eval_batches WHERE organization_id=? AND property_id=? AND role_code=? AND status='PASSED' AND review_decision='APPROVED' ORDER BY completed_at DESC LIMIT 1`)
    .bind(context.organizationId, property.id, roleCode).first<any>();
  const baselinePassed = new Set<string>();
  if (baseline) {
    const passed = await database().prepare(`SELECT eval_case_id FROM eval_runs WHERE organization_id=? AND property_id=? AND run_batch_id=? AND passed=1`)
      .bind(context.organizationId, property.id, baseline.id).all<{ eval_case_id: string }>();
    for (const row of passed.results) baselinePassed.add(row.eval_case_id);
  }
  const batchId = crypto.randomUUID(), correlationId = crypto.randomUUID(), startedAt = new Date().toISOString();
  await database().prepare(`INSERT INTO eval_batches
    (id,organization_id,property_id,role_code,source_catalog_version,model_version,prompt_version,baseline_batch_id,status,deployment_gate,
     review_decision,total_cases,passed_cases,failed_cases,critical_failures,major_failures,regressions,summary_json,correlation_id,started_by,started_at)
    VALUES(?,?,?,?,?,?,?,?, 'RUNNING','PENDING','PENDING',?,0,0,0,0,0,'{}',?,?,?)`)
    .bind(batchId, context.organizationId, property.id, roleCode, CATALOG_VERSION, MODEL_VERSION, PROMPT_VERSION, baseline?.id || null,
      cases.length, correlationId, context.email, startedAt).run();
  const results: Array<{ evalCaseId: string; passed: boolean; severity: string; actual: string; expected: string }> = [];
  const runStatements: D1PreparedStatement[] = [];
  for (const evalCase of cases) {
    const fixture = parseJson(evalCase.input_fixture_json, {}), expected = parseJson(evalCase.expected_outcome_json, {});
    const began = Date.now(), actual = evaluateRoleParityCase(fixture.scenario), passed = actual === expected.decision;
    results.push({ evalCaseId: evalCase.id, passed, severity: evalCase.severity, actual, expected: expected.decision });
    runStatements.push(database().prepare(`INSERT INTO eval_runs
      (id,organization_id,property_id,eval_case_id,run_batch_id,de_output_json,passed,score,judge_reasoning,latency_ms,model_version,prompt_version,executed_at)
      VALUES(?,?,?,?,?,?,?, ?,NULL,?,?,?,?)`)
      .bind(crypto.randomUUID(), context.organizationId, property.id, evalCase.id, batchId,
        JSON.stringify({ decision: actual, engine: MODEL_VERSION, sourceCatalogVersion: CATALOG_VERSION }), passed ? 1 : 0, passed ? 100 : 0,
        Math.max(0, Date.now() - began), MODEL_VERSION, PROMPT_VERSION, new Date().toISOString()));
  }
  for (let index = 0; index < runStatements.length; index += 75) await database().batch(runStatements.slice(index, index + 75));
  const gate = resolveEvalGate(results, baselinePassed), failedCases = results.filter(row => !row.passed).length, completedAt = new Date().toISOString();
  const summary = { roleCode, totalCases: results.length, passedCases: results.length - failedCases, failedCases,
    criticalFailures: gate.criticalFailures, majorFailures: gate.majorFailures, regressions: gate.regressions,
    baselineBatchId: baseline?.id || null, deterministicOnly: true };
  await database().prepare(`UPDATE eval_batches SET status=?,deployment_gate=?,passed_cases=?,failed_cases=?,critical_failures=?,major_failures=?,regressions=?,summary_json=?,completed_at=? WHERE id=? AND organization_id=? AND property_id=?`)
    .bind(gate.status, gate.deploymentGate, results.length - failedCases, failedCases, gate.criticalFailures, gate.majorFailures,
      gate.regressions, JSON.stringify(summary), completedAt, batchId, context.organizationId, property.id).run();
  await recordSystemAudit({ organizationId: context.organizationId, propertyId: property.id,
    eventType: "QUALITY_EVAL_BATCH_COMPLETED", entityType: "EVAL_BATCH", entityId: batchId, authorType: "USER", authorId: context.email,
    correlationId, delta: summary, metadata: { deploymentGate: gate.deploymentGate, status: gate.status } });
  return { batchId, status: gate.status, deploymentGate: gate.deploymentGate, reviewDecision: "PENDING", ...summary };
}

export async function reviewEvalBatch(userEmail: string, input: Record<string, unknown>) {
  const scoped = await scope(userEmail, true);
  if (!scoped) return null;
  const { context, property } = scoped;
  const batchId = String(input.batchId || "").trim(), decision = String(input.decision || "").trim().toUpperCase();
  const reason = String(input.reason || "").trim().slice(0, 3000);
  if (reason.length < 10) throw new Error("Explain the release decision in at least 10 characters.");
  const batch = await database().prepare(`SELECT * FROM eval_batches WHERE id=? AND organization_id=? AND property_id=?`)
    .bind(batchId, context.organizationId, property.id).first<any>();
  if (!batch) throw new Error("The evaluation batch was not found in the active property.");
  const allowed = releaseReviewAllowed(batch, decision);
  if (!allowed.allowed) throw new Error(allowed.reason);
  const now = new Date().toISOString();
  await database().prepare(`UPDATE eval_batches SET review_decision=?,reviewed_by=?,reviewed_at=?,review_reason=? WHERE id=? AND organization_id=? AND property_id=?`)
    .bind(decision, context.email, now, reason, batch.id, context.organizationId, property.id).run();
  await recordSystemAudit({ organizationId: context.organizationId, propertyId: property.id,
    eventType: "QUALITY_RELEASE_DECISION_RECORDED", entityType: "EVAL_BATCH", entityId: batch.id, authorType: "USER", authorId: context.email,
    correlationId: batch.correlation_id, before: { reviewDecision: batch.review_decision }, after: { reviewDecision: decision, reviewedBy: context.email },
    delta: { reason, systemGate: batch.deployment_gate, criticalFailures: batch.critical_failures } });
  return { batchId: batch.id, decision, reviewedBy: context.email, reviewedAt: now };
}

async function sampleProperty(organizationId: string, propertyId: string, authorId: string) {
  const startedAt = new Date().toISOString(), runId = crypto.randomUUID(), correlationId = crypto.randomUUID();
  try {
    const actions = (await database().prepare(`SELECT q.*,d.role_key,d.duty_key,d.duty_name,d.confidence_threshold
      FROM digital_employee_work_queue q JOIN digital_employee_duties d ON d.id=q.duty_id
      LEFT JOIN shadow_audits s ON s.organization_id=q.organization_id AND s.property_id=q.property_id AND s.live_action_ref=q.id
      WHERE q.organization_id=? AND q.property_id=? AND q.outcome IS NOT NULL AND s.id IS NULL ORDER BY q.completed_at DESC,q.queued_at DESC LIMIT 100`)
      .bind(organizationId, propertyId).all<any>()).results;
    let flaggedCount = 0;
    for (const action of actions) {
      const classification = classifyShadowAction(action), shadowId = crypto.randomUUID(), now = new Date().toISOString();
      if (classification.flagged) flaggedCount += 1;
      await database().batch([
        database().prepare(`INSERT INTO shadow_audits
          (id,organization_id,property_id,role_code,task_code,live_action_ref,flagged,flag_reason,reviewer_email,review_status,reviewed_at,created_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
          .bind(shadowId, organizationId, propertyId, action.role_key, action.duty_key, action.id, classification.flagged ? 1 : 0,
            classification.reasons.join(" ") || null, classification.flagged ? null : "AAIQ-QUALITY-MONITOR",
            classification.flagged ? "PENDING" : "CLEARED", classification.flagged ? null : now, now),
        database().prepare(`INSERT INTO quality_shadow_classifications
          (shadow_audit_id,organization_id,property_id,severity,source_outcome,missing_verification,missing_audit_evidence,low_confidence,classification_json,sampled_at)
          VALUES(?,?,?,?,?,?,?,?,?,?)`)
          .bind(shadowId, organizationId, propertyId, classification.severity, classification.outcome,
            classification.missingVerification ? 1 : 0, classification.missingAuditEvidence ? 1 : 0, classification.lowConfidence ? 1 : 0,
            JSON.stringify(classification), now),
      ]);
    }
    const completedAt = new Date().toISOString();
    await database().prepare(`INSERT INTO quality_monitor_runs(id,organization_id,property_id,status,sampled_count,flagged_count,error_message,correlation_id,started_at,completed_at)
      VALUES(?,?,?,'COMPLETED',?,?,NULL,?,?,?)`).bind(runId, organizationId, propertyId, actions.length, flaggedCount, correlationId, startedAt, completedAt).run();
    await recordSystemAudit({ organizationId, propertyId, eventType: "QUALITY_SHADOW_SAMPLE_COMPLETED", entityType: "QUALITY_MONITOR_RUN",
      entityId: runId, authorType: "SYSTEM", authorId, correlationId, delta: { sampled: actions.length, flagged: flaggedCount } });
    return { runId, sampled: actions.length, flagged: flaggedCount, status: "COMPLETED" };
  } catch (error) {
    const completedAt = new Date().toISOString(), message = error instanceof Error ? error.message : "Shadow sampling failed.";
    await database().prepare(`INSERT INTO quality_monitor_runs(id,organization_id,property_id,status,sampled_count,flagged_count,error_message,correlation_id,started_at,completed_at)
      VALUES(?,?,?,'FAILED',0,0,?,?,?,?)`).bind(runId, organizationId, propertyId, message.slice(0, 2000), correlationId, startedAt, completedAt).run();
    await recordSystemAudit({ organizationId, propertyId, eventType: "QUALITY_SHADOW_SAMPLE_FAILED", entityType: "QUALITY_MONITOR_RUN",
      entityId: runId, authorType: "SYSTEM", authorId, correlationId, delta: { error: message.slice(0, 1000) } });
    return { runId, sampled: 0, flagged: 0, status: "FAILED", error: message };
  }
}

export async function runShadowMonitor(userEmail: string) {
  const scoped = await scope(userEmail, true);
  if (!scoped) return null;
  return sampleProperty(scoped.context.organizationId, scoped.property.id, scoped.context.email);
}

export async function reviewShadowAudit(userEmail: string, input: Record<string, unknown>) {
  const scoped = await scope(userEmail, true);
  if (!scoped) return null;
  const { context, property } = scoped;
  const shadowAuditId = String(input.shadowAuditId || "").trim(), decision = String(input.decision || "").trim().toUpperCase();
  const reason = String(input.reason || "").trim().slice(0, 3000);
  if (!["CONFIRMED", "CLEARED"].includes(decision)) throw new Error("Choose Confirm finding or Clear finding.");
  if (reason.length < 10) throw new Error("Explain the review decision in at least 10 characters.");
  const shadow = await database().prepare(`SELECT s.*,c.severity FROM shadow_audits s JOIN quality_shadow_classifications c ON c.shadow_audit_id=s.id
    WHERE s.id=? AND s.organization_id=? AND s.property_id=?`).bind(shadowAuditId, context.organizationId, property.id).first<any>();
  if (!shadow) throw new Error("The shadow audit was not found in the active property.");
  if (shadow.review_status !== "PENDING") throw new Error("This shadow finding already has a final review.");
  const now = new Date().toISOString(), reviewId = crypto.randomUUID();
  await database().batch([
    database().prepare(`UPDATE shadow_audits SET review_status=?,reviewer_email=?,reviewed_at=? WHERE id=? AND organization_id=? AND property_id=? AND review_status='PENDING'`)
      .bind(decision, context.email, now, shadow.id, context.organizationId, property.id),
    database().prepare(`INSERT INTO quality_shadow_reviews(id,organization_id,property_id,shadow_audit_id,decision,reason,reviewer_email,reviewed_at)
      VALUES(?,?,?,?,?,?,?,?)`).bind(reviewId, context.organizationId, property.id, shadow.id, decision, reason, context.email, now),
    database().prepare(`INSERT INTO trust_ledger_entries(id,organization_id,property_id,role_code,task_code,source,source_ref_id,outcome_score,window_date,created_at)
      VALUES(?,?,?,?,?,'SHADOW_AUDIT',?,?,?,?) ON CONFLICT(organization_id,property_id,source,source_ref_id) DO UPDATE SET outcome_score=excluded.outcome_score,window_date=excluded.window_date`)
      .bind(crypto.randomUUID(), context.organizationId, property.id, shadow.role_code, shadow.task_code, shadow.id,
        decision === "CONFIRMED" ? 0 : 100, now.slice(0, 10), now),
  ]);
  let demoted = false;
  if (decision === "CONFIRMED" && shadow.severity === "CRITICAL") {
    const result = await database().prepare(`UPDATE autonomy_config SET autonomy_level=CASE autonomy_level
      WHEN 'FULL' THEN 'CEILING_BOUND' WHEN 'CEILING_BOUND' THEN 'ASSISTED' WHEN 'ASSISTED' THEN 'NONE' ELSE 'NONE' END,
      current_trust_score=0,updated_by=?,updated_at=? WHERE organization_id=? AND property_id=? AND role_code=? AND task_code=?`)
      .bind(context.email, now, context.organizationId, property.id, shadow.role_code, shadow.task_code).run();
    demoted = Number(result.meta?.changes || 0) > 0;
  }
  await recordSystemAudit({ organizationId: context.organizationId, propertyId: property.id,
    eventType: "QUALITY_SHADOW_FINDING_REVIEWED", entityType: "SHADOW_AUDIT", entityId: shadow.id,
    authorType: "USER", authorId: context.email, correlationId: reviewId,
    before: { reviewStatus: shadow.review_status }, after: { reviewStatus: decision, reviewer: context.email },
    delta: { reason, severity: shadow.severity, autonomyDemoted: demoted } });
  return { shadowAuditId: shadow.id, decision, reviewer: context.email, reviewedAt: now, autonomyDemoted: demoted };
}

export async function runScheduledQualityMonitoring() {
  const properties = await database().prepare(`SELECT organization_id,id FROM property_contexts ORDER BY organization_id,id`).all<{ organization_id: string; id: string }>();
  const results = [];
  for (const property of properties.results) results.push(await sampleProperty(property.organization_id, property.id, "AAIQ-QUALITY-MONITOR"));
  return { properties: properties.results.length, results, completedAt: new Date().toISOString() };
}
