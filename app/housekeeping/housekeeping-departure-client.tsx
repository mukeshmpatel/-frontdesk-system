"use client";
import { useEffect, useMemo, useState } from "react";

type Row = Record<string, any>;
type Center = {
  property: { id: string; code: string; name: string; timezone: string };
  businessDate: string;
  roleMode: "SUPERVISOR" | "HOUSEKEEPER";
  latestBatch: Row | null;
  sourceCapability: { pmsApi: string; emailAttachment: string; manualUpload: string };
  assignments: Row[];
  requiredEvidence: Array<{ area: string; stage: string }>;
  exceptions: Row[];
  roster: Array<{ email: string; displayName: string; openLoad: number; clockedIn: boolean }>;
};

const evidenceLabels: Record<string, string> = {
  "ENTRY:BEFORE": "Entry · before cleaning", "ENTRY:AFTER": "Entry & door · after", "BEDS:AFTER": "Beds & linens",
  "BATHROOM:AFTER": "Bathroom", "VANITY:AFTER": "Vanity & amenities", "FLOOR:AFTER": "Floor & corners",
  "FINAL_WIDE:AFTER": "Final wide room view",
};
const checklistDefinitions = [
  ["ENTRY_DOOR", "Entry door, locks, signage, and first impression"], ["BEDS_LINENS", "Beds, linens, and visible surfaces"],
  ["BATHROOM", "Bathroom fixtures, sanitation, and supplies"], ["VANITY_AMENITIES", "Vanity, amenities, and replenishment"],
  ["FLOOR_CORNERS", "Floor, edges, corners, and under visible furniture"], ["FINAL_ROOM_STANDARD", "Final room-wide brand standard"],
] as const;

export default function HousekeepingDepartureClient({ displayName }: { displayName: string }) {
  const [data, setData] = useState<Center | null>(null), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("ACTIVE"), [review, setReview] = useState<Row | null>(null), [trace, setTrace] = useState<Row | null>(null);
  const [assignmentChoices, setAssignmentChoices] = useState<Record<string, string>>({});
  const [checks, setChecks] = useState<Record<string, { passed: boolean; note: string }>>(() => Object.fromEntries(checklistDefinitions.map(([key]) => [key, { passed: true, note: "" }])));
  async function load() {
    const response = await fetch("/api/housekeeping/assignments/today", { cache: "no-store" });
    const body = await response.json() as Center & { error?: string };
    if (!response.ok) { setError(body.error || "Housekeeping queue could not be loaded."); return; }
    setData(body); setError("");
  }
  useEffect(() => { void load(); }, []);
  async function ingest(file?: File) {
    if (!file) return;
    setNotice("Reading source rows, checking duplicates, and assigning eligible staff…"); setError("");
    const form = new FormData(); form.set("file", file); form.set("sourceType", "MANUAL_UPLOAD"); form.set("businessDate", data?.businessDate || "");
    const response = await fetch("/api/housekeeping/departures/ingest", { method: "POST", body: form });
    const body = await response.json() as { error?: string; created?: number; unassigned?: number; skippedOpen?: number; duplicate?: boolean };
    if (!response.ok) { setError(body.error || "Departure report could not be processed."); setNotice(""); return; }
    setNotice(body.duplicate ? "This exact property report was already processed; no duplicate work was created." :
      `${body.created || 0} assignment(s) created; ${body.unassigned || 0} escalated for missing roster; ${body.skippedOpen || 0} existing open room(s) preserved.`);
    await load();
  }
  async function act(assignment: Row, action: string, checklist?: Array<{ key: string; passed: boolean; note: string }>, extra?: Record<string, unknown>) {
    setNotice(`${action.toLowerCase().replaceAll("_", " ")}…`); setError("");
    const response = await fetch(`/api/housekeeping/assignments/${assignment.id}/verify`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, checklist, ...extra, confidence: action === "INSPECT" ? 1 : undefined,
        notes: action === "INSPECT" ? `Supervisor inspection completed by ${displayName}.` : "Housekeeper checklist submitted." }) });
    const body = await response.json() as { error?: string; status?: string; handoffs?: Row[] };
    if (!response.ok) { setError(body.error || "Assignment action failed."); setNotice(""); return; }
    setNotice(body.status === "VERIFIED" ? "Room verified from required evidence and supervisor checklist." :
      body.status === "MAINTENANCE_HOLD" ? `${body.handoffs?.length || 0} real maintenance ticket(s) created and linked.` : `Assignment moved to ${body.status?.replaceAll("_", " ")}.`);
    setReview(null); await load();
  }
  async function upload(assignment: Row, area: string, stage: string, file?: File) {
    if (!file) return;
    setNotice(`Saving private ${evidenceLabels[`${area}:${stage}`] || area} evidence…`); setError("");
    const form = new FormData(); form.set("file", file); form.set("area", area); form.set("stage", stage);
    const response = await fetch(`/api/housekeeping/assignments/${assignment.id}/evidence`, { method: "POST", body: form });
    const body = await response.json() as { error?: string; duplicate?: boolean };
    if (!response.ok) { setError(body.error || "Evidence upload failed."); setNotice(""); return; }
    setNotice(body.duplicate ? "That exact image is already attached; no duplicate was stored." : "Evidence stored privately. Visual approval remains with the supervisor until a governed vision provider is connected.");
    await load();
  }
  async function openTrace(id: string) {
    const response = await fetch(`/api/housekeeping/assignments/${id}/handoff-trace`, { cache: "no-store" });
    const body = await response.json() as Row;
    if (!response.ok) { setError(body.error || "Trace could not be loaded."); return; }
    setTrace(body);
  }
  const counts = useMemo(() => ({
    active: data?.assignments.filter(row => !["VERIFIED", "CANCELLED"].includes(row.assignment_status)).length || 0,
    unassigned: data?.assignments.filter(row => row.assignment_status === "UNASSIGNED").length || 0,
    review: data?.assignments.filter(row => row.assignment_status === "SUPERVISOR_REVIEW").length || 0,
    holds: data?.assignments.filter(row => row.assignment_status === "MAINTENANCE_HOLD").length || 0,
    verified: data?.assignments.filter(row => row.assignment_status === "VERIFIED").length || 0,
  }), [data]);
  const visible = useMemo(() => data?.assignments.filter(row => filter === "ALL" || filter === "ACTIVE" && !["VERIFIED", "CANCELLED"].includes(row.assignment_status)
    || filter === "EXCEPTIONS" && ["UNASSIGNED", "REWORK_REQUIRED", "MAINTENANCE_HOLD"].includes(row.assignment_status)
    || filter === "REVIEW" && row.assignment_status === "SUPERVISOR_REVIEW" || filter === "VERIFIED" && row.assignment_status === "VERIFIED") || [], [data, filter]);
  if (!data && !error) return <main className="hk-shell"><div className="hk-loading">Loading the property-scoped Housekeeping queue…</div></main>;
  return <main className="hk-shell">
    <section className="hk-hero"><div><small>AAIQ DIGITAL HOUSEKEEPING SUPERVISOR</small><h1>Departure rooms, assigned and verified</h1><p>AAIQ turns factual departure rows into explainable staff assignments, watches exceptions, requires private before/after evidence, and creates a real Maintenance ticket when inspection fails.</p></div><aside><b>{data?.property.code}</b><span>{data?.property.name}</span><small>{data?.businessDate} · {data?.roleMode === "SUPERVISOR" ? "Supervisor view" : "My rooms"}</small></aside></section>
    <section className="hk-boundary"><b>AAIQ acts</b><span>ingest · deduplicate · prioritize · balance workload · create queues · monitor · escalate · preserve trace</span><b>People act</b><span>clean rooms · inspect physical condition · perform repairs · approve ambiguous evidence</span></section>
    {data?.roleMode === "SUPERVISOR" && <section className="hk-source"><div><small>STEP 1 · VERIFIED SOURCE INTAKE</small><h2>Load today’s departures</h2><p>PMS API is not connected. Uploading a CSV/TXT works now. Email attachments work only when the connected email intake delivers the file; no connection is implied here.</p><div><span className="blocked">PMS API · not connected</span><span className="conditional">Email attachment · connector required</span><span className="ready">Manual report · available</span></div></div><label>Choose departure report<input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={event => void ingest(event.target.files?.[0])}/></label>{data.latestBatch && <aside><b>Latest factual source</b><span>{data.latestBatch.source_type} · {data.latestBatch.source_reference}</span><small>{data.latestBatch.accepted_row_count} accepted · {data.latestBatch.exception_count} exception(s) · {data.latestBatch.status}</small></aside>}</section>}
    {(notice || error) && <div className={`hk-message ${error ? "error" : "success"}`}><span>{error || notice}</span><button onClick={() => { setError(""); setNotice(""); }}>×</button></div>}
    <section className="hk-kpis">
      <button className={filter === "ACTIVE" ? "active" : ""} onClick={() => setFilter("ACTIVE")}><strong>{counts.active}</strong><span>Active rooms</span></button>
      <button className={filter === "EXCEPTIONS" ? "active danger" : ""} onClick={() => setFilter("EXCEPTIONS")}><strong>{counts.unassigned}</strong><span>Unassigned</span></button>
      <button className={filter === "REVIEW" ? "active" : ""} onClick={() => setFilter("REVIEW")}><strong>{counts.review}</strong><span>Supervisor review</span></button>
      <button className={filter === "EXCEPTIONS" ? "active" : ""} onClick={() => setFilter("EXCEPTIONS")}><strong>{counts.holds}</strong><span>Maintenance holds</span></button>
      <button className={filter === "VERIFIED" ? "active" : ""} onClick={() => setFilter("VERIFIED")}><strong>{counts.verified}</strong><span>Verified today</span></button>
    </section>
    <nav className="hk-filters">{[["ACTIVE", "Active work"], ["EXCEPTIONS", "Exceptions"], ["REVIEW", "Review queue"], ["VERIFIED", "Verified"], ["ALL", "All today"]].map(([key, label]) => <button key={key} className={filter === key ? "active" : ""} onClick={() => setFilter(key)}>{label}</button>)}</nav>
    <section className="hk-queue">{visible.length ? visible.map(assignment => {
      const reason = JSON.parse(assignment.decision_reason_json || "{}");
      const evidenceKey = (area: string, stage: string) => assignment.evidence?.find((item: Row) => item.evidence_area === area && item.evidence_stage === stage);
      const completeEvidence = data.requiredEvidence.every(required => evidenceKey(required.area, required.stage));
      return <article key={assignment.id} className={`hk-room priority-${String(assignment.priority).toLowerCase()}`}><header><div><small>{assignment.priority} · score {assignment.priority_score}</small><h2>Room {assignment.room_number}</h2><p>{assignment.departure_status.replaceAll("_", " ")} · due {new Date(assignment.due_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p></div><span>{assignment.assignment_status.replaceAll("_", " ")}</span></header>
        <div className="hk-assignment"><div><small>Assigned to</small><b>{assignment.assigned_to_email || "No eligible employee"}</b><span>{assignment.roster_source.replaceAll("_", " ").toLowerCase()}</span></div><div><small>Why this priority</small><b>{reason.facts?.length ? reason.facts.join(" · ") : "standard room"}</b><span>{assignment.decision_policy_version}</span></div></div>
        {assignment.assignment_status === "UNASSIGNED" && <div className="hk-alert"><b>Supervisor action required</b><span>No employee was invented or silently selected. Choose an active Housekeeping employee below.</span></div>}
        {data.roleMode === "SUPERVISOR" && !["VERIFIED", "CANCELLED", "MAINTENANCE_HOLD"].includes(assignment.assignment_status) && <div className="hk-reassign"><label><span>{assignment.assigned_to_email ? "Reassign room" : "Assign room"}</span><select value={assignmentChoices[assignment.id] ?? assignment.assigned_to_email ?? ""} onChange={event => setAssignmentChoices(previous => ({ ...previous, [assignment.id]: event.target.value }))}><option value="">Choose eligible employee</option>{data.roster.map(employee => <option key={employee.email} value={employee.email}>{employee.displayName} · {employee.clockedIn ? "clocked in" : "property roster"} · {employee.openLoad} open</option>)}</select></label><button disabled={!assignmentChoices[assignment.id] || assignmentChoices[assignment.id] === assignment.assigned_to_email} onClick={() => void act(assignment, "REASSIGN", undefined, { assignedToEmail: assignmentChoices[assignment.id] })}>{assignment.assigned_to_email ? "Save reassignment" : "Assign now"}</button></div>}
        <div className="hk-evidence"><header><div><small>REQUIRED EVIDENCE</small><b>{data.requiredEvidence.filter(required => evidenceKey(required.area, required.stage)).length}/{data.requiredEvidence.length} views stored</b></div><span>{completeEvidence ? "Coverage complete · review pending" : "Cannot verify yet"}</span></header><div>{data.requiredEvidence.map(required => { const evidence = evidenceKey(required.area, required.stage); return <label key={`${required.area}:${required.stage}`} className={evidence ? "present" : "missing"}><b>{evidence ? "✓" : "+"} {evidenceLabels[`${required.area}:${required.stage}`]}</b><small>{evidence ? String(evidence.review_status).replaceAll("_", " ") : "Private image required"}</small><input type="file" accept="image/*" capture="environment" onChange={event => void upload(assignment, required.area, required.stage, event.target.files?.[0])}/></label>; })}</div></div>
        {assignment.handoffs?.length > 0 && <div className="hk-handoffs"><b>Linked Maintenance work</b>{assignment.handoffs.map((handoff: Row) => <a key={handoff.id} href={`/maintenance?workOrder=${handoff.maintenance_work_order_id}`}>{handoff.defect_summary}<span>{handoff.maintenance_status} · {handoff.maintenance_assignee}</span></a>)}</div>}
        <footer><div>{assignment.assignment_status === "ASSIGNED" && <button onClick={() => void act(assignment, "ACCEPT")}>Accept room</button>}{["ASSIGNED", "ACCEPTED"].includes(assignment.assignment_status) && <button onClick={() => void act(assignment, "START")}>Start cleaning</button>}{["IN_PROGRESS", "REWORK_REQUIRED"].includes(assignment.assignment_status) && <button disabled={!completeEvidence} onClick={() => setReview({ ...assignment, action: "SUBMIT" })}>Submit checklist</button>}{data.roleMode === "SUPERVISOR" && assignment.assignment_status === "SUPERVISOR_REVIEW" && <button onClick={() => setReview({ ...assignment, action: "INSPECT" })}>Inspect & decide</button>}</div><button className="trace" onClick={() => void openTrace(assignment.id)}>Open full trace →</button></footer>
      </article>;
    }) : <div className="hk-empty"><h2>No rooms in this view</h2><p>{data?.latestBatch ? "The current filter has no matching assignments." : "A supervisor can load a factual departure report above. AAIQ will not invent rooms."}</p></div>}</section>
    {review && <div className="hk-modal" role="dialog" aria-modal="true"><form onSubmit={event => { event.preventDefault(); void act(review, review.action, checklistDefinitions.map(([key]) => ({ key, ...checks[key] }))); }}><button type="button" className="close" onClick={() => setReview(null)}>×</button><small>{review.action === "INSPECT" ? "SUPERVISOR BRAND-STANDARD REVIEW" : "HOUSEKEEPER SELF-CHECK"}</small><h2>Room {review.room_number} checklist</h2><p>Mark every item truthfully. Any failed item creates a linked Maintenance ticket; it does not disappear into a note.</p>{checklistDefinitions.map(([key, label]) => <div className="check-row" key={key}><label><input type="checkbox" checked={checks[key].passed} onChange={event => setChecks(previous => ({ ...previous, [key]: { ...previous[key], passed: event.target.checked } }))}/><span>{label}</span><b>{checks[key].passed ? "Pass" : "Needs Maintenance"}</b></label>{!checks[key].passed && <input value={checks[key].note} required placeholder="Describe the factual defect" onChange={event => setChecks(previous => ({ ...previous, [key]: { ...previous[key], note: event.target.value } }))}/>}</div>)}<button className="submit">{review.action === "INSPECT" ? "Record inspection decision" : "Submit for supervisor review"}</button></form></div>}
    {trace && <div className="hk-modal trace-modal" role="dialog" aria-modal="true"><section><button className="close" onClick={() => setTrace(null)}>×</button><small>END-TO-END AUDIT TRACE</small><h2>Room {trace.departure?.room_number}</h2><ol><li><b>Source batch</b><span>{trace.batch?.source_type} · {trace.batch?.source_reference}</span></li><li><b>Departure</b><span>{trace.departure?.departure_status} · row {trace.departure?.source_row_number}</span></li><li><b>Assignment decision</b><span>{trace.assignment?.assigned_to_email || "Unassigned"} · {trace.decision?.facts?.join(" · ")}</span></li><li><b>Evidence & inspections</b><span>{trace.evidence?.length || 0} evidence record(s) · {trace.inspections?.length || 0} inspection(s)</span></li><li><b>Maintenance handoff</b><span>{trace.handoffs?.length || 0} linked ticket(s)</span></li><li><b>Immutable audit</b><span>{trace.auditTimeline?.length || 0} correlated event(s)</span></li></ol>{trace.handoffs?.map((handoff: Row) => <a key={handoff.id} href={`/maintenance?workOrder=${handoff.maintenance_work_order_id}`}>Open {handoff.maintenance_title} →</a>)}</section></div>}
  </main>;
}
