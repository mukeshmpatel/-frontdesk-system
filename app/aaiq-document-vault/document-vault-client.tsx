"use client";
import { FormEvent, useMemo, useState } from "react";

type Data = any;
const tabs = ["INBOX", "LIBRARY", "REVIEW", "RETENTION & HOLDS", "AUDIT & JOBS"];

export default function DocumentVaultClient({ initial }: { initial: Data }) {
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState("INBOX");
  const [selectedId, setSelectedId] = useState(initial?.records?.[0]?.id || "");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const selected = useMemo(() => data?.records?.find((row: any) => row.id === selectedId), [data, selectedId]);
  async function reload(query = "") {
    const response = await fetch(`/api/v1/document-vault?q=${encodeURIComponent(query)}`, { cache: "no-store" });
    const next = await response.json(); if (response.ok) setData(next);
  }
  async function action(payload: any) {
    setBusy(true); setNotice("");
    const response = await fetch("/api/v1/document-vault", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json(); setBusy(false);
    setNotice(response.ok ? "Action completed and added to the audit trail." : result.error || "Action failed.");
    if (response.ok) await reload();
  }
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice("");
    const response = await fetch("/api/v1/document-vault", { method: "POST", body: new FormData(event.currentTarget) });
    const result = await response.json(); setBusy(false);
    setNotice(response.ok ? `Original secured. SHA-256: ${result.sha256}` : result.error || "Upload failed.");
    if (response.ok) { event.currentTarget.reset(); setSelectedId(result.id); await reload(); setTab("REVIEW"); }
  }
  return <main className="dv">
      <header className="dv-heading"><div><small>RECORDS LIFECYCLE CENTER</small><h1>AAIQ Intelligent Document Vault</h1><p>One governed system for intake, exact originals, classification, retention, holds, access and evidence.</p></div><b>{data?.role?.toUpperCase()} CONTROL</b></header>
      <section className="dv-trust">
        <div><small>ACTIVE PROPERTY</small><strong>{data?.property?.name}</strong></div>
        <div><small>RECORDS</small><strong>{data?.records?.length || 0}</strong></div>
        <div><small>QUARANTINED</small><strong>{data?.records?.filter((x: any) => x.status.startsWith("QUARANTINED")).length || 0}</strong></div>
        <div><small>LEGAL HOLDS</small><strong>{data?.holds?.filter((x: any) => x.status === "ACTIVE").length || 0}</strong></div>
        <b>ORIGINALS IMMUTABLE</b>
      </section>
      {notice && <div className="dv-notice">{notice}</div>}
      <nav className="dv-tabs">{tabs.map(value => <button key={value} className={tab === value ? "active" : ""} onClick={() => setTab(value)}>{value}</button>)}</nav>

      {tab === "INBOX" && <section className="dv-grid">
        <form className="dv-card" onSubmit={upload}>
          <small>SECURE INTAKE</small><h2>Add an exact original</h2>
          <p>The original is hashed, stored separately, deduplicated, and quarantined until a configured scanner supplies evidence.</p>
          <label>Document title<input name="title" required /></label>
          <div className="dv-two"><label>Type<select name="documentType">{data?.documentTypes?.map((x: string) => <option key={x}>{x}</option>)}</select></label><label>Sensitivity<select name="sensitivity"><option>INTERNAL</option><option>CONFIDENTIAL</option><option>RESTRICTED</option></select></label></div>
          <div className="dv-two"><label>Department<input name="department" /></label><label>Room/reference<input name="roomReference" /></label></div>
          <label>Source record ID<input name="sourceRecordId" placeholder="Reservation, incident, asset or invoice ID" /></label>
          <label className="dv-upload">Choose document<input name="file" type="file" required accept=".pdf,.jpg,.jpeg,.png,.txt,.csv,.docx,.xlsx" /></label>
          <button disabled={busy}>{busy ? "Securing original…" : "Hash, store & quarantine"}</button>
        </form>
        <article className="dv-card">
          <small>PROCESSING CONTRACT</small><h2>No silent automation</h2>
          <ol><li>Validate tenant, property, type and size</li><li>Calculate SHA-256 before indexing</li><li>Reject exact duplicates</li><li>Store immutable original in private object storage</li><li>Quarantine pending malware evidence</li><li>Run OCR/classification only after CLEAN</li><li>Require review before ACTIVE</li><li>Apply retention and legal-hold rules</li></ol>
          <div className="dv-provider">{Object.entries(data?.providers || {}).map(([key, value]: any) => <p key={key}><b>{key.toUpperCase()} · {value.status.replaceAll("_", " ")}</b><span>{value.rule}</span></p>)}</div>
        </article>
      </section>}

      {tab === "LIBRARY" && <section className="dv-library">
        <header><div><small>PROPERTY-SCOPED RECORDS</small><h2>Search and inspect</h2></div><input placeholder="Search title, type or department" onChange={e => void reload(e.target.value)} /></header>
        <div className="dv-records">{data?.records?.map((row: any) => <button key={row.id} className={selectedId === row.id ? "active" : ""} onClick={() => setSelectedId(row.id)}>
          <b>{row.document_type.replaceAll("_", " ")}</b><strong>{row.title}</strong><span>{row.status.replaceAll("_", " ")}</span><small>{row.file_name} · {Math.ceil(Number(row.size_bytes || 0) / 1024)} KB</small>
        </button>)}</div>
        <article className="dv-detail">{selected ? <><small>CHAIN OF CUSTODY</small><h2>{selected.title}</h2>
          <dl><div><dt>Status</dt><dd>{selected.status.replaceAll("_", " ")}</dd></div><div><dt>Scan</dt><dd>{selected.scan_status}</dd></div><div><dt>SHA-256</dt><dd className="hash">{selected.sha256}</dd></div><div><dt>Created</dt><dd>{new Date(selected.created_at).toLocaleString()}</dd></div><div><dt>Retention</dt><dd>{selected.retention_until ? new Date(selected.retention_until).toLocaleDateString() : "Not assigned"}</dd></div><div><dt>Active holds</dt><dd>{selected.legal_hold_count}</dd></div></dl>
          {selected.scan_status === "CLEAN" ? <a className="dv-download" href={`/api/v1/document-vault/${selected.id}?reason=Authorized%20library%20download`}>Download exact original</a> : <p className="dv-blocked">Download blocked while the original is quarantined.</p>}
        </> : <p>Select a record.</p>}</article>
      </section>}

      {tab === "REVIEW" && <section className="dv-review">
        <div className="dv-records">{data?.records?.filter((x: any) => x.status !== "ACTIVE").map((row: any) => <button key={row.id} className={selectedId === row.id ? "active" : ""} onClick={() => setSelectedId(row.id)}><b>{row.status.replaceAll("_", " ")}</b><strong>{row.title}</strong><small>{row.scan_status}</small></button>)}</div>
        <article className="dv-card">{selected ? <><small>CONTROLLED REVIEW</small><h2>{selected.title}</h2>
          {selected.scan_status === "PENDING" && data?.role === "admin" && <><p>Record a result only after verifying an external scanner report. This does not pretend AAIQ scanned the file.</p><label>Scanner evidence reference<input id="scan-ref" placeholder="Provider report or ticket reference" /></label><div className="dv-two"><button onClick={() => void action({ action: "RECORD_SCAN", documentId: selected.id, decision: "CLEAN", providerReference: (document.getElementById("scan-ref") as HTMLInputElement)?.value })}>Record CLEAN evidence</button><button className="danger" onClick={() => void action({ action: "RECORD_SCAN", documentId: selected.id, decision: "INFECTED", providerReference: (document.getElementById("scan-ref") as HTMLInputElement)?.value })}>Record INFECTED</button></div></>}
          {selected.scan_status === "CLEAN" && selected.status !== "ACTIVE" && <><p>OCR is not configured. Complete the structured classification manually without inventing extracted facts.</p><label>Verified title<input id="class-title" defaultValue={selected.title} /></label><label>Document type<select id="class-type" defaultValue={selected.document_type}>{data?.documentTypes?.map((x: string) => <option key={x}>{x}</option>)}</select></label><label>Evidence/reason<textarea id="class-evidence" placeholder="What in the original supports this classification?" /></label><button onClick={() => void action({ action: "REVIEW_CLASSIFICATION", documentId: selected.id, title: (document.getElementById("class-title") as HTMLInputElement)?.value, documentType: (document.getElementById("class-type") as HTMLSelectElement)?.value, evidence: (document.getElementById("class-evidence") as HTMLTextAreaElement)?.value })}>Approve classification</button></>}
        </> : <p>Select a quarantined record.</p>}</article>
      </section>}

      {tab === "RETENTION & HOLDS" && <section className="dv-grid">
        <form className="dv-card" onSubmit={e => { e.preventDefault(); void action({ action: "CREATE_RETENTION_POLICY", ...Object.fromEntries(new FormData(e.currentTarget)) }); }}>
          <small>VERSIONED POLICY</small><h2>Create retention rule</h2>
          <label>Policy code<input name="policyCode" required /></label><label>Name<input name="name" required /></label>
          <div className="dv-two"><label>Document type<select name="documentType">{data?.documentTypes?.map((x: string) => <option key={x}>{x}</option>)}</select></label><label>Retain days<input name="retainDays" type="number" min="1" max="36500" required /></label></div>
          <label>Jurisdiction<input name="jurisdiction" required placeholder="Kansas / Federal / Brand" /></label><input type="hidden" name="triggerEvent" value="DOCUMENT_CREATED" /><button>Create versioned policy</button>
          <h3>Available policies</h3>{data?.policies?.map((p: any) => <button type="button" className="dv-policy" key={p.id} onClick={() => selected && void action({ action: "ASSIGN_RETENTION", documentId: selected.id, policyId: p.id })}><b>{p.name}</b><span>{p.retain_days} days · v{p.version}</span><small>Assign to selected record</small></button>)}
        </form>
        <article className="dv-card"><small>LEGAL HOLD</small><h2>Preservation controls</h2><p>An active hold blocks disposition regardless of retention date. Release requires an audited reason.</p>
          <label>Selected record<select value={selectedId} onChange={e => setSelectedId(e.target.value)}>{data?.records?.map((x: any) => <option key={x.id} value={x.id}>{x.title}</option>)}</select></label>
          <label>Hold name<input id="hold-name" /></label><label>Reason<textarea id="hold-reason" /></label><button onClick={() => void action({ action: "PLACE_HOLD", documentId: selectedId, holdName: (document.getElementById("hold-name") as HTMLInputElement)?.value, reason: (document.getElementById("hold-reason") as HTMLTextAreaElement)?.value })}>Place legal hold</button>
          <div className="dv-holds">{data?.holds?.map((h: any) => <section key={h.id}><b>{h.status}</b><strong>{h.hold_name}</strong><span>{h.reason}</span>{h.status === "ACTIVE" && <button onClick={() => { const reason = prompt("Specific release reason"); if (reason) void action({ action: "RELEASE_HOLD", holdId: h.id, reason }); }}>Release with reason</button>}</section>)}</div>
        </article>
      </section>}

      {tab === "AUDIT & JOBS" && <section className="dv-grid">
        <article className="dv-card"><small>Full custody certification drill</small><h2>Evidence lifecycle and negative controls</h2><p>Runs a simulated intake-to-preservation lifecycle with a five-artifact signature envelope, legal hold, two-person disposition, reason-required retention override, and tamper-evident export. It never signs externally or destroys a real document.</p>{data?.role==="admin"&&<button disabled={busy} onClick={()=>void action({action:"RUN_CUSTODY_DRILL"})}>Run full custody drill</button>}<div className="dv-holds">{data?.custodyRuns?.map((run:any)=><section key={run.id}><b>{run.status}</b><strong>{run.provider_mode}</strong><span>Terminal hash {run.terminal_hash.slice(0,16)}… · production disabled</span><small>{new Date(run.executed_at).toLocaleString()}</small></section>)}</div></article>
        <article className="dv-card"><small>EXCEPTION QUEUE</small><h2>Automation jobs</h2>{data?.jobs?.map((job: any) => <section className="dv-event" key={job.id}><b>{job.status.replaceAll("_", " ")}</b><strong>{job.job_type.replaceAll("_", " ")}</strong><span>{job.provider || "No provider configured"} · attempts {job.attempts}</span></section>)}</article>
        <article className="dv-card"><small>ACCESS LEDGER</small><h2>Recent custody events</h2>{data?.access?.map((event: any) => <section className="dv-event" key={event.id}><b>{event.action.replaceAll("_", " ")}</b><strong>{event.actor}</strong><span>{new Date(event.created_at).toLocaleString()} · {event.reason}</span></section>)}{!data?.access?.length && <p>No controlled downloads have occurred.</p>}</article>
      </section>}
    </main>;
}
