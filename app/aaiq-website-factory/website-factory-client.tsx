"use client";
import { useEffect, useMemo, useState } from "react";
import GrowthCommandCenter from "./growth-command-center";
import GrapesHospitalityEditor from "./grapes-hospitality-editor";
type Row = Record<string, any>;

const readinessLabel = (project: Row) => {
  if (project.status === "PUBLISHED") return "Published";
  if (project.status === "AWAITING_APPROVAL") return "Awaiting approval";
  if (project.missingFields?.length) return "Content incomplete";
  return "Ready for approval";
};

export default function WebsiteFactoryClient() {
  const [data, setData] = useState<any>(null);
  const [tab, setTab] = useState("portfolio");
  const [selected, setSelected] = useState<Row | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [templateId,setTemplateId]=useState("MODERN_DIRECT");
  const [aiQuery,setAiQuery]=useState("");
  const [aiVariantGroupId,setAiVariantGroupId]=useState("");
  const [aiMeta,setAiMeta]=useState<{researchUsed:boolean;sourcesUsed:Array<{label:string;url:string|null}>;missingInformation:string[]}|null>(null);
  async function load() {
    const response = await fetch("/api/v1/website-factory", { cache: "no-store" });
    setData(await response.json());
  }
  useEffect(() => { void load(); }, []);
  async function action(body: Record<string, unknown>, message: string) {
    setBusy(String(body.action || "SAVE"));
    const response = await fetch("/api/v1/website-factory", {
      method: body.id ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    const result = await response.json() as any;
    setNotice(result.error ?? message);
    if (response.ok) { setSelected(null); await load(); }
    setBusy("");
    return response.ok;
  }
  async function generate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await action(Object.fromEntries(form), "A reviewable website project was created from verified property data.");
  }
  async function generateAiOptions(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!aiQuery.trim()) return;
    setBusy("GENERATE_WEBSITE_OPTIONS");
    const response = await fetch("/api/v1/website-factory", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "GENERATE_WEBSITE_OPTIONS", query: aiQuery.trim() }),
    });
    const result = await response.json() as any;
    setBusy("");
    if (!response.ok) { setNotice(result.error ?? "Generation failed."); return; }
    if (result.status === "MANUAL_FALLBACK") { setNotice(result.message ?? "Generation could not complete — preserved for manual completion."); return; }
    setAiVariantGroupId(result.variantGroupId ?? "");
    setAiMeta({ researchUsed: Boolean(result.researchUsed), sourcesUsed: result.sourcesUsed ?? [], missingInformation: result.missingInformation ?? [] });
    setNotice(`Generated ${result.projects?.length ?? 0} website option(s)${result.researchUsed ? ", grounded in live web research" : " from your verified property profile"}.`);
    await load();
  }
  async function chooseOption(projectId: string) {
    setBusy(`CHOOSE:${projectId}`);
    const response = await fetch("/api/v1/website-factory", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "CHOOSE_WEBSITE_OPTION", projectId }),
    });
    const result = await response.json() as any;
    setBusy("");
    setNotice(response.ok ? "Option chosen — the other drafts in this batch were archived. Open it to review and publish." : (result.error ?? "Could not choose this option."));
    if (response.ok) { setAiVariantGroupId(""); setAiMeta(null); await load(); }
  }
  async function requestDomainConnection(projectId: string, domain: string, targetHostname: string) {
    setBusy("REQUEST_DOMAIN_CONNECTION");
    const response = await fetch("/api/v1/website-factory", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "REQUEST_DOMAIN_CONNECTION", projectId, domain, targetHostname }),
    });
    const result = await response.json() as any;
    setBusy("");
    setNotice(response.ok ? "DNS records generated — add them at your registrar, then click Verify." : (result.error ?? "Could not request domain connection."));
    if (response.ok) await load();
    return response.ok ? result : null;
  }
  async function verifyDomainConnection(connectionId: string) {
    setBusy(`VERIFY:${connectionId}`);
    const response = await fetch("/api/v1/website-factory", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "VERIFY_DOMAIN_CONNECTION", connectionId }),
    });
    const result = await response.json() as any;
    setBusy("");
    setNotice(result.status === "VERIFIED" ? "Domain verified and connected." : (result.error || "Not verified yet — DNS changes can take time to propagate."));
    await load();
  }
  async function makePlan(candidate: Row) {
    await action({ action: "CREATE_RECONCILIATION_PLAN", assetId: candidate.root.id, code: candidate.proposedCode, address: candidate.proposedAddress },
      "Reconciliation preview created. Review the scope, then approve the canonical property migration.");
  }
  async function applyPlan(planId: string) {
    await action({ action: "APPLY_RECONCILIATION_PLAN", planId },
      "Property reconciliation completed. The property, assets, website and administrator assignment now share one canonical ID.");
  }
  async function save(form: HTMLFormElement, requestedAction = "SAVE") {
    if (!selected) return;
    const fields = new FormData(form), content = selected.content, seo = selected.seo;
    const sections = { ...content.sections };
    ["restaurant", "meetings", "gallery", "reviews", "blog", "events", "chatbot", "voice"].forEach(key => sections[key] = fields.get(key) === "on");
    await action({
      id: selected.id, action: requestedAction, name: fields.get("name"),
      content: { ...content, heroTitle: fields.get("heroTitle"), heroDescription: fields.get("description"),
        address: fields.get("address"), phone: fields.get("phone"), bookingUrl: fields.get("bookingUrl"),
        brandColor: fields.get("brandColor"), accentColor: fields.get("accentColor"), themeStyle: fields.get("themeStyle"), sections,
        builderHtml: fields.get("builderHtml"), builderCss: fields.get("builderCss"), builderProjectData: fields.get("builderProjectData") },
      seo: { ...seo, title: fields.get("seoTitle"), description: fields.get("seoDescription") },
    }, requestedAction === "PUBLISH" ? "Website published with a new audited revision." : requestedAction === "REQUEST_APPROVAL"
      ? "Website sent to the approval queue." : "Website draft saved with revision history.");
  }
  const activeProjects = useMemo(() => (data?.projects ?? []).filter((project: Row) =>
    !data?.activePropertyId || project.property_context_id === data.activePropertyId), [data]);
  const aiOptionProjects = useMemo(() => aiVariantGroupId
    ? activeProjects.filter((project: Row) => project.variant_group_id === aiVariantGroupId) : [], [activeProjects, aiVariantGroupId]);
  if (!data) return <main className="wf-shell wf-loading">Loading the Website Factory workspace…</main>;
  const property = data.profile.property;
  return <main className="wf-shell">
    <header className="wf-page-header">
      <div><p className="wf-kicker">AAIQ WEBSITE FACTORY 2.0</p><h1>Digital presence command center</h1>
        <span>Build, approve, publish and continuously improve every property website from governed property data.</span></div>
      <div className="wf-live-state"><i /><span><b>{property?.code ?? "NO PROPERTY"}</b><small>Canonical source · {property ? "connected" : "needs attention"}</small></span></div>
    </header>
    {notice && <div className="wf-notice" role="status"><span>{notice}</span><button onClick={() => setNotice("")}>Dismiss</button></div>}
    {data.reconciliations?.length > 0 && <section className="wf-reconcile">
      <header><div><p className="wf-kicker">PROPERTY IDENTITY RECONCILIATION</p><h2>Resolve property roots before publishing</h2>
        <p>These records were created as asset roots. Review the exact migration scope before creating a canonical property.</p></div><b>{data.reconciliations.length} NEED REVIEW</b></header>
      {data.reconciliations.map((candidate: Row) => <article key={candidate.root.id}>
        <div><strong>{candidate.root.name}</strong><span>{candidate.root.code} · {candidate.descendantCount} child assets · {candidate.project ? "website project found" : "no website project"}</span></div>
        <div className="wf-reconcile-map"><span>Asset root</span><i>→</i><b>{candidate.proposedCode}</b><i>→</i><span>Canonical property</span></div>
        {candidate.plan ? <button disabled={busy !== "" || candidate.plan.status === "SUCCEEDED"}
          onClick={() => void applyPlan(candidate.plan.id)}>{candidate.plan.status === "SUCCEEDED" ? "Reconciled" : "Approve & reconcile"}</button>
          : <button disabled={busy !== ""} onClick={() => void makePlan(candidate)}>Create validation preview</button>}
      </article>)}
    </section>}
    <section className="wf-metrics">
      <article><span>Website portfolio</span><strong>{data.metrics.total}</strong><small>all property projects</small></article>
      <article><span>Published</span><strong>{data.metrics.published}</strong><small>live, approval-controlled</small></article>
      <article><span>Ready</span><strong>{data.metrics.ready}</strong><small>content validation passed</small></article>
      <article className={data.metrics.needsAttention ? "attention" : ""}><span>Needs attention</span><strong>{data.metrics.needsAttention}</strong><small>missing verified content</small></article>
    </section>
    <nav className="wf-tabs" aria-label="Website Factory sections">
      {[["portfolio", "Portfolio"], ["create", "Create website"], ["editor", "Page editor"], ["growth", "Growth & channels"]].map(([id, label]) =>
        <button className={tab === id ? "active" : ""} onClick={() => setTab(id)} key={id}>{label}</button>)}
    </nav>
    {tab === "portfolio" && <section className="wf-portfolio">
      <header><div><p className="wf-kicker">CURRENT PROPERTY</p><h2>{property?.name ?? "Property setup required"}</h2>
        <p>{property?.address || "Complete the canonical property record before creating a public website."}</p></div>
        <button onClick={() => setTab("create")}>+ New website project</button></header>
      <div className="wf-project-grid">{activeProjects.length ? activeProjects.map((project: Row) =>
        <article className="wf-project-card" key={project.id}>
          <div className="wf-project-preview" style={{ background: `linear-gradient(135deg,${project.content.brandColor || "#17395f"},#0f2036)` }}>
            <small>OFFICIAL SITE DRAFT</small><h3>{project.content.heroTitle || project.name}</h3>
            <p>{project.content.heroDescription || "Verified property description required."}</p><span>Check availability</span>
          </div>
          <div className="wf-project-detail"><header><div><b className={`status-${project.status.toLowerCase()}`}>{readinessLabel(project)}</b>
            <h3>{project.name}</h3><span>/{project.slug}</span></div><strong>{Math.max(20, 100 - project.missingFields.length * 18)}%</strong></header>
            <div className="wf-progress"><i style={{ width: `${Math.max(20, 100 - project.missingFields.length * 18)}%` }} /></div>
            <dl><div><dt>Last updated</dt><dd>{new Date(project.updated_at).toLocaleDateString()}</dd></div>
              <div><dt>Rooms</dt><dd>{project.content.roomCount || "—"}</dd></div><div><dt>Theme</dt><dd>{project.theme.replaceAll("_", " ")}</dd></div></dl>
            {project.missingFields.length > 0 && <p className="wf-missing"><b>Missing:</b> {project.missingFields.join(", ")}</p>}
            <footer><a href={`/site-preview/${project.slug}`} target="_blank">Open draft preview ↗</a>
              <button onClick={() => { setSelected(project); setTab("editor"); }}>Edit website</button></footer>
          </div>
        </article>) : <div className="wf-empty"><b>No website is connected to this property.</b><p>Create a governed draft from its verified rooms, amenities and contact information.</p><button onClick={() => setTab("create")}>Create website</button></div>}</div>
    </section>}
    {tab === "create" && <section className="wf-ai-generate">
      <header><p className="wf-kicker">AI-DRIVEN · GROUNDED IN VERIFIED DATA</p><h2>Generate 3 website options</h2>
        <p>Describe the property (e.g. &quot;Days Inn Salina&quot;) and AAIQ will draft 3 genuinely distinct site options — grounded in this property&apos;s verified profile, and in live web research when a Brave Search key is configured in Integration Center.</p></header>
      <form onSubmit={generateAiOptions} className="wf-ai-form">
        <input value={aiQuery} onChange={e => setAiQuery(e.target.value)} placeholder="Make a website for Days Inn Salina" disabled={busy === "GENERATE_WEBSITE_OPTIONS" || !property} />
        <button disabled={busy === "GENERATE_WEBSITE_OPTIONS" || !property || !aiQuery.trim()}>{busy === "GENERATE_WEBSITE_OPTIONS" ? "Researching and drafting…" : "Generate 3 options"}</button>
      </form>
      {!property && <p className="wf-missing"><b>Select a canonical property before generating.</b></p>}
      {aiMeta && <p className="wf-ai-meta">{aiMeta.researchUsed ? "Grounded in live web research plus your verified property profile." : "Grounded only in your verified property profile — no web research connector is configured."}
        {aiMeta.missingInformation.length > 0 && <span> Missing: {aiMeta.missingInformation.join(", ")}.</span>}</p>}
      {aiOptionProjects.length > 0 && <div className="wf-ai-options">{aiOptionProjects.map((project: Row) => <article className="wf-ai-option" key={project.id}>
        <div className="wf-project-preview" style={{ background: `linear-gradient(135deg,${project.content.brandColor || "#17395f"},#0f2036)` }}>
          <small>{project.variant_label || "OPTION"}</small><h3>{project.content.heroTitle || project.name}</h3>
          <p>{project.content.heroDescription}</p>
        </div>
        <footer><a href={`/site-preview/${project.slug}`} target="_blank">Preview ↗</a>
          <button disabled={busy === `CHOOSE:${project.id}`} onClick={() => void chooseOption(project.id)}>{busy === `CHOOSE:${project.id}` ? "Choosing…" : "Choose this one"}</button></footer>
      </article>)}</div>}
    </section>}
    {tab === "create" && <section className="wf-create-workspace">
      <div><p className="wf-kicker">VERIFIED INPUTS</p><h2>Create from the canonical property</h2>
        <p>AAIQ uses property facts, room types and amenities already approved in the registry. Missing public details remain visible and block publication.</p>
        <ul><li><b>{property?.name || "No property selected"}</b><span>{property?.address || "Address missing"}</span></li>
          <li><b>{data.profile.roomCount} rooms</b><span>{data.profile.roomTypes.join(", ") || "Room types missing"}</span></li>
          <li><b>{data.profile.amenities.length} amenities and spaces</b><span>{data.profile.amenities.slice(0, 5).join(", ") || "Amenities not configured"}</span></li></ul></div>
      <form onSubmit={generate}><p className="wf-kicker">PROJECT SETUP</p><h2>Website objective and public details</h2>
        <label>Website/property name<input name="name" defaultValue={property?.name || ""} required /></label>
        <div className="wf-form-grid"><label>Requested URL slug<input name="slug" defaultValue={property?.name?.toLowerCase().replace(/[^a-z0-9]+/g, "-") || ""} /></label>
          <label>Public phone<input name="phone" placeholder="Verified property phone" /></label></div>
        <label>Public address<input name="address" defaultValue={property?.address || ""} /></label>
        <label>Direct booking URL<input name="bookingUrl" type="url" placeholder="https://booking.example.com/property" /></label>
        <input type="hidden" name="templateId" value={templateId}/>
        <fieldset className="wf-template-picker"><legend>Choose a starting design</legend>{(data.templates??[]).map((template:Row)=><button type="button" key={template.id} className={templateId===template.id?"active":""} onClick={()=>setTemplateId(template.id)} style={{"--template-brand":template.brand,"--template-accent":template.accent} as React.CSSProperties}><i/><b>{template.name}</b><span>{template.tone}</span></button>)}</fieldset>
        <details><summary>Optional: replace AAIQ-generated description</summary><label>Property description<textarea name="description" placeholder="Leave blank and AAIQ will prepare location-aware hotel copy automatically." /></label></details>
        <button disabled={busy !== "" || !property}>Generate editable website plan</button>
        <small>No public publishing occurs during generation. The result remains an editable draft.</small>
      </form>
    </section>}
    {tab === "editor" && <section className="wf-editor">
      {!selected ? <div className="wf-empty"><b>Select a website from Portfolio.</b><p>The editor includes page structure, live preview, SEO readiness and approval controls.</p><button onClick={() => setTab("portfolio")}>Return to portfolio</button></div>
        : <WebsiteEditor project={selected} busy={busy} save={save} close={() => { setSelected(null); setTab("portfolio"); }}
            domainConnections={(data.domainConnections ?? []).filter((c: Row) => c.project_id === selected.id)}
            requestConnection={requestDomainConnection} verifyConnection={verifyDomainConnection} domainBusy={busy} />}
    </section>}
    {tab === "growth" && <GrowthCommandCenter />}
  </main>;
}

function WebsiteEditor({ project, busy, save, close, domainConnections, requestConnection, verifyConnection, domainBusy }: {
  project: Row; busy: string; save: (form: HTMLFormElement, action?: string) => Promise<void>; close: () => void;
  domainConnections: Row[]; requestConnection: (projectId: string, domain: string, targetHostname: string) => Promise<any>;
  verifyConnection: (connectionId: string) => Promise<void>; domainBusy: string;
}) {
  const content = project.content, seo = project.seo;
  const [builder, setBuilder] = useState({ html: String(content.builderHtml || ""), css: String(content.builderCss || ""), projectData: String(content.builderProjectData || "") });
  return <form onSubmit={event => { event.preventDefault(); void save(event.currentTarget); }}>
    <aside className="wf-page-tree"><header><p className="wf-kicker">SITE STRUCTURE</p><button type="button" onClick={close}>Close</button></header>
      {(content.pages || ["Home", "Rooms", "Amenities", "Offers", "Contact"]).map((page: string, index: number) =>
        <button type="button" className={index === 0 ? "active" : ""} key={page}><i>{String(index + 1).padStart(2, "0")}</i>{page}<span>⋮</span></button>)}
      <button type="button" className="wf-add-page">+ Add page</button></aside>
    <section className="wf-editor-canvas"><header><div><p className="wf-kicker">LIVE EDITOR</p><h2>{project.name}</h2></div><a href={`/site-preview/${project.slug}`} target="_blank">Preview desktop ↗</a></header>
      <div className="wf-open-source-proof"><b>GrapesJS 0.23.3</b><span>BSD-3-Clause visual editor · embedded inside AAIQ approvals and revision history</span></div>
      <GrapesHospitalityEditor project={project} onSnapshot={setBuilder} />
      <input type="hidden" name="builderHtml" value={builder.html} readOnly />
      <input type="hidden" name="builderCss" value={builder.css} readOnly />
      <input type="hidden" name="builderProjectData" value={builder.projectData} readOnly />
      <div className="wf-editor-fields"><label>Website name<input name="name" defaultValue={project.name} /></label>
        <label>Hero headline<input name="heroTitle" defaultValue={content.heroTitle} /></label>
        <label>Verified description<textarea name="description" defaultValue={content.heroDescription} /></label>
        <div className="wf-form-grid"><label>Public address<input name="address" defaultValue={content.address} /></label>
          <label>Public phone<input name="phone" defaultValue={content.phone} /></label></div>
        <label>Direct booking URL<input name="bookingUrl" defaultValue={content.bookingUrl} /></label></div>
    </section>
    <aside className="wf-inspector"><p className="wf-kicker">DESIGN & READINESS</p>
      <label>Theme<select name="themeStyle" defaultValue={content.themeStyle || "EDITORIAL_HOSPITALITY"}><option>EDITORIAL_HOSPITALITY</option><option>CONFERENCE_PREMIUM</option><option>RESTAURANT_FORWARD</option><option>MINIMAL_DIRECT_BOOKING</option></select></label>
      <div className="wf-form-grid"><label>Brand<input name="brandColor" type="color" defaultValue={content.brandColor || "#17395f"} /></label>
        <label>Accent<input name="accentColor" type="color" defaultValue={content.accentColor || "#c58a32"} /></label></div>
      <label>SEO title<input name="seoTitle" defaultValue={seo.title} /></label><label>Search description<textarea name="seoDescription" defaultValue={seo.description} /></label>
      <fieldset><legend>Website modules</legend>{["restaurant", "meetings", "gallery", "reviews", "blog", "events", "chatbot", "voice"].map(key =>
        <label key={key}><input name={key} type="checkbox" defaultChecked={Boolean(content.sections?.[key])} />{key.replaceAll("_", " ")}</label>)}</fieldset>
      <section className="wf-readiness"><b>{project.missingFields.length ? "Publication blocked" : "Ready for approval"}</b>
        <p>{project.missingFields.length ? project.missingFields.join(" · ") : "Required verified content is complete."}</p></section>
      <footer><button disabled={busy !== ""}>Save revision</button><button type="button" disabled={busy !== ""} onClick={event => event.currentTarget.form && void save(event.currentTarget.form, "REQUEST_APPROVAL")}>Request approval</button>
        <button type="button" disabled={busy !== "" || project.missingFields.length > 0} onClick={event => event.currentTarget.form && void save(event.currentTarget.form, "PUBLISH")}>Publish approved site</button></footer>
      <DomainConnectionPanel projectId={project.id} connections={domainConnections} request={requestConnection} verify={verifyConnection} busy={domainBusy} />
    </aside>
  </form>;
}

/** Deliberately not a nested <form> — this renders inside WebsiteEditor's own
 * enclosing <form>, and nested forms are invalid HTML. "Get DNS records" is
 * a plain button with onClick instead of a submit handler. */
function DomainConnectionPanel({ projectId, connections, request, verify, busy }: {
  projectId: string; connections: Row[];
  request: (projectId: string, domain: string, targetHostname: string) => Promise<any>;
  verify: (connectionId: string) => Promise<void>; busy: string;
}) {
  const [domain, setDomain] = useState("");
  const [targetHostname, setTargetHostname] = useState("");
  async function getRecords() {
    if (!domain.trim() || !targetHostname.trim()) return;
    const result = await request(projectId, domain.trim(), targetHostname.trim());
    if (result) { setDomain(""); setTargetHostname(""); }
  }
  return <section className="wf-domain-panel">
    <p className="wf-kicker">CUSTOM DOMAIN</p>
    <div className="wf-domain-form">
      <input value={domain} onChange={e => setDomain(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void getRecords(); } }} placeholder="www.example.com" disabled={busy === "REQUEST_DOMAIN_CONNECTION"} />
      <input value={targetHostname} onChange={e => setTargetHostname(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void getRecords(); } }} placeholder="your-worker.workers.dev" disabled={busy === "REQUEST_DOMAIN_CONNECTION"} />
      <button type="button" disabled={busy === "REQUEST_DOMAIN_CONNECTION" || !domain.trim() || !targetHostname.trim()} onClick={() => void getRecords()}>
        {busy === "REQUEST_DOMAIN_CONNECTION" ? "Generating…" : "Get DNS records"}
      </button>
    </div>
    <p className="wf-domain-hint">Enter the public hostname your AAIQ Worker actually serves from (from your Cloudflare dashboard). AAIQ never modifies your DNS automatically — you add these records yourself, then verify.</p>
    {connections.map(connection => <article className="wf-domain-connection" key={connection.id}>
      <header><b>{connection.domain}</b><span className={`domain-status-${String(connection.status).toLowerCase()}`}>{String(connection.status).replaceAll("_", " ")}</span></header>
      {connection.status !== "VERIFIED" && <>
        <dl>
          <div><dt>TXT record</dt><dd><code>{`_aaiq-verify.${connection.domain}`}</code> = <code>{connection.verification_token}</code></dd></div>
          <div><dt>CNAME record</dt><dd><code>{connection.domain}</code> → <code>{connection.target_hostname}</code></dd></div>
        </dl>
        {connection.last_check_error && <p className="wf-domain-error">{connection.last_check_error}</p>}
        <button type="button" disabled={busy === `VERIFY:${connection.id}`} onClick={() => void verify(connection.id)}>{busy === `VERIFY:${connection.id}` ? "Checking…" : "Verify"}</button>
      </>}
    </article>)}
  </section>;
}
