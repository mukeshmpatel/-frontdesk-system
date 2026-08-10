"use client";

import { useEffect, useMemo, useState } from "react";

type Template = {
  id: string;
  version: number;
  name: string;
  description: string;
  immutable: boolean;
  snapshot: Record<string, any>;
};
type Clone = {
  id: string;
  property_id: string;
  property_code: string;
  name: string;
  status: string;
  created_at: string;
  summary: Record<string, any>;
};

export default function SampleEnvironmentClient() {
  const [data, setData] = useState<{ role: string; uatRole?: string; templates: Template[]; clones: Clone[] } | null>(null);
  const [selected, setSelected] = useState("");
  const [copyName, setCopyName] = useState("My New Hotel Environment");
  const [copyAddress, setCopyAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function load() {
    const response = await fetch("/api/v1/sample-environments", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Unable to load sample environments.");
    setData(payload);
    setSelected(current => current || payload.templates[0]?.id || "");
  }
  useEffect(() => { void load().catch(error => setNotice(error.message)); }, []);
  const template = useMemo(() => data?.templates.find(item => item.id === selected), [data, selected]);

  async function clone() {
    if (!template) return;
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/v1/sample-environments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ templateId: template.id, name: copyName, address: copyAddress || undefined }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Clone failed.");
      setNotice(`Editable environment created: ${payload.propertyCode}. It is now available in the property selector.`);
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Clone failed.");
    } finally {
      setBusy(false);
    }
  }

  async function activateCanonicalSample() {
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/v1/sample-environments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "ACTIVATE_CANONICAL_SAMPLE" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "The canonical sample could not be activated.");
      setNotice(`${payload.property.name} is now the single active workspace. ${payload.archivedProperties.length} prior propert${payload.archivedProperties.length===1?"y was":"ies were"} preserved as archived source records.`);
      await load();
      window.setTimeout(()=>window.location.assign("/aaiq-agent-studio"),900);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The canonical sample could not be activated.");
    } finally { setBusy(false); }
  }

  if (!data || !template) return <main className="sample-lab"><div className="sample-loading">Loading protected AAIQ samples…</div></main>;
  const snapshot = template.snapshot;
  return <main className="sample-lab">
    <header className="sample-hero">
      <div>
        <p className="eyebrow">AAIQ Administration · Protected reference data</p>
        <h1>Sample Environment Library</h1>
        <p>Explore a complete hospitality enterprise, then clone it into an independent editable property. The original sample is locked against editing and deletion.</p>
      </div>
      <div className="sample-security">
        <strong>IMMUTABLE TEMPLATE</strong>
        <span>Clone-only · Versioned · Audited</span>
      </div>
    </header>

    {notice && <div className="sample-notice" role="status">{notice}</div>}
    {data.uatRole && <div className="sample-notice" role="status" data-testid="authenticated-uat-role">Authenticated UAT session · {data.uatRole.replaceAll("_"," ")} · {data.role==="admin"?"administrative controls enabled":"administrative controls denied"}</div>}

    <section className="clone-panel" aria-label="Canonical sample workspace">
      <div>
        <p className="eyebrow">Recommended pilot reset · preservation-safe</p>
        <h2>Activate one perfect sample hotel</h2>
        <p>AAIQ will make one complete editable sample the only active workspace. Existing Wyndham and Days Inn records are archived—not deleted—so their work remains recoverable. Every module will then use this same property.</p>
      </div>
      <button type="button" disabled={busy||data.role!=="admin"} onClick={()=>void activateCanonicalSample()}>
        {busy?"Preparing the complete hotel…":"Activate perfect sample workspace"}
      </button>
    </section>

    <section className="sample-layout">
      <aside className="template-list">
        <small>Protected templates</small>
        {data.templates.map(item => <button key={item.id} className={selected === item.id ? "active" : ""} onClick={() => setSelected(item.id)}>
          <span><b>{item.name}</b><em>Version {item.version}</em></span>
          <strong>Locked</strong>
        </button>)}
        <div className="sample-rule">
          <b>Why templates are locked</b>
          <p>Every user starts from the same verified reference. All customization happens in a new copy with its own property ID and audit history.</p>
        </div>
      </aside>

      <div className="sample-content">
        <section className="template-overview">
          <div>
            <p className="eyebrow">Reference environment</p>
            <h2>{template.name}</h2>
            <p>{template.description}</p>
          </div>
          <div className="overview-stats">
            <span><b>{snapshot.property.roomCount}</b>Rooms</span>
            <span><b>{snapshot.people.length}</b>Employees</span>
            <span><b>{snapshot.agents.length}</b>AI agents</span>
            <span><b>{snapshot.property.roomCount * snapshot.roomAssetTemplate.length + snapshot.property.spaces.length}</b>Assets & spaces</span>
          </div>
        </section>

        <section className="sample-grid">
          <article>
            <header><span>01</span><div><b>Company & Property</b><small>Canonical enterprise hierarchy</small></div></header>
            <h3>{snapshot.company.name}</h3>
            <p>{snapshot.property.name}<br />{snapshot.property.address}</p>
            <ul><li>{snapshot.company.brand}</li><li>{snapshot.company.accountingMethod} accounting sample</li><li>Three floors · 105 rooms · 15 public/operational spaces</li></ul>
          </article>
          <article>
            <header><span>02</span><div><b>Workforce</b><small>Role and department examples</small></div></header>
            <div className="people-preview">{snapshot.people.slice(0, 6).map((person: any) => <div key={person.email}><i>{person.name.split(" ").map((part: string) => part[0]).join("")}</i><span><b>{person.name}</b><small>{person.role} · {person.shift}</small></span></div>)}</div>
          </article>
          <article>
            <header><span>03</span><div><b>Rooms & Assets</b><small>Complete standard package</small></div></header>
            <div className="asset-chips">{snapshot.roomAssetTemplate.map((asset: any[]) => <span key={asset[0]}>{asset[1]}</span>)}</div>
            <p>Every cloned room receives its own tagged equipment records, sample model, serial number, warranty, evidence zones and property scope.</p>
          </article>
          <article>
            <header><span>04</span><div><b>Operational Work</b><small>Editable workflow samples</small></div></header>
            <div className="work-preview">{snapshot.workOrders.map((order: any) => <div key={order.title}><span className={order.priority.toLowerCase()}>{order.priority}</span><b>{order.title}</b><small>{order.department} · {order.status} · {order.progress}%</small></div>)}</div>
          </article>
          <article>
            <header><span>05</span><div><b>Inventory</b><small>Operational stock ledger starting set</small></div></header>
            <table><tbody>{snapshot.inventory.slice(0, 5).map((item: any) => <tr key={item.sku}><td><b>{item.name}</b><small>{item.sku}</small></td><td>{item.onHand}</td><td>Par {item.par}</td></tr>)}</tbody></table>
          </article>
          <article>
            <header><span>06</span><div><b>Governed AI Agents</b><small>Tools, sources and approvals</small></div></header>
            <div className="agent-preview">{snapshot.agents.slice(0, 6).map((agent: any[]) => <div key={agent[0]}><span>{agent[4]}</span><b>{agent[1]}</b><small>{agent[3]}</small></div>)}</div>
          </article>
          <article>
            <header><span>07</span><div><b>Website Factory</b><small>Professional hospitality starter</small></div></header>
            <h3>{snapshot.website.theme.replaceAll("_", " ")}</h3>
            <p>{snapshot.website.pages.length} pages and {snapshot.website.sections.length} reusable hospitality sections, created as an editable draft linked to the cloned property.</p>
            <div className="asset-chips">{snapshot.website.pages.slice(0, 7).map((page: string) => <span key={page}>{page}</span>)}</div>
          </article>
          <article>
            <header><span>08</span><div><b>Social Sandbox</b><small>No production credentials</small></div></header>
            <div className="asset-chips">{snapshot.social.accounts.map((account: string) => <span key={account}>{account}</span>)}</div>
            <p>Sample connections are marked SANDBOX_NOT_CONNECTED. Publishing and spending remain approval controlled.</p>
          </article>
          <article>
            <header><span>09</span><div><b>Reporting Facts</b><small>Drill-ready reference metrics</small></div></header>
            <ul>{snapshot.reports.map((report: string) => <li key={report}>{report}</li>)}</ul>
          </article>
        </section>

        <section className="clone-panel">
          <div>
            <p className="eyebrow">Create an editable real environment</p>
            <h2>Clone this protected sample</h2>
            <p>Cloning generates a new canonical property, 105 rooms, 945 room equipment records, public spaces, employees, assignments, operational work, inventory, agents, website draft, social sandboxes and reporting facts.</p>
          </div>
          <form onSubmit={event => { event.preventDefault(); void clone(); }}>
            <label>New environment/property name<input required value={copyName} onChange={event => setCopyName(event.target.value)} /></label>
            <label>Address override <span>Optional</span><input value={copyAddress} onChange={event => setCopyAddress(event.target.value)} placeholder={snapshot.property.address} /></label>
            <button disabled={busy || data.role !== "admin"}>{busy ? "Creating complete environment…" : "Create editable copy"}</button>
            {data.role !== "admin" && <small>Administrator approval is required to create environments.</small>}
          </form>
        </section>

        <section className="clone-history">
          <header><div><p className="eyebrow">Created from protected samples</p><h2>Editable environments</h2></div><span>{data.clones.length} copies</span></header>
          {data.clones.length ? <div>{data.clones.map(clone => <article key={clone.id}>
            <span><b>{clone.name}</b><small>{clone.property_code} · {new Date(clone.created_at).toLocaleString()}</small></span>
            <div><em>{clone.status}</em><a href="/aaiq-asset-registry">Open property</a></div>
            <dl><div><dt>Rooms</dt><dd>{clone.summary.rooms}</dd></div><div><dt>Assets</dt><dd>{clone.summary.roomAssets}</dd></div><div><dt>People</dt><dd>{clone.summary.people}</dd></div><div><dt>Agents</dt><dd>{clone.summary.agents}</dd></div></dl>
          </article>)}</div> : <p className="empty">No editable copies have been created yet.</p>}
        </section>
      </div>
    </section>
  </main>;
}
