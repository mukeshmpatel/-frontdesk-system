"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Property = {
  id: string; code: string; name: string; address: string; timezone: string;
  database_mode: string; database_binding: string | null; status: string;
};
type RecordRow = {
  id: string; correlation_id: string; record_type: string; category: string; title: string;
  description: string; room_number: string | null; guest_reference: string | null;
  reservation_reference: string | null; priority: string; status: string;
  assigned_department: string | null; assigned_to: string | null; quantity: number | null;
  fee_cents: number | null; due_at: string | null; source_type: string; source_reference: string | null;
  ai_status: string; ai_confidence: number | null; ai_explanation: string | null;
  created_at: string; updated_at: string; details: Record<string, unknown>;
};
type Payload = {
  role: string; currentUser: { email: string; displayName: string }; property: Property; properties: Property[];
  records: RecordRow[]; history: Array<Record<string, unknown>>; exceptions: Array<Record<string, unknown>>;
  metrics: { open: number; critical: number; incidents: number; pets: number; requests: number; overdue: number; awaitingVerification: number; exceptions: number };
};

const TYPE_LABELS: Record<string, string> = {
  INCIDENT: "Incident", PET: "Pet registry", GUEST_REQUEST: "Guest request",
  HANDOFF: "Pass-on / handoff", LOST_FOUND: "Lost & found", AUDIT_EXCEPTION: "Cash / audit exception",
};
const NEXT: Record<string, string[]> = {
  RECEIVED: ["ACKNOWLEDGED", "IN_PROGRESS", "CANCELLED"],
  ACKNOWLEDGED: ["IN_PROGRESS", "BLOCKED", "CANCELLED"],
  IN_PROGRESS: ["BLOCKED", "AWAITING_VERIFICATION", "COMPLETED"],
  BLOCKED: ["IN_PROGRESS", "CANCELLED"],
  AWAITING_VERIFICATION: ["IN_PROGRESS", "VERIFIED"],
  COMPLETED: ["VERIFIED", "CLOSED", "IN_PROGRESS"],
  VERIFIED: ["CLOSED", "IN_PROGRESS"],
};

function dollars(cents: number | null) {
  return cents == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
function label(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase());
}

export default function EnterpriseFrontDeskCenter() {
  const [data, setData] = useState<Payload | null>(null);
  const [propertyId, setPropertyId] = useState("");
  const [view, setView] = useState("dashboard");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("OPEN");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [selected, setSelected] = useState<RecordRow | null>(null);
  const load = useCallback(async (requested?: string) => {
    const target = requested ?? propertyId;
    const response = await fetch(`/api/operations/front-desk${target ? `?propertyId=${encodeURIComponent(target)}` : ""}`, { cache: "no-store" });
    const payload = await response.json() as Payload & { error?: string };
    if (!response.ok) throw new Error(payload.error ?? "Operations center could not be loaded.");
    setData(payload);
    setPropertyId(payload.property.id);
  }, [propertyId]);
  useEffect(() => { void load().catch(error => setNotice(error instanceof Error ? error.message : "Unable to load.")); }, []);

  const records = useMemo(() => (data?.records ?? []).filter(record => {
    if (typeFilter !== "ALL" && record.record_type !== typeFilter) return false;
    if (statusFilter === "OPEN" && ["CLOSED", "CANCELLED"].includes(record.status)) return false;
    if (statusFilter !== "ALL" && statusFilter !== "OPEN" && record.status !== statusFilter) return false;
    return true;
  }), [data, typeFilter, statusFilter]);
  const reports = useMemo(() => {
    const rows = data?.records ?? [];
    const byType = Object.entries(TYPE_LABELS).map(([id, name]) => ({
      id, name, total: rows.filter(row => row.record_type === id).length,
      open: rows.filter(row => row.record_type === id && !["CLOSED", "CANCELLED"].includes(row.status)).length,
      critical: rows.filter(row => row.record_type === id && row.priority === "CRITICAL").length,
    }));
    return byType;
  }, [data]);

  async function send(body: Record<string, unknown>, method = "POST") {
    setBusy(String(body.id || body.action || "save"));
    try {
      const response = await fetch("/api/operations/front-desk", {
        method, headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      });
      const result = await response.json() as { error?: string; manualAction?: string };
      if (!response.ok) throw new Error(result.error ?? "The operation could not be completed.");
      setNotice(result.manualAction || "Saved, audited, and added to the event stream.");
      setSelected(null);
      await load(String(body.propertyId || propertyId));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to save.");
    } finally { setBusy(""); }
  }
  function exportCsv(rows: RecordRow[]) {
    const columns = ["record_type", "category", "title", "room_number", "priority", "status", "assigned_department", "assigned_to", "quantity", "fee_cents", "due_at", "source_type", "created_at", "correlation_id"];
    const safe = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csv = [columns.join(","), ...rows.map(row => columns.map(column => safe((row as unknown as Record<string, unknown>)[column])).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `AAIQ-front-desk-${propertyId}-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click();
    URL.revokeObjectURL(url);
  }

  if (!data) return <section className="fd-enterprise loading">{notice || "Loading AAIQ Digital Front Desk…"}</section>;
  return <section className="fd-enterprise">
    <header className="fd-context-bar">
      <div><p>Live property context</p><strong>{data.property.name}</strong><span>{data.property.address}</span></div>
      <label>Property
        <select value={propertyId} onChange={event => { setPropertyId(event.target.value); void load(event.target.value); }}>
          {data.properties.map(property => <option key={property.id} value={property.id}>{property.code} · {property.name}</option>)}
        </select>
      </label>
      <div className="fd-context-meta"><span>{data.currentUser.displayName}</span><b>{data.role.toUpperCase()}</b><small>{data.property.database_mode.replaceAll("_", " ")} · {data.property.status}</small></div>
    </header>
    {notice && <div className="fd-notice" role="status"><span>{notice}</span><button onClick={() => setNotice("")}>Dismiss</button></div>}
    <nav className="fd-module-nav">
      {[["dashboard", "Shift dashboard"], ["records", "Operational records"], ["create", "Create record"], ["reports", "Front-desk reports"], ["exceptions", "Automation exceptions"], ["properties", "Property administration"]].map(([id, name]) =>
        <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}>{name}</button>)}
    </nav>

    {view === "dashboard" && <>
      <div className="fd-kpis">
        {[["Open work", data.metrics.open], ["Critical", data.metrics.critical], ["Incidents", data.metrics.incidents],
          ["Pet rooms", data.metrics.pets], ["Guest requests", data.metrics.requests], ["Overdue", data.metrics.overdue],
          ["Awaiting verification", data.metrics.awaitingVerification], ["Automation exceptions", data.metrics.exceptions]]
          .map(([name, value]) => <button key={String(name)} onClick={() => { setTypeFilter(name === "Incidents" ? "INCIDENT" : name === "Pet rooms" ? "PET" : name === "Guest requests" ? "GUEST_REQUEST" : "ALL"); setView("records"); }}><strong>{value}</strong><span>{name}</span><small>Open drill-down →</small></button>)}
      </div>
      <div className="fd-dashboard-grid">
        <article className="fd-panel">
          <header><div><p>Priority command queue</p><h2>Needs action now</h2></div><button onClick={() => setView("create")}>+ Create manually</button></header>
          <div className="fd-queue">{data.records.filter(row => !["CLOSED", "CANCELLED"].includes(row.status)).slice(0, 12).map(row =>
            <button key={row.id} onClick={() => setSelected(row)} className={`priority-${row.priority.toLowerCase()}`}>
              <span><b>{TYPE_LABELS[row.record_type]}</b><small>{row.room_number ? `Room ${row.room_number}` : row.category}</small></span>
              <strong>{row.title}</strong><em>{label(row.status)}</em><time>{row.due_at ? new Date(row.due_at).toLocaleString() : "No due time"}</time>
            </button>)}</div>
        </article>
        <article className="fd-panel">
          <header><div><p>Shift intelligence</p><h2>Automatic attention brief</h2></div><span>Source separated</span></header>
          <div className="fd-brief">
            <div><b>Front desk records</b><strong>{data.metrics.open} open</strong><span>{data.metrics.critical} critical · {data.metrics.overdue} overdue</span></div>
            <div><b>Guest service</b><strong>{data.metrics.requests} requests</strong><span>{data.metrics.pets} active pet records</span></div>
            <div><b>Automation</b><strong>{data.metrics.exceptions} exceptions</strong><span>Manual fallback remains available</span></div>
          </div>
          <p className="fd-ai-note"><b>AAIQ decision boundary:</b> Low-risk routing and reminders may run automatically. Incidents, compensation, financial exceptions, public messages, and permission changes require authorized approval.</p>
        </article>
      </div>
    </>}

    {view === "records" && <article className="fd-panel">
      <header><div><p>Transaction-level operations</p><h2>Incident, pet, request and handoff register</h2></div><button onClick={() => exportCsv(records)}>Export filtered CSV</button></header>
      <div className="fd-filter-row">
        <label>Record type<select value={typeFilter} onChange={event => setTypeFilter(event.target.value)}><option value="ALL">All types</option>{Object.entries(TYPE_LABELS).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <label>Status<select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="OPEN">All open</option><option value="ALL">All history</option>{Object.keys(NEXT).map(status => <option key={status}>{status}</option>)}</select></label>
        <span>{records.length} matching records · every row links to workflow and audit history</span>
      </div>
      <div className="fd-table-wrap"><table><thead><tr><th>Type</th><th>Room / guest</th><th>Record</th><th>Priority</th><th>Status</th><th>Owner</th><th>Due</th><th>Source</th></tr></thead><tbody>
        {records.map(row => <tr key={row.id} onClick={() => setSelected(row)}><td><b>{TYPE_LABELS[row.record_type]}</b><small>{row.category}</small></td><td>{row.room_number ? `Room ${row.room_number}` : "—"}<small>{row.guest_reference || row.reservation_reference || "No guest reference"}</small></td><td><strong>{row.title}</strong><small>{row.description}</small></td><td><span className={`fd-badge ${row.priority.toLowerCase()}`}>{row.priority}</span></td><td>{label(row.status)}</td><td>{row.assigned_to || row.assigned_department || "Unassigned"}</td><td>{row.due_at ? new Date(row.due_at).toLocaleString() : "—"}</td><td>{row.source_type}<small>{row.source_reference || row.correlation_id.slice(0, 8)}</small></td></tr>)}
      </tbody></table></div>
    </article>}

    {view === "create" && <article className="fd-panel fd-create">
      <header><div><p>Validated manual fallback</p><h2>Create a structured front-desk record</h2></div><span>UI → validation → persistence → event → reporting</span></header>
      <form onSubmit={event => {
        event.preventDefault(); const form = new FormData(event.currentTarget);
        void send({ action: "CREATE_OPERATIONAL_RECORD", propertyId, ...Object.fromEntries(form) });
      }}>
        <label>Record type<select name="recordType" required><option value="GUEST_REQUEST">Guest / additional-item request</option><option value="INCIDENT">Incident</option><option value="PET">Pet registry</option><option value="HANDOFF">Pass-on / handoff</option><option value="LOST_FOUND">Lost & found</option><option value="AUDIT_EXCEPTION">Cash / folio / audit exception</option></select></label>
        <label>Category<input name="category" placeholder="Towels, guest injury, disturbance, cash over/short…"/></label>
        <label>Room or location<input name="roomNumber" placeholder="218, lobby, pool, parking lot"/></label>
        <label>Guest reference<input name="guestReference" placeholder="Guest name or privacy-safe reference"/></label>
        <label>Reservation reference<input name="reservationReference" placeholder="Confirmation number"/></label>
        <label>Priority<select name="priority"><option>NORMAL</option><option>HIGH</option><option>CRITICAL</option><option>LOW</option></select></label>
        <label>Assigned department<select name="assignedDepartment"><option>FRONT_DESK</option><option>HOUSEKEEPING</option><option>MAINTENANCE</option><option>SECURITY</option><option>EXECUTIVE</option></select></label>
        <label>Quantity<input name="quantity" type="number" min="1" defaultValue="1"/></label>
        <label>Fee / charge (cents)<input name="feeCents" type="number" min="0" defaultValue="0"/></label>
        <label>Promise / due time<input name="dueAt" type="datetime-local"/></label>
        <label>Source<select name="sourceType"><option>MANUAL</option><option>PMS_REPORT</option><option>PHONE</option><option>EMAIL</option><option>SMS</option><option>IN_PERSON</option></select></label>
        <label>Source reference<input name="sourceReference" placeholder="Message, report or call reference"/></label>
        <label className="wide">Title<input name="title" required placeholder="Clear action or incident title"/></label>
        <label className="wide">Description / chronology<textarea name="description" rows={5} placeholder="What happened, requested outcome, immediate actions and facts. Do not include full payment-card information."/></label>
        <fieldset className="wide"><legend>Optional pet and incident details</legend>
          <label>Animal type<input name="animalType" placeholder="Dog, cat…"/></label><label>Pet count<input name="petCount" type="number" min="0"/></label>
          <label>Fee status<select name="feePostingStatus"><option>NOT_APPLICABLE</option><option>NOT_POSTED</option><option>POSTED</option><option>WAIVED_APPROVED</option></select></label>
          <label>Incident severity<select name="incidentSeverity"><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select></label>
        </fieldset>
        <button disabled={busy === "CREATE_OPERATIONAL_RECORD"}>{busy === "CREATE_OPERATIONAL_RECORD" ? "Saving…" : "Validate, create and audit"}</button>
      </form>
    </article>}

    {view === "reports" && <article className="fd-panel">
      <header><div><p>Dedicated front-desk reporting</p><h2>Operational report catalog</h2></div><button onClick={() => exportCsv(data.records)}>Export all detail</button></header>
      <div className="fd-report-catalog">{reports.map(report => <button key={report.id} onClick={() => { setTypeFilter(report.id); setStatusFilter("ALL"); setView("records"); }}>
        <span>{report.name}</span><strong>{report.total}</strong><small>{report.open} open · {report.critical} critical</small><em>Drill to transactions →</em>
      </button>)}</div>
      <div className="fd-report-guide">
        <b>Required next reporting connections</b>
        <p>Guest-request fulfillment time, item cost, incident recurrence, pet fee realization, cash variance, wake-up completion, room moves, early/late fees, and source response time will populate from these operational records and connected PMS/inventory events. Missing integrations remain clearly labeled rather than replaced with invented values.</p>
      </div>
    </article>}

    {view === "exceptions" && <article className="fd-panel">
      <header><div><p>Never silently drop automation</p><h2>Manual review and retry queue</h2></div><span>{data.exceptions.length} open</span></header>
      {data.exceptions.length ? <div className="fd-exceptions">{data.exceptions.map((item: any) => <article key={item.id}><b>{item.severity}</b><div><strong>{item.title}</strong><p>{item.detail}</p><small>{item.exception_state} · Missing: {(item.missingFields || []).join(", ") || "none listed"}</small></div><button>Open manual fallback</button></article>)}</div> : <div className="fd-empty">No automation failures are waiting for manual completion.</div>}
    </article>}

    {view === "properties" && <article className="fd-panel fd-create">
      <header><div><p>Multi-property administration</p><h2>Property and database isolation</h2></div><span>Administrator only</span></header>
      <div className="fd-property-list">{data.properties.map(property => <article key={property.id}><div><strong>{property.code} · {property.name}</strong><span>{property.address}</span></div><b>{property.database_mode.replaceAll("_", " ")}</b><em>{property.status}</em></article>)}</div>
      <form onSubmit={event => { event.preventDefault(); void send({ action: "CREATE_PROPERTY", ...Object.fromEntries(new FormData(event.currentTarget)) }); }}>
        <label>Property code<input name="code" required placeholder="WG-SALINA"/></label>
        <label>Official property name<input name="name" required/></label>
        <label className="wide">Address<input name="address"/></label>
        <label>Timezone<input name="timezone" defaultValue="America/Chicago"/></label>
        <label>Database isolation<select name="databaseMode"><option value="SHARED_SCHEMA">Shared database with strict property partition</option><option value="DEDICATED_DATABASE">Dedicated property database</option></select></label>
        <label className="wide">Dedicated database binding (optional)<input name="databaseBinding" placeholder="Leave blank to create a manual provisioning exception"/></label>
        <button disabled={data.role !== "admin" || busy === "CREATE_PROPERTY"}>{data.role === "admin" ? "Create property context" : "Administrator access required"}</button>
      </form>
      <p className="fd-ai-note">A dedicated database cannot be silently created by the browser. If a binding is not supplied, AAIQ creates the property in <b>CONFIGURATION REQUIRED</b> state and provides a manual infrastructure step instead of falsely claiming isolation is active.</p>
    </article>}

    {selected && <div className="fd-modal-backdrop" onMouseDown={() => setSelected(null)}><article className="fd-record-modal" onMouseDown={event => event.stopPropagation()}>
      <header><div><p>{TYPE_LABELS[selected.record_type]} · {selected.correlation_id}</p><h2>{selected.title}</h2></div><button onClick={() => setSelected(null)}>×</button></header>
      <dl><div><dt>Status</dt><dd>{label(selected.status)}</dd></div><div><dt>Priority</dt><dd>{selected.priority}</dd></div><div><dt>Room</dt><dd>{selected.room_number || "—"}</dd></div><div><dt>Guest</dt><dd>{selected.guest_reference || "—"}</dd></div><div><dt>Quantity</dt><dd>{selected.quantity || "—"}</dd></div><div><dt>Fee</dt><dd>{dollars(selected.fee_cents)}</dd></div><div><dt>Owner</dt><dd>{selected.assigned_to || selected.assigned_department || "Unassigned"}</dd></div><div><dt>Source</dt><dd>{selected.source_type}</dd></div></dl>
      <section><b>Description and chronology</b><p>{selected.description || "No narrative entered."}</p></section>
      {selected.ai_explanation && <section className="fd-ai-evidence"><b>AI recommendation · {Math.round((selected.ai_confidence || 0) * 100)}% confidence</b><p>{selected.ai_explanation}</p><small>AI status: {selected.ai_status}. A user may correct, reject, or complete manually.</small></section>}
      <footer>{(NEXT[selected.status] || []).map(status => <button key={status} disabled={busy === selected.id || (status === "VERIFIED" && data.role !== "admin")} onClick={() => {
        const needsReason = ["BLOCKED", "CANCELLED"].includes(status);
        const reason = needsReason ? window.prompt("Enter required reason code and explanation:") : "";
        if (needsReason && !reason) return;
        void send({ action: "TRANSITION_OPERATIONAL_RECORD", id: selected.id, status, reasonCode: needsReason ? "MANUAL_REASON" : "", note: reason || `Moved to ${status}.` }, "PATCH");
      }}>{label(status)}</button>)}</footer>
    </article></div>}
  </section>;
}
