"use client";

import { useEffect, useMemo, useState } from "react";
import "./cash-custody.css";
import "./cash-reconciliation.css";

type Row = Record<string, any>;
type CustodyData = {
  role: string;
  userEmail: string;
  property: Row;
  denominationOptions: number[];
  sessions: Row[];
  denominations: Row[];
  checks: Row[];
  receipts: Row[];
  verifications: Row[];
  kpis: Row;
  boundaries: Row;
};
type ReconciliationDetail = { property: Row; businessDate: string; canManage: boolean; policy: Row; reconciliation: Row | null };
type ReconciliationSources = { batches: Row[]; transactions: Row[]; sessions: Row[]; receipts: Row[]; verifications: Row[] };

const money = (c: number | null | undefined) => c === null || c === undefined
  ? "Not computable"
  : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(c) || 0) / 100);
const label = (c: number) => c >= 100 ? `$${c / 100}` : `${c}¢`;
const initialDate = () => new Date().toLocaleDateString("en-CA");

export default function CashCustodyClient() {
  const [data, setData] = useState<CustodyData | null>(null);
  const [detail, setDetail] = useState<ReconciliationDetail | null>(null);
  const [sourceDetail, setSourceDetail] = useState<ReconciliationSources | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("reconciliation");
  const [businessDate, setBusinessDate] = useState(initialDate);
  const [selectedShift, setSelectedShift] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState("PMS_EXPORT");
  const [sourceReference, setSourceReference] = useState("");
  const [sourceContent, setSourceContent] = useState("business_date,shift,cash_amount,reference,occurred_at\n");
  const [sourceBatchId, setSourceBatchId] = useState("");
  const [shiftCode, setShiftCode] = useState("AM");
  const [legacyExpected, setLegacyExpected] = useState("0");
  const [legacyReference, setLegacyReference] = useState("");
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [managerCounts, setManagerCounts] = useState<Record<number, number>>({});
  const [seal, setSeal] = useState("");
  const [checkPayer, setCheckPayer] = useState("");
  const [checkNumber, setCheckNumber] = useState("");
  const [checkAmount, setCheckAmount] = useState("");
  const [checkObject, setCheckObject] = useState("");
  const [receivedChecks, setReceivedChecks] = useState("");
  const [resolution, setResolution] = useState("");
  const [policyShifts, setPolicyShifts] = useState("AM, PM, NIGHT");
  const [policyThreshold, setPolicyThreshold] = useState("10.00");
  const [policyWindow, setPolicyWindow] = useState("30");
  const [policyTime, setPolicyTime] = useState("03:30");

  async function readJson<T extends Row = Row>(response: Response): Promise<T> {
    const payload = await response.json().catch(() => ({ error: "The server returned an unreadable response." })) as Row;
    if (!response.ok) throw new Error(String(payload.error || "The action could not be completed."));
    return payload as T;
  }

  async function loadCustody() {
    const payload = await readJson<CustodyData>(await fetch("/api/v1/cash-custody", { cache: "no-store" }));
    setData(payload);
    const current = payload.sessions.find((row: Row) => row.status === "OPEN") || payload.sessions.find((row: Row) => row.status === "SUBMITTED");
    setSelectedSession((value) => value || current?.id || payload.sessions[0]?.id || null);
    if (current?.status === "OPEN") {
      const saved: Record<number, number> = {};
      payload.denominations.filter((row: Row) => row.session_id === current.id).forEach((row: Row) => saved[row.denomination_cents] = row.quantity);
      setCounts(saved);
    }
  }

  async function loadReconciliation(date = businessDate) {
    const payload = await readJson<ReconciliationDetail>(await fetch(`/api/frontdesk/cash-reconciliation/${encodeURIComponent(date)}`, { cache: "no-store" }));
    setDetail(payload);
    setBusinessDate(payload.businessDate);
    setPolicyShifts((payload.policy.expectedShiftCodes || []).join(", "));
    setPolicyThreshold((Number(payload.policy.discrepancy_threshold_cents || 0) / 100).toFixed(2));
    setPolicyWindow(String(payload.policy.escalation_window_minutes || 0));
    setPolicyTime(payload.policy.scheduled_local_time || "03:30");
    const sources = await readJson<ReconciliationSources>(await fetch(`/api/frontdesk/cash-reconciliation/${encodeURIComponent(payload.businessDate)}/sources`, { cache: "no-store" }));
    setSourceDetail(sources);
    const activeBatches = sources.batches.filter((batch: Row) => batch.status === "PARSED" && Number(batch.active) === 1);
    setSourceBatchId((value) => activeBatches.some((batch: Row) => batch.id === value) ? value : activeBatches[0]?.id || "");
    const firstShift = payload.reconciliation?.shifts?.[0]?.shiftCode || payload.policy.expectedShiftCodes?.[0] || "AM";
    setSelectedShift((value) => value || firstShift);
    setShiftCode((value) => value || firstShift);
  }

  async function reloadAll(date = businessDate) {
    await Promise.all([loadCustody(), loadReconciliation(date)]);
  }

  useEffect(() => {
    void reloadAll().catch((error) => setMessage(error instanceof Error ? error.message : "Cash workspace could not load."));
  }, []);

  async function post(url: string, body?: Row) {
    setBusy(true);
    setMessage("");
    try {
      const payload = await readJson(await fetch(url, {
        method: "POST",
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      }));
      return payload;
    } finally {
      setBusy(false);
    }
  }

  async function custodyAction(body: Row) {
    try {
      await post("/api/v1/cash-custody", body);
      setMessage("Saved with a property-scoped audit receipt.");
      await reloadAll();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Cash custody action failed.");
      return false;
    }
  }

  async function runReconciliation() {
    try {
      const result = await post("/api/frontdesk/cash-reconciliation/run", { businessDate });
      setMessage(result.sourceStatus === "AVAILABLE"
        ? `Recomputed from authorized source and custody records. Independent check: ${result.independentVerification?.status || "pending"}.`
        : "AAIQ cannot compute the full-day expected total until an authorized report contains every configured shift.");
      await reloadAll(businessDate);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Reconciliation failed.");
    }
  }

  async function importAndRun() {
    try {
      await post("/api/frontdesk/cash-reconciliation/import", { businessDate, sourceType, sourceReference, content: sourceContent });
      const result = await post("/api/frontdesk/cash-reconciliation/run", { businessDate });
      setMessage(result.sourceStatus === "AVAILABLE"
        ? "Report imported, daily reconciliation run, and result independently checked."
        : "Report imported, but one or more configured shifts still have no authorized source rows.");
      await reloadAll(businessDate);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Report import failed.");
    }
  }

  async function savePolicy() {
    try {
      await post("/api/frontdesk/cash-reconciliation/policy", {
        expectedShiftCodes: policyShifts.split(",").map((value) => value.trim()).filter(Boolean),
        discrepancyThresholdCents: Math.round(Number(policyThreshold) * 100),
        escalationWindowMinutes: Number(policyWindow), scheduledLocalTime: policyTime,
      });
      setMessage("Property cash policy saved and audited. Run reconciliation again to apply it.");
      await loadReconciliation(businessDate);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Policy could not be saved.");
    }
  }

  async function verifyManagerDrop() {
    if (!selectedSessionRow) return;
    const verified = await custodyAction({
      action: "MANAGER_VERIFY",
      sessionId: selectedSessionRow.id,
      counts: data?.denominationOptions.map((denomination) => ({ denominationCents: denomination, quantity: managerCounts[denomination] || 0 })),
      receivedCheckCents: Math.round(Number(receivedChecks || 0) * 100),
      resolutionNote: resolution,
    });
    if (verified) await runReconciliation();
  }

  const open = data?.sessions.find((row) => row.status === "OPEN" && row.employee_email.toLowerCase() === data.userEmail.toLowerCase());
  const selectedSessionRow = data?.sessions.find((row) => row.id === selectedSession);
  const reconciliation = detail?.reconciliation;
  const cashTotal = useMemo(() => Object.entries(counts).reduce((sum, [denomination, quantity]) => sum + Number(denomination) * Number(quantity), 0), [counts]);
  const managerTotal = useMemo(() => Object.entries(managerCounts).reduce((sum, [denomination, quantity]) => sum + Number(denomination) * Number(quantity), 0), [managerCounts]);
  const sessionDenominations = (id: string) => data?.denominations.filter((row) => row.session_id === id) || [];
  const sessionChecks = (id: string) => data?.checks.filter((row) => row.session_id === id) || [];
  const sessionReceipts = (id: string) => data?.receipts.filter((row) => row.session_id === id) || [];
  const parsedBatches = sourceDetail?.batches.filter((batch) => batch.status === "PARSED" && Number(batch.active) === 1) || [];
  const selectedShiftRow = reconciliation?.shifts?.find((row: Row) => row.shiftCode === selectedShift);
  const selectedTransactions = sourceDetail?.transactions.filter((row) => row.shift_code === selectedShift) || [];
  const selectedShiftSessions = sourceDetail?.sessions.filter((row) => row.shift_code === selectedShift) || [];

  return <main className="cash-center">
    <header className="cash-hero">
      <div><small>AAIQ SOURCE-BACKED CASH CONTROL</small><h1>Cash & Check Reconciliation</h1><p>AAIQ combines authorized PMS/email report rows with physical shift drops, verifies the calculation independently, and creates real work when evidence is missing or cash differs.</p></div>
      <aside><b>{data?.property?.name || "Loading…"}</b><span>{data?.property?.code || "PROPERTY"}</span><em>Accounting posting and bank deposit remain human-controlled</em></aside>
    </header>

    <button className={`daily-answer ${reconciliation?.reconciliation_status || "NOT_RUN"}`} onClick={() => setTab("reconciliation")}>
      <span><small>{businessDate} · DAILY ANSWER</small><b>{reconciliation?.reconciliation_status === "SOURCE_UNAVAILABLE" ? "Cannot compute from current evidence" : `Physically counted ${money(reconciliation?.counted_total_cents)}`}</b><em>{reconciliation ? `${reconciliation.unresolved_gap_count} unresolved evidence gap(s)` : "Reconciliation has not run"}</em></span>
      <span><small>AUTHORIZED SOURCE</small><strong>{money(reconciliation?.expected_total_cents)}</strong><em>{reconciliation?.independent_verification_status ? `Independent check ${reconciliation.independent_verification_status}` : "Independent check pending"}</em></span>
      <span><small>VARIANCE</small><strong className={Number(reconciliation?.variance_cents || 0) === 0 ? "match" : "variance"}>{money(reconciliation?.variance_cents)}</strong><em>Open shift and source evidence →</em></span>
    </button>

    <section className="cash-kpis">
      <article><small>My/open drops</small><strong>{data?.kpis.open ?? "—"}</strong></article>
      <article><small>Awaiting manager</small><strong>{data?.kpis.submitted ?? "—"}</strong></article>
      <article><small>Manager verified</small><strong>{data?.kpis.verified ?? "—"}</strong></article>
      <article><small>Custody variance</small><strong>{money(data?.kpis.totalVarianceCents || 0)}</strong></article>
    </section>

    <nav className="cash-tabs">
      <button className={tab === "reconciliation" ? "active" : ""} onClick={() => setTab("reconciliation")}>Daily reconciliation</button>
      <button className={tab === "cashier" ? "active" : ""} onClick={() => setTab("cashier")}>Cashier shift drop</button>
      {detail?.canManage && <button className={tab === "manager" ? "active" : ""} onClick={() => setTab("manager")}>Manager verification</button>}
      <button className={tab === "reports" ? "active" : ""} onClick={() => setTab("reports")}>{"Reports & audit"}</button>
      <button className={tab === "help" ? "active" : ""} onClick={() => setTab("help")}>Detailed help</button>
    </nav>
    {message && <p className="cash-message">{message}<button aria-label="Dismiss message" onClick={() => setMessage("")}>×</button></p>}

    {tab === "reconciliation" && <section className="reconciliation-workspace">
      <header className="reconciliation-toolbar">
        <div><small>BUSINESS DATE</small><input aria-label="Cash reconciliation business date" type="date" value={businessDate} onChange={(event) => setBusinessDate(event.target.value)} /></div>
        <button disabled={busy} onClick={() => void loadReconciliation(businessDate).catch((error) => setMessage(error.message))}>Load date</button>
        {detail?.canManage && <button className="primary" disabled={busy} onClick={() => void runReconciliation()}>Run from current evidence</button>}
      </header>

      {!reconciliation && <article className="truth-state warning"><h2>No daily result exists for {businessDate}</h2><p>AAIQ has not calculated this date. Import the authorized report, or run now to receive a truthful “source unavailable” result with a follow-up task.</p></article>}
      {reconciliation?.reconciliation_status === "SOURCE_UNAVAILABLE" && <article className="truth-state danger"><h2>AAIQ cannot compute the full-day expected cash</h2><p>No valid report exists for every configured shift. Counted cash remains visible as physical custody, but it is not presented as a complete daily reconciliation. Import the PMS export or scheduled-email rows below.</p></article>}
      {reconciliation && <section className="daily-summary-grid">
        <article><small>Expected from source</small><strong>{money(reconciliation.expected_total_cents)}</strong><span>{reconciliation.source_status}</span></article>
        <article><small>Physical count</small><strong>{money(reconciliation.counted_total_cents)}</strong><span>Manager recount used when available</span></article>
        <article><small>Shortage / overage</small><strong className={Number(reconciliation.variance_cents || 0) === 0 ? "match" : "variance"}>{money(reconciliation.variance_cents)}</strong><span>{reconciliation.reconciliation_status.replaceAll("_", " ")}</span></article>
        <article><small>Independent proof</small><strong>{reconciliation.independent_verification_status}</strong><span>Fresh source and custody re-query</span></article>
      </section>}

      <section className="shift-drilldown">
        <header><div><small>LEVEL 1 · SHIFT DRILL-DOWN</small><h2>Every required shift</h2></div><p>Click a shift, then inspect exact source rows and custody records below.</p></header>
        <div className="shift-list">{(reconciliation?.shifts || detail?.policy.expectedShiftCodes?.map((shift: string) => ({ shiftCode: shift, gaps: ["NOT_RUN"] })) || []).map((shift: Row) => <button key={shift.shiftCode} className={selectedShift === shift.shiftCode ? "active" : ""} onClick={() => setSelectedShift(shift.shiftCode)}>
          <span><b>{shift.shiftCode}</b><small>{shift.gaps?.length ? shift.gaps.join(" · ").replaceAll("_", " ") : "All required evidence present"}</small></span>
          <span><b>{money(shift.countedCents)}</b><small>Expected {money(shift.expectedCents)}</small></span>
        </button>)}</div>
        {selectedShift && <article className="shift-detail">
          <header><div><small>LEVEL 2 · EXACT EVIDENCE</small><h3>{selectedShift} shift</h3></div><b className={selectedShiftRow?.varianceCents === 0 ? "match" : "variance"}>Variance {money(selectedShiftRow?.varianceCents)}</b></header>
          <div className="evidence-columns">
            <section><h4>Authorized source rows</h4>{selectedTransactions.map((row) => <details key={row.id}><summary>{row.source_reference} · {money(row.amount_cents)}</summary><p>Batch {row.batch_id} · row {row.source_row_number} · {row.occurred_at || "No source timestamp"}</p><code>{row.raw_row_text}</code></details>)}{!selectedTransactions.length && <p className="empty-evidence">No authorized source rows. The expected amount cannot be computed.</p>}</section>
            <section><h4>Physical custody</h4>{selectedShiftSessions.map((row) => <details key={row.id}><summary>{row.employee_email} · {row.status} · {money(row.counted_cash_cents)}</summary><p>Session {row.id}</p><p>Submitted {row.submitted_at ? new Date(row.submitted_at).toLocaleString() : "not submitted"} · verified by {row.verified_by || "nobody yet"}</p></details>)}{!selectedShiftSessions.length && <p className="empty-evidence">No physical drop was submitted for this shift.</p>}</section>
          </div>
        </article>}
      </section>

      {detail?.canManage && <section className="manager-setup-grid">
        <form onSubmit={(event) => { event.preventDefault(); void importAndRun(); }}>
          <header><small>ONE HUMAN INPUT WHEN NO LIVE PMS CONNECTOR EXISTS</small><h2>Import scheduled-email or PMS-export cash rows</h2><p>AAIQ parses, hashes, stores exact rows, runs reconciliation, and independently checks it in one action. Live OPERA/OHIP is not claimed until its certified connector and credentials exist.</p></header>
          <label>Business date<input type="date" value={businessDate} onChange={(event) => setBusinessDate(event.target.value)} /></label>
          <label>Source type<select value={sourceType} onChange={(event) => setSourceType(event.target.value)}><option value="PMS_EXPORT">PMS export</option><option value="EMAIL_REPORT">Scheduled email report</option><option value="MANUAL_UPLOAD">Manual report content</option><option value="PMS_LIVE">Live PMS (blocked until connected)</option></select></label>
          <label>Report or email reference<input value={sourceReference} onChange={(event) => setSourceReference(event.target.value)} placeholder="OPERA Daily Cash · email subject/message ID" /></label>
          <label>CSV report rows<textarea value={sourceContent} onChange={(event) => setSourceContent(event.target.value)} spellCheck={false} /></label>
          <p className="field-help">Required headers: <code>shift,cash_amount</code>. Optional: <code>business_date,reference,occurred_at</code>. Dollar and negative refund amounts are supported.</p>
          <button className="primary" disabled={busy || !sourceReference.trim() || sourceContent.trim().split(/\r?\n/).length < 2}>Import, reconcile, and verify</button>
        </form>
        <form onSubmit={(event) => { event.preventDefault(); void savePolicy(); }}>
          <header><small>PROPERTY POLICY</small><h2>Expected shifts and escalation</h2><p>The scheduled worker closes the prior business date at the configured local time. Over-threshold unresolved differences route to a named manager after the review window.</p></header>
          <label>Required physical shifts<input value={policyShifts} onChange={(event) => setPolicyShifts(event.target.value)} placeholder="AM, PM, NIGHT" /></label>
          <label>Escalate at shortage/overage<input type="number" min="0" step=".01" value={policyThreshold} onChange={(event) => setPolicyThreshold(event.target.value)} /></label>
          <label>Manager review window (minutes)<input type="number" min="0" max="10080" step="1" value={policyWindow} onChange={(event) => setPolicyWindow(event.target.value)} /></label>
          <label>Nightly local close time<input type="time" value={policyTime} onChange={(event) => setPolicyTime(event.target.value)} /></label>
          <button disabled={busy}>Save audited property policy</button>
        </form>
      </section>}
    </section>}

    {tab === "cashier" && <section className="cash-workflow">
      {!open ? <form onSubmit={(event) => { event.preventDefault(); void custodyAction(sourceBatchId
        ? { action: "START_SESSION", businessDate, shiftCode, sourceBatchId }
        : { action: "START_SESSION", businessDate, shiftCode, expectedCashCents: Math.round(Number(legacyExpected) * 100), sourceType: "MANAGER_ENTERED", sourceReference: legacyReference }); }}>
        <header><small>STEP 1</small><h2>Start a source-linked shift drop</h2><p>Choose the imported batch and shift. AAIQ derives expected cash from exact source rows. The manual manager-reference fallback remains available only when no import exists.</p></header>
        <label>Business date<input type="date" value={businessDate} onChange={(event) => setBusinessDate(event.target.value)} /></label>
        <label>Shift<select value={shiftCode} onChange={(event) => setShiftCode(event.target.value)}>{(detail?.policy.expectedShiftCodes || ["AM", "PM", "NIGHT"]).map((shift: string) => <option key={shift}>{shift}</option>)}</select></label>
        <label>Authorized report batch<select value={sourceBatchId} onChange={(event) => setSourceBatchId(event.target.value)}><option value="">No imported batch — manager fallback</option>{parsedBatches.map((batch) => <option key={batch.id} value={batch.id}>{batch.source_reference} · {money(batch.total_cash_cents)}</option>)}</select></label>
        {!sourceBatchId && <><label>Manager-provided expected cash<input type="number" min="0" step=".01" value={legacyExpected} onChange={(event) => setLegacyExpected(event.target.value)} /></label><label>Manager evidence reference<input value={legacyReference} onChange={(event) => setLegacyReference(event.target.value)} placeholder="Named manager and source record" /></label></>}
        <button disabled={busy || (!sourceBatchId && !legacyReference.trim())}>Start governed drop</button>
      </form> : <>
        <section className="count-card"><header><small>STEP 2 · {open.business_date || "LEGACY DATE"} · {open.shift_code || "UNASSIGNED"}</small><h2>Count bills and coins</h2><p>The total is calculated from quantities. Enter zero for denominations not present.</p></header><div className="denomination-grid">{data?.denominationOptions.map((denomination) => <label key={denomination}><span>{label(denomination)}</span><input type="number" min="0" step="1" value={counts[denomination] ?? 0} onChange={(event) => setCounts({ ...counts, [denomination]: Math.max(0, Number(event.target.value) || 0) })} /><b>{money(denomination * (counts[denomination] || 0))}</b></label>)}</div><div className="cash-totals"><span>Expected <b>{money(open.expected_cash_cents)}</b></span><span>Counted <b>{money(cashTotal)}</b></span><span className={cashTotal - open.expected_cash_cents === 0 ? "match" : "variance"}>Variance <b>{money(cashTotal - open.expected_cash_cents)}</b></span></div><button disabled={busy} onClick={() => void custodyAction({ action: "SAVE_DENOMINATIONS", sessionId: open.id, counts: data?.denominationOptions.map((denomination) => ({ denominationCents: denomination, quantity: counts[denomination] || 0 })) })}>Save denomination count</button></section>
        <form onSubmit={(event) => { event.preventDefault(); void custodyAction({ action: "ADD_CHECK", sessionId: open.id, payerName: checkPayer, checkNumberMasked: checkNumber, amountCents: Math.round(Number(checkAmount) * 100), documentObjectKey: checkObject }).then((ok) => { if (ok) { setCheckPayer(""); setCheckNumber(""); setCheckAmount(""); setCheckObject(""); } }); }}><header><small>STEP 3 · OPTIONAL</small><h2>Capture checks</h2><p>Use a masked reference. Private Document Vault evidence can be linked when storage is configured.</p></header><label>Payer<input value={checkPayer} onChange={(event) => setCheckPayer(event.target.value)} /></label><label>Masked check number<input value={checkNumber} onChange={(event) => setCheckNumber(event.target.value)} placeholder="****1234" /></label><label>Amount<input type="number" min=".01" step=".01" value={checkAmount} onChange={(event) => setCheckAmount(event.target.value)} /></label><label>Private document reference<input value={checkObject} onChange={(event) => setCheckObject(event.target.value)} placeholder="Optional Document Vault object key" /></label><button disabled={busy || !checkPayer || !checkNumber || !checkAmount}>Add check draft</button><ul>{sessionChecks(open.id).map((row) => <li key={row.id}>{row.payer_name} · {row.check_number_masked} · {money(row.amount_cents)} · posting {row.posting_status}</li>)}</ul></form>
        <section className="submit-drop"><header><small>STEP 4</small><h2>Seal and submit immutable custody</h2><p>After submission, the employee count cannot be silently edited. A different manager performs the recount.</p></header><label>Drop bag/envelope seal reference<input value={seal} onChange={(event) => setSeal(event.target.value)} /></label><button disabled={busy || !seal.trim()} onClick={() => void custodyAction({ action: "SUBMIT_SESSION", sessionId: open.id, sealReference: seal })}>Seal and submit to manager</button></section>
      </>}
    </section>}

    {tab === "manager" && detail?.canManage && <section className="manager-flow">
      <aside>{data?.sessions.filter((row) => row.status === "SUBMITTED" && row.employee_email.toLowerCase() !== data.userEmail.toLowerCase()).map((row) => <button className={selectedSession === row.id ? "active" : ""} key={row.id} onClick={() => { setSelectedSession(row.id); setManagerCounts({}); setReceivedChecks(String(Number(row.check_total_cents || 0) / 100)); setResolution(""); }}><b>{row.employee_email}</b><span>{row.business_date || "Legacy date"} · {row.shift_code || "Unassigned"}</span><span>{money(row.counted_cash_cents)} cash · {money(row.check_total_cents)} checks</span><small>{new Date(row.submitted_at).toLocaleString()}</small></button>)}{!data?.sessions.some((row) => row.status === "SUBMITTED" && row.employee_email.toLowerCase() !== data.userEmail.toLowerCase()) && <p>No submitted drops from another employee await verification.</p>}</aside>
      {selectedSessionRow?.status === "SUBMITTED" && selectedSessionRow.employee_email.toLowerCase() !== data?.userEmail.toLowerCase() && <article><header><small>INDEPENDENT MANAGER RECOUNT</small><h2>Do not copy the employee count</h2><p>Count the sealed contents. Self-verification is blocked.</p></header><div className="denomination-grid">{data?.denominationOptions.map((denomination) => <label key={denomination}><span>{label(denomination)}</span><input type="number" min="0" step="1" value={managerCounts[denomination] ?? 0} onChange={(event) => setManagerCounts({ ...managerCounts, [denomination]: Math.max(0, Number(event.target.value) || 0) })} /><b>{money(denomination * (managerCounts[denomination] || 0))}</b></label>)}</div><label>Checks received total<input type="number" min="0" step=".01" value={receivedChecks} onChange={(event) => setReceivedChecks(event.target.value)} /></label><div className="cash-totals"><span>Employee custody <b>{money(Number(selectedSessionRow.counted_cash_cents) + Number(selectedSessionRow.check_total_cents))}</b></span><span>Manager received <b>{money(managerTotal + Math.round(Number(receivedChecks || 0) * 100))}</b></span><span>Difference <b>{money(managerTotal + Math.round(Number(receivedChecks || 0) * 100) - Number(selectedSessionRow.counted_cash_cents) - Number(selectedSessionRow.check_total_cents))}</b></span></div><label>Variance resolution<textarea value={resolution} onChange={(event) => setResolution(event.target.value)} placeholder="Required when the recount differs. State the factual resolution." /></label><button disabled={busy} onClick={() => void verifyManagerDrop()}>Verify, receipt, and refresh daily result</button></article>}
    </section>}

    {tab === "reports" && <section className="custody-reports"><header><small>CLICKABLE IMMUTABLE CUSTODY RECORDS</small><h2>Shift sessions, receipts, and variance evidence</h2></header>{data?.sessions.map((row) => <article key={row.id}><button onClick={() => setSelectedSession(selectedSession === row.id ? null : row.id)}><span><b>{row.employee_email} · {row.shift_code || "UNASSIGNED"}</b><small>{row.business_date || "Legacy date"} · {new Date(row.created_at).toLocaleString()} · {row.status}</small></span><strong className={row.variance_cents === 0 ? "match" : "variance"}>{money(row.variance_cents)}</strong></button>{selectedSession === row.id && <div className="report-detail"><dl><div><dt>Expected</dt><dd>{money(row.expected_cash_cents)}</dd></div><div><dt>Counted</dt><dd>{money(row.counted_cash_cents)}</dd></div><div><dt>Checks</dt><dd>{money(row.check_total_cents)}</dd></div><div><dt>Source</dt><dd>{row.source_type} · {row.source_reference}</dd></div></dl><h3>Employee denominations</h3><p>{sessionDenominations(row.id).map((denomination) => `${label(denomination.denomination_cents)} × ${denomination.quantity} = ${money(denomination.subtotal_cents)}`).join(" · ") || "No count saved"}</p><h3>Custody receipts</h3>{sessionReceipts(row.id).map((receipt) => <p key={receipt.id}>{receipt.receipt_type.replaceAll("_", " ")} · {receipt.acknowledged_by} · {new Date(receipt.acknowledged_at).toLocaleString()} · variance {money(receipt.variance_cents)}</p>)}</div>}</article>)}</section>}

    {tab === "help" && <section className="cash-help">
      <h2>Cash reconciliation: complete beginner guide</h2>
      <h3>What AAIQ does automatically</h3><ol><li>At the configured local close time, AAIQ runs the prior business date.</li><li>It loads parsed PMS-export or scheduled-email cash rows, required property shifts, employee sealed drops, and independent manager recounts.</li><li>It calculates each shift and the day using deterministic math, then re-queries every source through a separate verification function.</li><li>It creates a reporting-engine task for missing sources, missing drops, missing manager recounts, shortages, or overages.</li><li>After the review window, an over-threshold difference is routed to a named manager through the existing in-app/SMS outbox and audit trail.</li></ol>
      <h3>What a manager must do when no live PMS connector exists</h3><ol><li>Schedule the OPERA/PMS cash report to email, or export it.</li><li>Open Daily reconciliation and paste the CSV rows. Required columns are shift and cash amount; the selected business date can apply to all rows.</li><li>Select Import, reconcile, and verify. AAIQ handles parsing, deduplication, hashing, calculation, task creation, and independent verification.</li><li>Review only the exception shifts AAIQ identifies.</li></ol>
      <h3>What each status means</h3><dl><div><dt>Source unavailable</dt><dd>AAIQ cannot prove the full expected amount. It never guesses.</dd></div><div><dt>Pending review</dt><dd>Source exists, but at least one physical drop or manager recount is missing.</dd></div><div><dt>Reconciled clean</dt><dd>All required evidence exists and expected equals manager-verified physical cash.</dd></div><div><dt>Reconciled with variance</dt><dd>All required evidence exists, but cash is short or over. The task stays open.</dd></div></dl>
      <h3>Security and control boundaries</h3><p>Employees can count and submit only their own open drop. A separate authorized manager recounts it. No user-selectable Ready state exists. AAIQ never posts the GL, makes a deposit, processes a payment/refund, exposes check images publicly, or claims a live PMS connection without a certified connector and credentials.</p>
      <h3>Troubleshooting</h3><ul><li><b>Cannot compute:</b> confirm every required shift has at least one parsed source row.</li><li><b>Missing drop:</b> open Cashier shift drop for that date/shift, count denominations, seal, and submit.</li><li><b>Missing manager verification:</b> a different manager opens Manager verification and recounts the seal.</li><li><b>Duplicate import:</b> the same content hash is safely reused; AAIQ does not create duplicate transactions.</li><li><b>Live PMS blocked:</b> use PMS export/email until Governed Integrations certifies the live connector.</li></ul>
    </section>}
  </main>;
}
