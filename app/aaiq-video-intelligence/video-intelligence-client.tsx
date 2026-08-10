"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

const tabs = ["COMMAND", "INTAKE & JOBS", "EVIDENCE REVIEW", "INVENTORY VISION", "ACTION APPROVALS", "CAMERAS & EDGE", "EMPLOYEE VERIFICATION", "EXPRESS CHECK-IN", "EVIDENCE & RETENTION", "RULES & PROVIDERS", "REPORTS", "GOVERNANCE"];
const label = (value: string) => String(value || "").replaceAll("_", " ");

export default function VideoIntelligenceClient() {
  const [data, setData] = useState<any>(null);
  const [tab, setTab] = useState("COMMAND");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  async function load() {
    const response = await fetch("/api/v1/video-intelligence", { cache: "no-store" });
    const payload: any = await response.json();
    if (response.ok) setData(payload); else setNotice(payload.error);
  }
  useEffect(() => { void load(); }, []);

  async function act(action: string, body: any) {
    setBusy(action); setNotice("");
    const response = await fetch("/api/v1/video-intelligence", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...body }),
    });
    const payload: any = await response.json();
    setBusy("");
    setNotice(response.ok ? `${label(action)} completed and added to the audit trail.` : payload.error);
    await load();
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy("UPLOAD"); setNotice("");
    const response = await fetch("/api/v1/video-intelligence", { method: "POST", body: new FormData(event.currentTarget) });
    const payload: any = await response.json();
    setBusy("");
    setNotice(response.ok ? "Evidence secured and queued. No operational action occurs until an authorized review and approval." : payload.error);
    await load();
  }

  const pending = useMemo(() => data?.findings?.filter((item: any) => item.status === "NEEDS_REVIEW") || [], [data]);
  const checksByAudit = useMemo(() => (data?.checks || []).reduce((grouped: Record<string, any[]>, item: any) => {
    (grouped[item.audit_id] ||= []).push(item);
    return grouped;
  }, {}), [data]);

  return <main className="vi">
    <header>
      <div><a href="/">← AAIQ Home</a><small>GOVERNED MULTIMODAL OPERATIONS</small><h1>AAIQ Video Intelligence</h1>
        <p>Capture, analyze, verify, approve, and hand off property evidence without allowing computer vision to make disciplinary, safety, guest, financial, or room-status decisions by itself.</p></div>
      <aside><b>{data?.property?.name || "Loading property…"}</b><span>{data?.role === "admin" ? "ADMIN REVIEW CONTROL" : "READ ONLY"}</span>
        <em>{pending.length} findings need review</em><small>FRESH: {new Date().toLocaleTimeString()}</small></aside>
    </header>
    <div className="vi-boundary"><b>Human-control boundary</b><span>No accusation, enforcement, employee discipline, guest denial, PMS write, key issuance, room-status change, inventory adjustment, or emergency disposition occurs from visual analysis alone.</span></div>
    {notice && <p className="vi-notice" role="status">{notice}</p>}
    <nav aria-label="Video Intelligence workspaces">{tabs.map(item => <button className={tab === item ? "active" : ""} onClick={() => setTab(item)} key={item}>{item}</button>)}</nav>

    {tab === "COMMAND" && <>
      <section className="vi-metrics">
        <article><small>TOTAL AUDITS</small><strong>{data?.metrics?.audits || 0}</strong><span>Property scoped</span></article>
        <article><small>PROCESSING</small><strong>{data?.metrics?.queued || 0}</strong><span>Queued or validating</span></article>
        <article><small>HUMAN REVIEW</small><strong>{data?.metrics?.review || 0}</strong><span>Provisional only</span></article>
        <article><small>ACTION APPROVALS</small><strong>{data?.metrics?.proposals || 0}</strong><span>No silent handoff</span></article>
        <article><small>REWORK</small><strong>{data?.metrics?.rework || 0}</strong><span>Exact guidance required</span></article>
        <article><small>HIGH RISK</small><strong>{data?.metrics?.highRisk || 0}</strong><span>Manager attention</span></article>
        <article><small>INVENTORY REVIEW</small><strong>{data?.metrics?.inventoryReview || 0}</strong><span>No ledger adjustment</span></article>
        <article><small>EDGE HEALTHY</small><strong>{data?.metrics?.edgeHealthy || 0}</strong><span>Persisted heartbeat</span></article>
        <article><small>IDENTITY REVIEW</small><strong>{data?.metrics?.identityReview || 0}</strong><span>Alternatives available</span></article>
      </section>
      <section className="vi-grid">
        <article><small>ONE NEXT ACTION</small><h2>{pending.length ? "Review the oldest provisional finding" : "Create a governed evidence audit"}</h2>
          <p>{pending.length ? "Open Evidence Review, compare the source to required zones, document a decision, then create a separate approval proposal if work is needed." : "Choose a task-specific rule pack so required evidence, privacy handling, and review criteria are explicit."}</p>
          <button onClick={() => setTab(pending.length ? "EVIDENCE REVIEW" : "INTAKE & JOBS")}>Open recommended workspace</button></article>
        <article><small>PROCESSING CONTRACT</small><h2>Evidence → decision → work</h2>
          <ol><li>Validate file, tenant, property, type, and size</li><li>Hash and retain private object metadata</li><li>Apply privacy and audio-disabled policy</li><li>Evaluate task-specific evidence zones</li><li>Produce explainable provisional checks</li><li>Require a human disposition with notes</li><li>Create a separate approval-controlled action proposal</li><li>Write to the canonical operations queue only after approval</li></ol></article>
      </section>
    </>}

    {tab === "INTAKE & JOBS" && <section className="vi-grid">
      <form onSubmit={upload}><small>SECURE MULTIMODAL INTAKE</small><h2>Create a governed audit</h2>
        <label>Operational purpose<select name="auditType">{data?.auditTypes?.map((x: string) => <option key={x}>{x}</option>)}</select></label>
        <label>Zone<select name="zoneType">{data?.zones?.map((x: string) => <option key={x}>{x}</option>)}</select></label>
        <label>Exact room, asset, or area<input name="locationLabel" required placeholder="Room 218 bathroom, pool heater, linen store…"/></label>
        <label>Fresh image or video evidence<input name="file" type="file" accept="image/*,video/mp4,video/quicktime,video/webm" capture="environment" required/></label>
        <p className="hint">Images: 15 MB maximum. Video: 100 MB maximum. Audio is not analyzed. Do not upload unrelated guest or employee footage.</p>
        <button disabled={!!busy}>{busy === "UPLOAD" ? "Securing evidence…" : "Upload and queue"}</button>
      </form>
      <article><small>PROCESSING LEDGER</small><h2>Recent jobs</h2>
        <div className="stack">{data?.audits?.map((audit: any) => <div className="job" key={audit.id}>
          <b>{label(audit.audit_type)} · {audit.location_label}</b><span>{label(audit.status)}</span>
          <small>{new Date(audit.created_at).toLocaleString()} · {label(audit.source_type)} · {audit.file_name || "sample"}</small>
          {audit.status === "QUEUED" && data?.role === "admin" && <button onClick={() => act("RUN_DEVELOPMENT_ANALYSIS", { auditId: audit.id })}>Run governed development analysis</button>}
        </div>)}</div>
      </article>
    </section>}

    {tab === "EVIDENCE REVIEW" && <section className="vi-list">
      <header><div><small>HUMAN-IN-THE-LOOP</small><h2>Evidence checks and findings</h2><p>PASS means the submitted evidence was usable for that check—not that the room, repair, count, or safety condition was automatically accepted.</p></div></header>
      {data?.findings?.map((finding: any) => <article className="finding" key={finding.id}><div>
        <small>{finding.category} · {Math.round(finding.confidence * 100)}% · {finding.severity}</small><b>{finding.title}</b><p>{finding.description}</p>
        <div className="check-grid">{(checksByAudit as any)[finding.audit_id]?.map((check: any) => <span className={check.result === "PASS" ? "pass" : "review"} key={check.id}><b>{label(check.zone_code)}</b>{label(check.result)}<small>{check.explanation}</small>{check.remediation && <em>{check.remediation}</em>}</span>)}</div>
        <em>{finding.provisional ? "PROVISIONAL — HUMAN DECISION REQUIRED" : label(finding.status)}</em>
        {finding.status === "NEEDS_REVIEW" && data?.role === "admin" && <><label>Required review note<textarea value={reviewNotes[finding.id] || ""} onChange={e => setReviewNotes({...reviewNotes, [finding.id]: e.target.value})} placeholder="What did you verify in the evidence?"/></label>
          <div className="decisions">{["CONFIRMED","REWORK_REQUIRED","ESCALATE","DISMISSED","FALSE_POSITIVE","CORRECTED","REPROCESS","LEGAL_HOLD"].map(decision => <button key={decision} onClick={() => act("REVIEW_FINDING", { findingId: finding.id, decision, note: reviewNotes[finding.id] || "" })}>{label(decision)}</button>)}</div></>}
      </div><strong>{finding.human_decision || label(finding.status)}</strong></article>)}
      {!data?.findings?.length && <p className="empty">No findings. Create and analyze an audit first.</p>}
    </section>}

    {tab === "INVENTORY VISION" && <section className="vi-grid">
      <article><small>RUNNABLE SAMPLE WORKFLOW</small><h2>Photo/video count proposals</h2><p>AAIQ matches visible items only to this property&apos;s inventory ledger, proposes a count with confidence and evidence time, then waits for reconciliation. It never changes stock from vision alone.</p>
        <button disabled={busy==="RUN_SAMPLE_INVENTORY_DEMO"||data?.role!=="admin"} onClick={()=>void act("RUN_SAMPLE_INVENTORY_DEMO",{})}>{busy==="RUN_SAMPLE_INVENTORY_DEMO"?"Preparing governed proposals…":"Run canonical sample inventory demonstration"}</button>
        <p className="hint">The sample path is explicitly simulated. Real images require private MEDIA storage and a vision binding. Real videos additionally require the authenticated property edge frame sampler.</p>
        <div className="stack">{data?.inventoryDetections?.map((item:any)=><div className="job" key={item.id}><b>{item.detected_label} · {item.proposed_sku||"unmatched"}</b><span>{label(item.status)}</span><small>Proposed {item.proposed_quantity} {item.unit} · confidence {Math.round(item.confidence*100)}% · evidence {item.evidence_timestamp_ms==null?"image":`${item.evidence_timestamp_ms} ms`}</small></div>)}</div>
      </article>
      <form onSubmit={e => { e.preventDefault(); void act("CREATE_INVENTORY_OBSERVATION", Object.fromEntries(new FormData(e.currentTarget))); }}><small>MANUAL FALLBACK</small><h2>Record a visual inventory observation</h2>
        <label>Storage location<input name="locationLabel" required placeholder="Main bar back shelf"/></label>
        <label>Item SKU<input name="itemSku" required placeholder="BOURBON-750"/></label><label>Item name<input name="itemName" required placeholder="Bourbon 750 ml"/></label>
        <label>Observation type<select name="observationType"><option>UNIT_COUNT</option><option>PARTIAL_BOTTLE</option><option>SHELF_FACING</option><option>CASE_COUNT</option></select></label>
        <label>Observed quantity<input name="observedQuantity" type="number" min="0" step="0.01" required/></label><label>Unit<input name="unit" defaultValue="BOTTLE_EQUIVALENT"/></label>
        <label>Ledger quantity (optional)<input name="ledgerQuantity" type="number" min="0" step="0.01"/></label>
        <label>Calibration<select name="calibrationMethod"><option>MANUAL_REFERENCE</option><option>KNOWN_BOTTLE_GEOMETRY</option><option>WEIGHT_REFERENCE</option><option>NONE</option></select></label>
        <label>Estimated uncertainty (0–1)<input name="uncertainty" type="number" min="0" max="1" step="0.01" defaultValue="0.15"/></label>
        <button>Create reconciliation case</button><p className="hint">A duplicate key prevents repeated observations in the same 15-minute location/SKU window. No stock quantity changes until a separate inventory workflow is approved.</p>
      </form>
      <article><small>RECONCILIATION QUEUE</small><h2>Observed versus ledger</h2><div className="stack">{data?.inventory?.map((item:any)=><div className="job" key={item.id}><b>{item.item_name} · {item.location_label}</b><span>{label(item.status)}</span>
        <small>Observed {item.observed_quantity} {item.unit} · ledger {item.ledger_quantity ?? "not supplied"} · variance {item.variance ?? "n/a"} · uncertainty {Math.round(item.uncertainty*100)}%</small>
        {item.status==="NEEDS_REVIEW"&&data?.role==="admin"&&<div className="decisions">{["CONFIRM_COUNT","REJECT_FALSE_POSITIVE","REQUEST_RECOUNT"].map(decision=><button key={decision} onClick={()=>act("DECIDE_INVENTORY_OBSERVATION",{observationId:item.id,decision,note:`${label(decision)} after comparing the source evidence, calibration and inventory ledger.`})}>{label(decision)}</button>)}</div>}</div>)}</div></article>
    </section>}

    {tab === "ACTION APPROVALS" && <section className="vi-list">
      <header><div><small>SEPARATION OF DUTIES</small><h2>Operational handoff approval queue</h2><p>Only an approved proposal creates a canonical task or incident. Rejecting it preserves the evidence and decision history.</p></div></header>
      {data?.proposals?.map((proposal: any) => <article key={proposal.id}><div><small>{proposal.action_type} · {proposal.risk_level} RISK · {proposal.target_department}</small>
        <b>{proposal.title}</b><p>{proposal.description}</p><em>{label(proposal.status)}</em>{proposal.operational_record_id && <small>Canonical record: {proposal.operational_record_id}</small>}</div>
        {proposal.status === "PENDING_APPROVAL" && data?.role === "admin" ? <div className="decisions"><button onClick={() => act("DECIDE_PROPOSAL", { proposalId: proposal.id, decision: "APPROVE", note: "Approved after evidence and operational impact review." })}>Approve & create work</button><button onClick={() => act("DECIDE_PROPOSAL", { proposalId: proposal.id, decision: "REJECT", note: "Rejected after manager review." })}>Reject</button></div> : <strong>{label(proposal.status)}</strong>}
      </article>)}{!data?.proposals?.length && <p className="empty">No action proposals. A reviewed finding can create one without silently creating work.</p>}
    </section>}

    {tab === "CAMERAS & EDGE" && <section className="vi-grid">
      <article><small>SIMULATED PILOT CERTIFICATION</small><h2>Stream, incident, privacy, and recovery proof</h2><p>Runs a simulated camera reconnect and edge-buffer drill, three incident types with measurable acceptance metrics, mandatory governance validation, and four express check-in failure/recovery scenarios. It never connects a real camera, captures payment, or issues a credential.</p>{data?.role==="admin"&&<button onClick={()=>act("RUN_PILOT_CERTIFICATION",{})}>Run simulated pilot</button>}<div className="stack">{data?.pilotRuns?.map((run:any)=><div className="job" key={run.id}><b>{run.status} · {run.passed_checks}/{run.total_checks}</b><span>{label(run.provider_mode)}</span><small>Production disabled · camera, payment, and credential flags: false</small><em>{new Date(run.executed_at).toLocaleString()}</em></div>)}</div></article>
      <form onSubmit={e => { e.preventDefault(); void act("REGISTER_CAMERA", Object.fromEntries(new FormData(e.currentTarget))); }}><small>EDGE REGISTRY</small><h2>Register an authorized camera</h2>
        <label>Name<input name="name" required/></label><label>Zone<select name="zoneType">{data?.zones?.map((x: string) => <option key={x}>{x}</option>)}</select></label>
        <label>Location<input name="locationLabel" required/></label><label>Edge node<input name="edgeNodeName" placeholder="Property edge mini-PC"/></label>
        <label>Stream credential reference<input name="vaultReference" required placeholder="vault://property/cameras/lobby-01"/></label>
        <label>Retention days<input name="retentionDays" type="number" min="1" max="90" defaultValue="30"/></label>
        <button disabled={data?.role !== "admin"}>Register configuration</button></form>
      <article><small>CAMERA & PRIVACY STATUS</small><h2>Configured is not connected</h2><p>RTSP credentials never return to the browser. A camera remains CONFIGURATION REQUIRED until an authenticated edge health check succeeds.</p>
        <div className="stack">{data?.cameras?.map((camera: any) => <div className="job" key={camera.id}><b>{camera.name}</b><span>{label(camera.status)}</span><small>{camera.location_label} · {camera.retention_days} days · masking on · audio disabled</small></div>)}</div></article>
      <form onSubmit={e=>{e.preventDefault();void act("REGISTER_EDGE_NODE",Object.fromEntries(new FormData(e.currentTarget)));}}><small>ON-PROPERTY EDGE CONTROL</small><h2>Register an edge node</h2>
        <label>Node name<input name="name" required placeholder="Salina edge 01"/></label><label>Physical location<input name="locationLabel" required placeholder="Locked IT room rack A"/></label>
        <label>Software version<input name="softwareVersion" placeholder="edge-runtime 1.0"/></label><button disabled={data?.role!=="admin"}>Register edge node</button>
        <p className="hint">The health button records a controlled development heartbeat; production nodes must use signed device credentials and replay protection.</p></form>
      <article><small>EDGE HEALTH</small><h2>Nodes and reconnect state</h2><div className="stack">{data?.edgeNodes?.map((edge:any)=><div className="job" key={edge.id}><b>{edge.name}</b><span>{label(edge.status)}</span><small>{edge.location_label} · last heartbeat {edge.last_heartbeat_at?new Date(edge.last_heartbeat_at).toLocaleString():"never"}</small>
        {data?.role==="admin"&&<button onClick={()=>act("EDGE_HEARTBEAT",{edgeNodeId:edge.id})}>Record governed test heartbeat</button>}</div>)}</div></article>
    </section>}

    {tab === "EMPLOYEE VERIFICATION" && <section className="vi-grid">
      <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void act("CREATE_IDENTITY_VERIFICATION",{...Object.fromEntries(f),consent:f.get("consent")==="on"});}}><small>VOLUNTARY ONE-TO-ONE ONLY</small><h2>Create a verification case</h2>
        <label>Subject type<select name="subjectType"><option>EMPLOYEE</option><option>GUEST_RESERVATION</option></select></label>
        <label>Employee or reservation reference<input name="subjectReference" required/></label><label>Purpose<select name="purpose"><option>TIME_AND_ATTENDANCE</option><option>RESTRICTED_AREA_ACCESS</option><option>RESERVATION_CHECKIN</option></select></label>
        <label>Method<select name="verificationMethod"><option>BADGE_PIN</option><option>AUTHENTICATED_DEVICE</option><option>RESERVATION_OTP</option><option>ONE_TO_ONE_BIOMETRIC</option></select></label>
        <label className="check"><input name="consent" type="checkbox"/> Explicit, purpose-specific consent recorded</label><button>Create governed case</button>
        <p className="hint">No watchlist, continuous surveillance, one-to-many search, protected-trait inference, or raw biometric template is stored here. Badge/PIN and assisted alternatives remain available.</p></form>
      <article><small>VERIFICATION LEDGER</small><h2>Consent, method, and fallback</h2><div className="stack">{data?.identityCases?.map((item:any)=><div className="job" key={item.id}><b>{item.subject_type} · {item.subject_reference}</b><span>{label(item.status)}</span><small>{label(item.purpose)} · {label(item.verification_method)} · consent {label(item.consent_status)} · {label(item.match_mode)}</small><em>Fallback: {label(item.alternative_method)} · {label(item.template_storage)}</em></div>)}</div></article>
    </section>}

    {tab === "EXPRESS CHECK-IN" && <section className="vi-grid">
      <form onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); void act("CREATE_EXPRESS_CHECKIN", {...Object.fromEntries(f), consent: f.get("consent") === "on"}); }}><small>ASSISTED IDENTITY & READINESS</small><h2>Evaluate a check-in case</h2>
        <label>Reservation reference<input name="reservationReference" required/></label><label>Guest display name<input name="guestDisplayName" required/></label>
        <label>Payment<select name="paymentStatus"><option>UNVERIFIED</option><option>AUTHORIZED</option></select></label>
        <label>Restriction review<select name="restrictionStatus"><option>REVIEW_REQUIRED</option><option>CLEAR</option></select></label>
        <label>Room readiness<select name="roomStatus"><option>UNKNOWN</option><option>CLEAN_INSPECTED</option></select></label>
        <label className="check"><input name="consent" type="checkbox"/> Guest granted reservation-specific identity consent</label><button>Evaluate readiness</button>
        <p className="hint">Alternatives remain available: reservation OTP, authenticated device, badge + PIN, and front-desk assistance. No watchlist or one-to-many identification.</p></form>
      <article><small>STAGED HANDOFFS</small><h2>PMS, payment, key, and wallet controls</h2>{data?.checkins?.map((item: any) => <div className="case" key={item.id}><b>{item.reservation_reference} · {item.guest_display_name}</b><span>{label(item.status)}</span>
        <small>Identity: {label(item.identity_method)} · PMS: {label(item.pms_status)} · Key: {label(item.key_status)}</small><p>{item.manual_reason || "Ready for authorized human confirmation. Physical card/key handoff and unconfigured provider steps remain manual."}</p>
        <details><summary>Eight-step saga and recovery state</summary>{data?.checkinSteps?.filter((step:any)=>step.session_id===item.id).sort((a:any,b:any)=>a.step_order-b.step_order).map((step:any)=><p key={step.id}><b>{step.step_order}. {label(step.step_code)}</b> — {label(step.status)} · {step.detail}</p>)}</details></div>)}</article>
    </section>}

    {tab === "EVIDENCE & RETENTION" && <section className="vi-list">
      <header><div><small>CHAIN OF CUSTODY</small><h2>Private originals, derivatives, retention, and holds</h2><p>Original media remains private. A privacy-filtered derivative is the normal review surface. Legal holds suspend expiration but require a documented authorized decision.</p></div></header>
      {data?.evidence?.map((item:any)=><article key={item.id}><div><b>{item.media_type} · {label(item.custody_status)}</b><span>Retention until {new Date(item.retention_until).toLocaleDateString()}</span>
        <small>Audio removed: {item.audio_removed?"yes":"pending"} · faces blurred: {item.faces_blurred?"yes":"pending review"} · plates blurred: {item.plates_blurred?"yes":"pending review"}</small><em>{item.legal_hold?"LEGAL HOLD — EXPIRATION SUSPENDED":label(item.retention_class)}</em></div>
        {data?.role==="admin"&&<button onClick={()=>act("APPLY_EVIDENCE_HOLD",{evidenceId:item.id,hold:!item.legal_hold,note:item.legal_hold?"Legal hold released by an authorized administrator after case review.":"Legal hold applied by an authorized administrator for an active review."})}>{item.legal_hold?"Release hold":"Apply legal hold"}</button>}</article>)}
      {!data?.evidence?.length&&<p className="empty">No uploaded evidence objects are recorded for this property.</p>}
    </section>}

    {tab === "RULES & PROVIDERS" && <section className="vi-grid">
      <article><small>VERSIONED RULE PACKS</small><h2>Required evidence by purpose</h2><div className="stack">{data?.rules?.map((rule: any) => <div className="job" key={rule.id}><b>{label(rule.audit_type)} · v{rule.version}</b><span>{label(rule.status)}</span><small>{rule.requiredZones.join(" · ")}</small><em>{label(rule.auto_action_policy)}</em></div>)}</div></article>
      <form onSubmit={e => { e.preventDefault(); void act("CONFIGURE_PROVIDER", Object.fromEntries(new FormData(e.currentTarget))); }}><small>GOVERNED ADAPTER</small><h2>Add a provider configuration</h2>
        <label>Adapter type<select name="adapterType">{["VISION_INFERENCE","PMS","SMART_LOCK","WALLET","MESSAGING","BIOMETRIC_VECTOR_STORE","EDGE_NODE"].map(x => <option key={x}>{x}</option>)}</select></label>
        <label>Display name<input name="displayName" required/></label><label>External system<input name="externalSystem" placeholder="OPERA Cloud, ASSA ABLOY, Salto…"/></label>
        <label>Vault reference<input name="vaultReference" placeholder="vault://property/integrations/provider"/></label><button disabled={data?.role !== "admin"}>Save configuration</button>
        <p className="hint">Saving does not claim connectivity. Production actions remain blocked until an adapter passes an authenticated health check and approval policy.</p>
        <div className="stack">{data?.providers?.map((provider: any) => <div className="job" key={provider.id}><b>{provider.display_name}</b><span>{label(provider.status)}</span><small>{label(provider.adapter_type)} · {provider.capabilities.join(", ")}</small></div>)}</div>
      </form>
    </section>}

    {tab === "REPORTS" && <><section className="vi-metrics">
      <article><small>PASS RATE</small><strong>{data?.metrics?.passRate || 0}%</strong><span>Verified audits / total</span></article><article><small>REWORK RATE</small><strong>{data?.metrics?.audits ? Math.round(100 * data.metrics.rework / data.metrics.audits) : 0}%</strong><span>Reviewed audits</span></article>
      <article><small>OPEN HIGH RISK</small><strong>{data?.metrics?.highRisk || 0}</strong><span>Drill to findings</span></article><article><small>PENDING HANDOFF</small><strong>{data?.metrics?.proposals || 0}</strong><span>Drill to approvals</span></article></section>
      <section className="vi-list report"><header><div><small>DRILL-DOWN LEDGER</small><h2>Purpose → audit → evidence → decision → work</h2></div></header>
        {data?.audits?.map((audit: any) => <article key={audit.id}><div><b>{label(audit.audit_type)}</b><span>{audit.location_label} · {label(audit.zone_type)}</span><small>Source: {audit.file_name || audit.source_type} · Model: {audit.model_version || "not run"} · Confidence: {audit.confidence ? `${Math.round(audit.confidence*100)}%` : "n/a"}</small>
          <details><summary>Source and audit history</summary>{data?.events?.filter((event: any) => event.audit_id === audit.id).map((event: any) => <p key={event.id}><b>{label(event.event_type)}</b> — {event.detail} · {new Date(event.created_at).toLocaleString()}</p>)}</details></div><strong>{label(audit.status)}</strong></article>)}</section></>}

    {tab === "GOVERNANCE" && <section className="vi-governance">
      <article><h2>Computer vision policy</h2><p>Findings are advisory until reviewed. Facial watchlists, protected-trait inference, automatic discipline, and vision-only guest denial are prohibited.</p></article>
      <article><h2>Identity verification</h2><p>Biometrics are limited to voluntary, reservation-specific one-to-one verification with non-biometric alternatives and explicit consent evidence.</p></article>
      <article><h2>Evidence and retention</h2><p>Uploads are property scoped, access audited, audio processing disabled, and retention bounded. Legal hold requires an authorized decision.</p></article>
      <article><h2>Operational separation</h2><p>Reviewing a finding does not create work. A second approval creates the canonical task or incident with its own lifecycle and audit history.</p></article>
      <article><h2>Failure recovery</h2><p>Unconfigured providers, low confidence, missing zones, unavailable AI, and integration failures remain visible as review or manual work—not silent success.</p></article>
      <article><h2>HNE boundary</h2><p>Provider fields are future-compatible only. This AAIQ module does not access, modify, or claim ownership of HNE repositories, databases, schemas, or deployments.</p></article>
    </section>}
  </main>;
}
