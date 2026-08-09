"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Roster = { email: string; displayName: string; roleLabel: string; clockedIn: boolean; openLoad: number };
type Evidence = { evidence_area: string; evidence_stage: string; review_status: string; file_name: string };
type CaseRow = Record<string, any> & { id: string; summary: string; state: string; priority: string; evidence: Evidence[] };
type Center = { roleMode: "SUPERVISOR" | "TECHNICIAN"; property: Record<string, any>; roster: Roster[]; cases: CaseRow[];
  assets: Record<string, any>[]; inventory: Record<string, any>[]; requiredEvidence: { area: string; stage: string; label: string }[];
  policyVersion: string; adoptedLegacyOrders: number; limitations: Record<string, boolean> };

const OPEN_STATES = new Set(["UNASSIGNED","ASSIGNED","ACKNOWLEDGED","DIAGNOSING","AWAITING_PART","REPAIRING","TESTING","AWAITING_VERIFICATION","REWORK_REQUIRED","SAFETY_HOLD"]);
const HAZARDS = ["NONE","WATER_LEAK","LOCK_SECURITY","FIRE_SMOKE_GAS","ELECTRICAL_SHOCK","ACTIVE_FLOOD","STRUCTURAL","MEDICAL_SECURITY","OTHER"];

async function readJson(response: Response) {
  const body = await response.json() as Record<string, any>;
  if (!response.ok) throw new Error(String(body.error || "The Maintenance request failed."));
  return body;
}

function dueLabel(value?: string) {
  if (!value) return "No target";
  const milliseconds = new Date(value).getTime() - Date.now();
  if (milliseconds <= 0) return "Target breached";
  const minutes = Math.ceil(milliseconds / 60_000);
  return minutes < 60 ? `${minutes} min remaining` : `${Math.ceil(minutes / 60)} hr remaining`;
}

export default function MaintenanceRepairClient({ displayName }: { displayName: string }) {
  const [data, setData] = useState<Center | null>(null), [filter, setFilter] = useState("OPEN"), [busy, setBusy] = useState(""),
    [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null), [intakeOpen, setIntakeOpen] = useState(false),
    [trace, setTrace] = useState<Record<string, any> | null>(null), [briefing, setBriefing] = useState<Record<string, any> | null>(null);

  const load = useCallback(async () => {
    try { setData(await readJson(await fetch("/api/maintenance/cases", { cache: "no-store" })) as Center); }
    catch (error) { setMessage({ kind: "error", text: error instanceof Error ? error.message : "Maintenance center could not load." }); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const cases = useMemo(() => (data?.cases || []).filter(item => filter === "ALL" ? true : filter === "OPEN" ? OPEN_STATES.has(item.state) :
    filter === "URGENT" ? ["CRITICAL","HIGH"].includes(item.priority) && OPEN_STATES.has(item.state) :
    filter === "SAFETY" ? item.state === "SAFETY_HOLD" : filter === "VERIFY" ? item.state === "AWAITING_VERIFICATION" :
    filter === "WAITING" ? item.state === "AWAITING_PART" || item.state === "UNASSIGNED" : item.state === "RETURNED_TO_SERVICE"), [data, filter]);

  async function mutate(id: string, payload: Record<string, unknown>) {
    setBusy(`${id}:${String(payload.action)}`); setMessage(null);
    try {
      await readJson(await fetch(`/api/maintenance/cases/${id}/action`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }));
      setMessage({ kind: "success", text: "Maintenance record updated with property-scoped audit evidence." }); await load();
    } catch (error) { setMessage({ kind: "error", text: error instanceof Error ? error.message : "Maintenance action failed." }); }
    finally { setBusy(""); }
  }

  async function upload(item: CaseRow, required: Center["requiredEvidence"][number], file?: File) {
    if (!file) return; setBusy(`${item.id}:evidence`); setMessage(null);
    try {
      const form = new FormData(); form.set("file", file); form.set("area", required.area); form.set("stage", required.stage);
      await readJson(await fetch(`/api/maintenance/cases/${item.id}/evidence`, { method: "POST", body: form }));
      setMessage({ kind: "success", text: `${required.label} evidence stored privately. Visual quality remains pending human/provider review.` }); await load();
    } catch (error) { setMessage({ kind: "error", text: error instanceof Error ? error.message : "Evidence upload failed." }); }
    finally { setBusy(""); }
  }

  async function openTrace(id: string) {
    setBusy(`${id}:trace`);
    try { setTrace(await readJson(await fetch(`/api/maintenance/cases/${id}/trace`, { cache: "no-store" }))); }
    catch (error) { setMessage({ kind: "error", text: error instanceof Error ? error.message : "Trace could not load." }); }
    finally { setBusy(""); }
  }

  async function runBriefing() {
    setBusy("briefing"); setMessage(null);
    try {
      const result = await readJson(await fetch("/api/v1/agent-studio", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "RUN_MAINTENANCE_BRIEFING", intent: "Prepare a source-cited maintenance queue briefing. Prioritize safety holds, SLA breaches, unassigned work, parts waits, and verification work. Do not claim a repair happened." }) }));
      setBriefing(result);
    } catch (error) { setMessage({ kind: "error", text: error instanceof Error ? error.message : "The read-only briefing agent is not available for this role." }); }
    finally { setBusy(""); }
  }

  if (!data) return <main className="mt-shell"><div className="mt-loading"><b>Loading the source-backed Maintenance queue…</b><p>Checking property scope, assignments, safety holds, parts, evidence, and return-to-service records.</p></div></main>;
  const counts = { OPEN: data.cases.filter(item => OPEN_STATES.has(item.state)).length,
    URGENT: data.cases.filter(item => ["CRITICAL","HIGH"].includes(item.priority) && OPEN_STATES.has(item.state)).length,
    SAFETY: data.cases.filter(item => item.state === "SAFETY_HOLD").length,
    WAITING: data.cases.filter(item => item.state === "AWAITING_PART" || item.state === "UNASSIGNED").length,
    VERIFY: data.cases.filter(item => item.state === "AWAITING_VERIFICATION").length,
    CLOSED: data.cases.filter(item => item.state === "RETURNED_TO_SERVICE").length };

  return <main className="mt-shell">
    <section className="mt-hero"><div><small>AAIQ DIGITAL MAINTENANCE · DEFECT-TO-REPAIR CONTROL</small><h1>Fix the right problem, prove the result.</h1>
      <p>AAIQ classifies risk from recorded facts, assigns only eligible property technicians, watches response targets, preserves parts and evidence, and blocks return to service until an independent human verifies the work.</p></div>
      <aside><small>ACTIVE PROPERTY</small><b>{data.property.name}</b><span>{data.roleMode.toLowerCase()} workspace · {displayName}</span><small>{data.policyVersion}</small></aside></section>
    <section className="mt-boundary"><b>AUTONOMOUS</b><span>Intake, risk tier, eligible assignment, queue monitoring, reminders, reporting</span>
      <b>HUMAN-GATED</b><span>Physical repair, life-safety clearance, purchases/vendor commitments, visual judgment, return to service</span></section>
    <section className="mt-controls"><div><small>LIVE CONTROL</small><h2>Maintenance command queue</h2><p>{data.roster.length} eligible property technician(s) · {data.adoptedLegacyOrders} legacy order(s) safely adopted this load</p></div>
      <button onClick={() => setIntakeOpen(true)}>+ Report a defect</button><button className="secondary" onClick={runBriefing} disabled={busy === "briefing"}>Prepare source-cited briefing</button></section>
    {message && <div className={`mt-message ${message.kind}`}>{message.text}<button onClick={() => setMessage(null)}>×</button></div>}
    <section className="mt-kpis">
      {Object.entries(counts).map(([key, value]) => <button key={key} className={filter === key ? "active" : ""} onClick={() => setFilter(key)}><strong>{value}</strong><span>{key === "VERIFY" ? "AWAITING VERIFICATION" : key}</span></button>)}
      <button className={filter === "ALL" ? "active" : ""} onClick={() => setFilter("ALL")}><strong>{data.cases.length}</strong><span>ALL CASES</span></button>
    </section>
    {briefing && <Briefing result={briefing} close={() => setBriefing(null)}/>} 
    <section className="mt-queue">{cases.length ? cases.map(item => <MaintenanceCard key={item.id} item={item} data={data} busy={busy}
      mutate={mutate} upload={upload} openTrace={openTrace}/>) : <div className="mt-empty"><h2>No cases in this view</h2><p>The filter is working; no source record currently matches it.</p></div>}</section>
    {intakeOpen && <IntakeModal data={data} close={() => setIntakeOpen(false)} saved={async () => { setIntakeOpen(false); await load(); }}/>} 
    {trace && <TraceModal trace={trace} close={() => setTrace(null)}/>} 
  </main>;
}

function IntakeModal({ data, close, saved }: { data: Center; close: () => void; saved: () => Promise<void> }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); const form = new FormData(event.currentTarget);
    try {
      await readJson(await fetch("/api/maintenance/cases", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        summary: form.get("summary"), description: form.get("description"), sourceType: form.get("sourceType"), sourceReference: form.get("sourceReference"),
        roomNumber: form.get("roomNumber"), assetId: form.get("assetId"), hazardType: form.get("hazardType"),
        guestImpact: form.get("guestImpact") === "on", roomOutage: form.get("roomOutage") === "on", activeLeak: form.get("activeLeak") === "on" }) }));
      await saved();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Defect intake failed."); }
    finally { setBusy(false); }
  }
  return <div className="mt-modal"><form onSubmit={submit}><button type="button" className="close" onClick={close}>×</button><small>VERIFIED INTAKE</small><h2>Report a Maintenance defect</h2>
    <p>Enter facts only. AAIQ calculates priority and target time; users cannot make routine work look urgent or hide a safety hazard.</p>
    {error && <div className="form-error">{error}</div>}<label>Short factual summary<input name="summary" required maxLength={160}/></label>
    <label>What was observed<textarea name="description" required rows={4} maxLength={3000}/></label><div className="form-grid">
      <label>Source<select name="sourceType"><option>MANUAL</option><option>HOUSEKEEPING</option><option>FRONT_DESK</option><option>GUEST</option><option>PMS_REPORT</option><option>EMAIL_ATTACHMENT</option><option>IOT_ALERT</option><option>COMPLIANCE</option></select></label>
      <label>Source reference<input name="sourceReference" defaultValue="direct-entry"/></label><label>Room / area<input name="roomNumber"/></label>
      <label>Asset<select name="assetId"><option value="">No registered asset selected</option>{data.assets.map(asset => <option key={asset.id} value={asset.id}>{asset.code} · {asset.name}</option>)}</select></label>
      <label>Hazard or risk<select name="hazardType">{HAZARDS.map(item => <option key={item}>{item.replaceAll("_", " ")}</option>)}</select></label></div>
    <div className="checks"><label><input type="checkbox" name="guestImpact"/> Guest currently affected</label><label><input type="checkbox" name="roomOutage"/> Room/equipment unavailable</label><label><input type="checkbox" name="activeLeak"/> Active leak/damage</label></div>
    <button className="submit" disabled={busy}>{busy ? "Classifying and assigning…" : "Create, classify & assign"}</button></form></div>;
}

function MaintenanceCard({ item, data, busy, mutate, upload, openTrace }: { item: CaseRow; data: Center; busy: string;
  mutate: (id: string, payload: Record<string, unknown>) => Promise<void>;
  upload: (item: CaseRow, required: Center["requiredEvidence"][number], file?: File) => Promise<void>;
  openTrace: (id: string) => Promise<void> }) {
  const [showWork, setShowWork] = useState(false), present = new Set((item.evidence || []).map(row => `${row.evidence_area}:${row.evidence_stage}`));
  return <article className={`mt-case priority-${String(item.priority).toLowerCase()}`}><header><div><small>{item.priority} · {item.state.replaceAll("_", " ")}</small><h2>{item.summary}</h2>
    <p>{item.room_number ? `Room/area ${item.room_number} · ` : ""}{item.asset_name || "No registered asset"}</p></div><span>{dueLabel(item.due_at)}</span></header>
    <div className="mt-reason"><b>Why AAIQ classified it this way</b><span>{item.classification_reason}</span></div>
    <div className="mt-assignment"><div><small>ASSIGNED TO</small><b>{item.assigned_to_email || "Unassigned"}</b><span>{item.assignment_reason}</span></div>
      <div><small>ASSET / WARRANTY</small><b>{item.asset_code || "No asset link"}</b><span>{item.warranty_expires_at ? `Warranty through ${new Date(item.warranty_expires_at).toLocaleDateString()}` : item.warranty_disposition || "Unknown"}</span></div></div>
    {item.state === "SAFETY_HOLD" && <div className="mt-safety"><b>SAFETY HOLD</b><span>AAIQ has stopped repair progression. A qualified human must control the scene and document clearance.</span></div>}
    {data.roleMode === "SUPERVISOR" && <div className="mt-reassign"><select defaultValue={item.assigned_to_email || ""} id={`assign-${item.id}`}><option value="">Choose eligible technician</option>{data.roster.map(person => <option key={person.email} value={person.email}>{person.displayName} · {person.clockedIn ? "clocked in" : "not clocked in"} · {person.openLoad} open</option>)}</select>
      <button disabled={busy.startsWith(item.id)} onClick={() => mutate(item.id, { action: "REASSIGN", assignedToEmail: (document.getElementById(`assign-${item.id}`) as HTMLSelectElement).value })}>Assign</button></div>}
    <section className="mt-evidence"><header><div><small>PRIVATE EVIDENCE GATE</small><b>{present.size}/{data.requiredEvidence.length} required views</b></div><span>Upload integrity ≠ visual approval</span></header><div>{data.requiredEvidence.map(required => {
      const exists = present.has(`${required.area}:${required.stage}`); return <label key={`${required.area}:${required.stage}`} className={exists ? "present" : "missing"}><b>{exists ? "✓ " : "+ "}{required.label}</b><small>{exists ? "Stored; review status is preserved" : `${required.stage.toLowerCase()} image required`}</small><input type="file" accept="image/*" disabled={busy.startsWith(item.id)} onChange={event => void upload(item, required, event.target.files?.[0])}/></label>; })}</div></section>
    {showWork && <WorkPanel item={item} data={data} mutate={mutate} close={() => setShowWork(false)}/>} 
    <footer><div>{item.state === "ASSIGNED" && <button onClick={() => mutate(item.id, { action: "ACKNOWLEDGE" })}>Acknowledge</button>}
      {item.state === "ACKNOWLEDGED" && <button onClick={() => mutate(item.id, { action: "START_DIAGNOSIS" })}>Start diagnosis</button>}
      {["DIAGNOSING","REPAIRING","TESTING","AWAITING_PART","AWAITING_VERIFICATION","SAFETY_HOLD","REWORK_REQUIRED"].includes(item.state) && <button onClick={() => setShowWork(value => !value)}>{showWork ? "Close work panel" : "Continue required work"}</button>}</div>
      <button className="trace" disabled={busy.startsWith(item.id)} onClick={() => openTrace(item.id)}>Open full trace</button></footer></article>;
}

function WorkPanel({ item, data, mutate, close }: { item: CaseRow; data: Center; mutate: (id: string, payload: Record<string, unknown>) => Promise<void>; close: () => void }) {
  async function formAction(event: FormEvent<HTMLFormElement>, action: string, extra: Record<string, unknown> = {}) {
    event.preventDefault(); const form = new FormData(event.currentTarget); await mutate(item.id, { action, ...Object.fromEntries(form.entries()), ...extra }); close();
  }
  if (item.state === "DIAGNOSING") return <form className="mt-work" onSubmit={event => formAction(event, "SAVE_DIAGNOSIS")}><h3>Record diagnosis</h3><div className="form-grid"><label>Failure code<input name="failureCode" required placeholder="HVAC_NO_COOL"/></label><label>Warranty decision<select name="warrantyDisposition"><option>UNKNOWN</option><option>NOT_APPLICABLE</option><option>CLAIM_RECOMMENDED</option><option>AUTHORIZED_REPAIR</option></select></label></div><label>Factual finding<textarea name="finding" required/></label><label>Probable cause<textarea name="probableCause" required/></label><div><button>Save diagnosis</button><button type="button" onClick={() => mutate(item.id, { action: "START_REPAIR" })}>Start repair after saved diagnosis</button></div></form>;
  if (["REPAIRING","TESTING"].includes(item.state)) return <form className="mt-work" onSubmit={event => formAction(event, "RECORD_ACTION", { actionType: item.state === "TESTING" ? "TEST" : "REPAIR" })}><h3>{item.state === "TESTING" ? "Record a factual test" : "Record physical work completed by a person"}</h3><label>Description<textarea name="description" required/></label><div className="form-grid"><label>Outcome<input name="outcome" required placeholder={item.state === "TESTING" ? "PASS" : "COMPLETED"}/></label><label>Measurement<input type="number" step="any" name="measurementValue"/></label><label>Unit<input name="measurementUnit" placeholder="°F, PSI, volts…"/></label></div><div><button>Save record</button>{item.state === "REPAIRING" && <button type="button" onClick={() => mutate(item.id, { action: "START_TESTING" })}>Start testing after repair record</button>}{item.state === "TESTING" && <button type="button" onClick={() => mutate(item.id, { action: "SUBMIT_VERIFICATION" })}>Submit after passing test + evidence</button>}</div></form>;
  if (item.state === "AWAITING_PART") return <form className="mt-work" onSubmit={event => formAction(event, "RESERVE_PART")}><h3>Resolve parts wait</h3><p>AAIQ may reserve local stock. It will not place an order or commit money.</p><div className="form-grid"><label>Property stock<select name="sku" required><option value="">Choose stock</option>{data.inventory.map(stock => <option key={stock.sku} value={stock.sku}>{stock.name} · {Number(stock.quantity)-Number(stock.committed_quantity||0)} available</option>)}</select></label><label>Quantity<input type="number" min="1" step="1" name="quantity" defaultValue="1" required/></label></div><div><button>Reserve local stock</button><button type="button" onClick={() => mutate(item.id, { action: "RESUME_WITH_PART" })}>Resume with reserved part</button></div></form>;
  if (item.state === "SAFETY_HOLD") return <form className="mt-work safety" onSubmit={event => formAction(event, "CLEAR_SAFETY_HOLD")}><h3>Qualified-human safety clearance</h3><p>This is not an AI override. Record who controlled and cleared the life-safety condition.</p><label>Qualified person<input name="qualifiedPerson" required/></label><label>Clearance evidence / reference<textarea name="note" required/></label><button>Record human clearance</button></form>;
  if (item.state === "AWAITING_VERIFICATION") return data.roleMode !== "SUPERVISOR" ? <div className="mt-work"><h3>Independent verification required</h3><p>A manager who did not perform the repair must verify it.</p></div> : <form className="mt-work" onSubmit={event => formAction(event, "VERIFY_RETURN", { checklist: { repairVerified:true,testVerified:true,areaSafe:true,assetOperational:true,documentationComplete:true } })}><h3>Independent return-to-service review</h3><p>Checking every box is an attestation. Reject or hold when evidence is insufficient.</p><div className="checks">{["Repair matches diagnosis","Passing test is credible","Area is safe","Asset is operational","Documentation is complete"].map(label => <label key={label}><input type="checkbox" required/> {label}</label>)}</div><label>Decision<select name="decision"><option value="APPROVED">Approve return to service</option><option value="REWORK_REQUIRED">Require rework</option><option value="SAFETY_HOLD">Apply safety hold</option></select></label><label>Verifier note<textarea name="note" required/></label><button>Save independent decision</button></form>;
  if (item.state === "REWORK_REQUIRED") return <div className="mt-work"><h3>Rework required</h3><p>Return to diagnosis or repair, preserve the previous failed attempt, then test and submit again.</p><button onClick={() => mutate(item.id, { action: "START_DIAGNOSIS" })}>Restart diagnosis</button></div>;
  return null;
}

function Briefing({ result, close }: { result: Record<string, any>; close: () => void }) {
  const answer = String(result.finalOutput || result.output || result.message || "The briefing completed without displayable content.");
  return <section className="mt-briefing"><button onClick={close}>×</button><small>READ-ONLY DIGITAL MAINTENANCE BRIEFING</small><h2>Source-cited queue guidance</h2><pre>{answer}</pre><p>No work order was changed by this briefing.</p></section>;
}

function TraceModal({ trace, close }: { trace: Record<string, any>; close: () => void }) {
  const combined = [
    ...(trace.events || []).map((row: any) => ({ at: row.created_at, title: row.event_type, detail: row.detail_json })),
    ...(trace.diagnoses || []).map((row: any) => ({ at: row.created_at, title: `Diagnosis · ${row.failure_code}`, detail: row.finding })),
    ...(trace.actions || []).map((row: any) => ({ at: row.created_at, title: `${row.action_type} · ${row.outcome}`, detail: row.description })),
    ...(trace.reviews || []).map((row: any) => ({ at: row.created_at, title: `Return review · ${row.decision}`, detail: row.reviewer_note })),
  ].sort((a,b) => String(a.at).localeCompare(String(b.at)));
  return <div className="mt-modal"><section className="trace-modal"><button className="close" onClick={close}>×</button><small>IMMUTABLE TRACE</small><h2>{trace.case?.summary}</h2><p>Source → triage → assignment → diagnosis → repair → test → evidence → independent decision.</p><ol>{combined.map((row, index) => <li key={`${row.at}-${index}`}><span>{new Date(row.at).toLocaleString()}</span><div><b>{row.title}</b><p>{row.detail}</p></div></li>)}</ol></section></div>;
}
