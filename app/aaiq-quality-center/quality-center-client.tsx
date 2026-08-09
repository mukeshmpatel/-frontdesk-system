"use client";

import { useEffect, useMemo, useState } from "react";

const STATUS_LABELS: Record<string, string> = {
  working_verified: "Human verified", working_incomplete: "Preview — incomplete", simulated: "Simulated",
  ui_shell: "UI shell", broken: "Broken", blocked_credentials: "Configuration required",
};

function json(value: unknown) { if (typeof value !== "string") return value; try { return JSON.parse(value); } catch { return value; } }

export default function QualityCenterClient() {
  const [data, setData] = useState<any>(null), [ledger, setLedger] = useState<any>(null);
  const [busy, setBusy] = useState(""), [notice, setNotice] = useState(""), [error, setError] = useState("");
  const [roleCode, setRoleCode] = useState("FRONT_DESK"), [selectedBatchId, setSelectedBatchId] = useState("");
  const [releaseReason, setReleaseReason] = useState("Reviewed the full case results, regressions, and supporting workflow evidence.");
  const [shadowReasons, setShadowReasons] = useState<Record<string, string>>({});
  const [suite, setSuite] = useState("ALL"), [itemType, setItemType] = useState("module"), [status, setStatus] = useState("ALL"), [query, setQuery] = useState("");

  async function load(batchId = selectedBatchId) {
    setError("");
    const suffix = batchId ? `?batchId=${encodeURIComponent(batchId)}` : "";
    const [qualityResponse, ledgerResponse] = await Promise.all([
      fetch(`/api/v1/quality-center${suffix}`, { cache: "no-store" }), fetch("/api/v1/capability-ledger", { cache: "no-store" }),
    ]);
    const qualityPayload = await qualityResponse.json().catch(() => ({}));
    const ledgerPayload = await ledgerResponse.json().catch(() => ({}));
    if (!qualityResponse.ok) setError(qualityPayload.error || "Quality evidence could not be loaded."); else {
      setData(qualityPayload); const returned = qualityPayload.evaluations?.selectedBatch?.id || "";
      if (returned && returned !== selectedBatchId) setSelectedBatchId(returned);
    }
    if (ledgerResponse.ok) setLedger(ledgerPayload);
  }

  useEffect(() => { void load(""); }, []);

  async function action(actionName: string, payload: Record<string, unknown> = {}) {
    setBusy(actionName); setNotice(""); setError("");
    const response = await fetch("/api/v1/quality-center", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: actionName, ...payload }) });
    const result = await response.json().catch(() => ({})); setBusy("");
    if (!response.ok) { setError(result.error || "The Quality Center action failed."); return; }
    const messages: Record<string, string> = {
      PREPARE_GOLDEN_LIBRARY: `AAIQ prepared ${result.cases} governed cases across ${result.tasks} duties.`,
      RUN_EVAL_SUITE: `${result.roleCode} completed ${result.totalCases} cases. System gate: ${result.deploymentGate}.`,
      REVIEW_EVAL_BATCH: `Release decision ${result.decision.toLowerCase()} by ${result.reviewedBy}.`,
      RUN_SHADOW_MONITOR: `Shadow monitor sampled ${result.sampled} completed actions and flagged ${result.flagged}.`,
      REVIEW_SHADOW_AUDIT: `Shadow finding ${result.decision.toLowerCase()}; autonomy demoted: ${result.autonomyDemoted ? "yes" : "no"}.`,
      RUN_STRUCTURAL_CHECKS: `Structural diagnostics completed: ${result.failures} failures and ${result.warnings} warnings. This is not task proof.`,
    };
    setNotice(messages[actionName] || "Saved with audit evidence.");
    const batchId = result.batchId || selectedBatchId; if (result.batchId) setSelectedBatchId(result.batchId); await load(batchId);
  }

  const evaluations = data?.evaluations, selectedBatch = evaluations?.selectedBatch;
  const selectedSummary = json(selectedBatch?.summary_json) || {};
  const structuralRun = data?.runs?.[0], structuralSummary = json(structuralRun?.summary_json) || {};
  const suites = useMemo(() => ["ALL", ...Array.from(new Set<string>((data?.checks || []).map((item: any) => item.suite)))], [data]);
  const visibleStructural = suite === "ALL" ? data?.checks : (data?.checks || []).filter((item: any) => item.suite === suite);
  const statusCounts = Object.fromEntries((ledger?.summaries?.byStatus || []).map((row: any) => [row.status, Number(row.count)]));
  const typeCounts = Object.fromEntries((ledger?.summaries?.byType || []).map((row: any) => [row.item_type, Number(row.count)]));
  const filteredLedger = useMemo(() => (ledger?.rows || []).filter((row: any) => (itemType === "ALL" || row.item_type === itemType) &&
    (status === "ALL" || row.status === status) && `${row.item_name} ${row.owning_module} ${row.known_gap_description || ""}`.toLowerCase().includes(query.toLowerCase())), [ledger, itemType, status, query]);
  const pendingShadows = (evaluations?.shadows || []).filter((item: any) => item.review_status === "PENDING");

  return <main className="qa-center">
    <header><div><a href="/">← AAIQ Home</a><small>MODULE 15 · TASK VERIFICATION</small><h1>AAIQ Truth & Verification Center</h1><p>AAIQ now tests Digital Employee policy decisions, blocks critical regressions, samples completed work for silent failure, and preserves the exact evidence a human needs for release review.</p></div><aside><strong>{evaluations?.property?.name || "Loading property…"}</strong><span>{evaluations?.role === "admin" ? "ADMINISTRATOR REVIEW" : "READ ONLY"}</span></aside></header>
    {notice && <p className="qa-notice success">{notice}</p>}{error && <p className="qa-notice failure">{error}</p>}

    <section className="qa-boundary"><article><small>AAIQ AUTOMATES</small><h2>Prepare, execute, compare, flag</h2><p>Golden policy cases, batch scoring, regression comparison, production sampling, and evidence preservation run without manual status selection.</p></article><article><small>HUMAN ONLY</small><h2>Credentials, semantic judge, release decision</h2><p>Provider credentials, approval of an independent judged-eval contract, and the named release decision remain human-controlled. A critical failure cannot be overridden.</p></article></section>

    <section className="qa-command qa-eval-command"><div><small>ONE CONTROLLED PATH</small><h2>Evaluate a Digital Employee role</h2><p>Choose one role. AAIQ prepares its canonical library automatically before every run and returns the exact deployment gate.</p></div><label>Role<select value={roleCode} onChange={event => setRoleCode(event.target.value)}>{(evaluations?.roleCoverage || []).map((role: any) => <option key={role.roleCode} value={role.roleCode}>{role.roleName}</option>)}</select></label><div className="qa-action-stack"><button disabled={!!busy || evaluations?.role !== "admin"} onClick={() => void action("RUN_EVAL_SUITE", { roleCode })}>{busy === "RUN_EVAL_SUITE" ? "Running cases…" : "Prepare & run role suite"}</button><button className="secondary" disabled={!!busy || evaluations?.role !== "admin"} onClick={() => void action("RUN_SHADOW_MONITOR")}>{busy === "RUN_SHADOW_MONITOR" ? "Sampling work…" : "Sample completed work"}</button></div></section>

    <section className="qa-role-grid">{(evaluations?.roleCoverage || []).map((role: any) => <article key={role.roleCode} className={role.roleCode === roleCode ? "active" : ""}><button type="button" aria-label={`Select ${role.roleName}`} onClick={() => setRoleCode(role.roleCode)}><small>{role.roleCode.replaceAll("_", " ")}</small><h3>{role.roleName}</h3><p>{role.coveredTasks}/{role.taskCount} duties · {role.caseCount} cases · {role.criticalCases} critical</p><b className={`gate ${String(role.latestBatch?.deployment_gate || "NOT_RUN").toLowerCase()}`}>{role.latestBatch?.deployment_gate || "NOT RUN"}</b></button></article>)}</section>

    <section className="qa-gate"><article><small>SYSTEM GATE</small><strong className={`gate ${String(selectedBatch?.deployment_gate || "NOT_RUN").toLowerCase()}`}>{selectedBatch?.deployment_gate || "NOT RUN"}</strong><span>{selectedBatch ? `${selectedBatch.failed_cases} failed · ${selectedBatch.regressions} regressions` : "Run one role suite"}</span></article><article><small>CRITICAL FAILURES</small><strong>{selectedBatch?.critical_failures ?? "—"}</strong><span>always blocks approval</span></article><article><small>HUMAN DECISION</small><strong>{selectedBatch?.review_decision || "PENDING"}</strong><span>{selectedBatch?.reviewed_by || "named reviewer required"}</span></article><article><small>SHADOW QUEUE</small><strong>{pendingShadows.length}</strong><span>production findings awaiting review</span></article></section>

    <section className="qa-results qa-batches"><header><div><small>REGRESSION BATCHES</small><h2>Exact role evaluation history</h2><p>A passed system gate is not a human release decision. Select a batch to inspect every result.</p></div><select aria-label="Select evaluation batch" value={selectedBatchId} onChange={event => { setSelectedBatchId(event.target.value); void load(event.target.value); }}><option value="">Select a batch</option>{(evaluations?.batches || []).map((batch: any) => <option key={batch.id} value={batch.id}>{batch.role_code} · {batch.deployment_gate} · {new Date(batch.started_at).toLocaleString()}</option>)}</select></header>
      {selectedBatch ? <><div className="qa-batch-summary"><span><b>{selectedBatch.role_code.replaceAll("_", " ")}</b>{selectedBatch.total_cases} cases</span><span><b>{selectedBatch.passed_cases}</b>passed</span><span><b>{selectedBatch.failed_cases}</b>failed</span><span><b>{selectedBatch.regressions}</b>regressions</span><span><b>{selectedBatch.model_version}</b>engine</span></div><div className="qa-case-table"><table><thead><tr><th>Result</th><th>Task / severity</th><th>Scenario</th><th>Expected</th><th>Actual</th></tr></thead><tbody>{(evaluations?.batchCases || []).map((row: any) => { const fixture: any = json(row.input_fixture_json) || {}, expected: any = json(row.expected_outcome_json) || {}, actual: any = json(row.de_output_json) || {}; return <tr key={row.id}><td><b className={row.passed ? "pass-pill" : "fail-pill"}>{row.passed ? "PASS" : "FAIL"}</b></td><td><strong>{row.task_code.replaceAll("_", " ")}</strong><small>{row.severity}</small></td><td>{fixture.name || "Governed case"}</td><td>{expected.decision || "—"}</td><td>{actual.decision || "—"}</td></tr>; })}</tbody></table></div>
      {evaluations.role === "admin" && <div className="qa-release-review"><label>Release review reason<textarea value={releaseReason} onChange={event => setReleaseReason(event.target.value)} /></label><button disabled={!!busy || selectedBatch.review_decision !== "PENDING" || selectedBatch.deployment_gate === "BLOCKED"} onClick={() => void action("REVIEW_EVAL_BATCH", { batchId: selectedBatch.id, decision: "APPROVED", reason: releaseReason })}>Approve evaluated role</button><button className="danger" disabled={!!busy || selectedBatch.review_decision !== "PENDING"} onClick={() => void action("REVIEW_EVAL_BATCH", { batchId: selectedBatch.id, decision: "REJECTED", reason: releaseReason })}>Reject release</button>{selectedBatch.deployment_gate === "BLOCKED" && <p>Approval is disabled because a critical failure must be repaired and rerun.</p>}</div>}</> : <div className="qa-empty"><b>No role evaluation has run.</b><p>Choose a role above; AAIQ will prepare and execute its policy cases in one step.</p></div>}
    </section>

    <section className="qa-results qa-shadow"><header><div><small>PRODUCTION SHADOW MONITORING</small><h2>Silent-failure review queue</h2><p>The sampler never changes operational work. It flags missing verification, missing audit evidence, failure/retry, escalation, or low confidence.</p></div><span>{evaluations?.monitorRuns?.[0] ? `Last sample: ${new Date(evaluations.monitorRuns[0].completed_at).toLocaleString()}` : "Scheduled and on demand"}</span></header>{pendingShadows.map((item: any) => <article key={item.id} className={String(item.severity).toLowerCase()}><b>{item.severity}</b><div><small>{item.role_code.replaceAll("_", " ")} · {item.task_code.replaceAll("_", " ")}</small><h3>{item.duty_name || "Digital Employee work item"}</h3><p>{item.flag_reason}</p><label>Reviewer explanation<input value={shadowReasons[item.id] || ""} onChange={event => setShadowReasons(current => ({ ...current, [item.id]: event.target.value }))} placeholder="Explain why the finding is confirmed or cleared" /></label></div><span><button disabled={!!busy} onClick={() => void action("REVIEW_SHADOW_AUDIT", { shadowAuditId: item.id, decision: "CONFIRMED", reason: shadowReasons[item.id] || "Confirmed after reviewing the stored action and missing proof." })}>Confirm finding</button><button className="secondary" disabled={!!busy} onClick={() => void action("REVIEW_SHADOW_AUDIT", { shadowAuditId: item.id, decision: "CLEARED", reason: shadowReasons[item.id] || "Cleared after reviewing the complete source and verification evidence." })}>Clear finding</button></span></article>)}{!pendingShadows.length && <div className="qa-empty"><b>No shadow finding needs human review.</b><p>AAIQ will continue sampling completed Digital Employee work on schedule.</p></div>}</section>

    <section className="qa-results qa-workflow-proof"><header><div><small>BUSINESS OUTCOME PROOF</small><h2>Stored seven-question verification runs</h2><p>Policy evals prove authority decisions. These separate runs prove a real business workflow reached and verified its postcondition.</p></div></header>{(evaluations?.workflowRuns || []).map((run: any) => <article key={run.id} className={run.verification_result === "pass" ? "pass" : "fail"}><b>{String(run.verification_result).toUpperCase()}</b><div><small>{run.workflow_key}</small><h3>{run.trigger_description}</h3><p>{run.action_taken}</p><em>{run.verification_method}</em></div><span>{run.reviewed_by ? `Reviewed by ${run.reviewed_by}` : "Human review pending"}<a href={run.audit_evidence_url}>Open evidence</a></span></article>)}{!evaluations?.workflowRuns?.length && <div className="qa-empty"><b>No property workflow has named human verification.</b><p>Complete the documented cash, housekeeping, maintenance, or compliance UAT to create eligible proof.</p></div>}</section>

    <section className="qa-judge"><small>SEMANTIC JUDGE</small><h2>Judged and hybrid evaluations: configuration required</h2><p>{evaluations?.judge?.explanation}</p><a href="/aaiq-integration-center">Configure an approved independent model when ready →</a></section>

    <details className="qa-details"><summary>Open full capability inventory ({ledger?.rows?.length || 0} items)</summary><section className="qa-truth-banner"><b>No self-certification</b><span>Current baseline contains <strong>{statusCounts.working_verified || 0}</strong> human-verified capabilities. A policy batch supports a decision but never replaces seven-question workflow proof.</span></section><div className="qa-ledger-filters"><label>Item type<select value={itemType} onChange={event => setItemType(event.target.value)}><option value="ALL">All ({ledger?.rows?.length || 0})</option>{Object.entries(typeCounts).map(([key, count]) => <option key={key} value={key}>{key.replaceAll("_", " ")} ({String(count)})</option>)}</select></label><label>Status<select value={status} onChange={event => setStatus(event.target.value)}><option value="ALL">All statuses</option>{Object.keys(STATUS_LABELS).map(key => <option key={key} value={key}>{STATUS_LABELS[key]} ({statusCounts[key] || 0})</option>)}</select></label><label>Find item<input value={query} onChange={event => setQuery(event.target.value)} placeholder="Module, duty, integration, report…" /></label><span>{filteredLedger.length} matches</span></div><div className="qa-ledger-table"><table><thead><tr><th>Status</th><th>Capability</th><th>Owner</th><th>Known gap</th><th>Evidence</th></tr></thead><tbody>{filteredLedger.slice(0, 250).map((row: any) => <tr key={row.item_key}><td><b className={`ledger-status ${row.status}`}>{STATUS_LABELS[row.status] || row.status}</b></td><td><strong>{row.item_name}</strong><small>{row.item_type.replaceAll("_", " ")} · {row.source_path || "catalog"}</small></td><td>{row.owning_module}</td><td>{row.known_gap_description}</td><td>{row.evidence_artifact_path ? <a href={row.evidence_artifact_path}>Open evidence</a> : "No accepted evidence"}</td></tr>)}</tbody></table></div></details>

    <details className="qa-details"><summary>Run structural diagnostics (not functional proof)</summary><section className="qa-command qa-structural-command"><div><small>STRUCTURAL CHECKS — NOT FUNCTIONAL PROOF</small><h2>Route, schema, scope, and connector sanity</h2><p>These diagnostics find deployment problems. Their score is never a release score.</p></div><button disabled={!!busy || data?.role !== "admin"} onClick={() => void action("RUN_STRUCTURAL_CHECKS")}>{busy === "RUN_STRUCTURAL_CHECKS" ? "Checking structure…" : "Run structural checks"}</button></section><section className="qa-gate"><article><small>STRUCTURAL HEALTH SCORE</small><strong>{structuralRun?.score ?? "—"}</strong><span>/ 100 · not a release score</span></article><article><small>STRUCTURAL STATUS</small><strong>{structuralRun?.status || "NOT CHECKED"}</strong></article><article><small>STRUCTURAL CHECKS</small><strong>{structuralSummary.total ?? 0}</strong><span>{structuralSummary.failures || 0} failed · {structuralSummary.warnings || 0} warnings</span></article></section><nav className="qa-suite-filter" aria-label="Filter structural evidence">{suites.map(item => <button type="button" className={suite === item ? "active" : ""} key={item} onClick={() => setSuite(item)}>{item.replaceAll("_", " ")}</button>)}</nav><section className="qa-results qa-structural-results">{visibleStructural?.map((check: any) => <article key={check.id} className={check.status.toLowerCase()}><b>{check.status}</b><div><small>{check.suite.replaceAll("_", " ")}</small><h3>{check.name}</h3><p>{check.evidence}</p>{check.recommendation && <em>Next: {check.recommendation}</em>}</div><span>{check.latency_ms == null ? "DATA" : `${check.latency_ms} ms`}{check.route && <a href={check.route}>Open workspace</a>}</span></article>)}{!data?.checks?.length && <div className="qa-empty">No structural diagnostics have run.</div>}</section></details>
  </main>;
}
