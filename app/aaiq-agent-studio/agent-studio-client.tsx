"use client";
import { useEffect, useState } from "react";
import "./agent-studio.css";
import "./agent-command.css";
import DigitalEmployeeCommandCenter from "./digital-employee-command-center";

type Studio = {
  property: { id: string; code: string; name: string };
  modelConnected: boolean;
  agents: Array<Record<string, any>>;
  runs: Array<Record<string, any>>;
  approvals: Array<Record<string, any>>;
  exceptions: Array<Record<string, any>>;
  actions: Array<Record<string, any>>;
  capabilities: Array<Record<string, any>>;
  handoffs: Array<Record<string, any>>;
  commandSessions:Array<Record<string,any>>;
  commandMessages:Array<Record<string,any>>;
  authority: {role:string;definitions:Array<Record<string,any>>;topics:Array<Record<string,any>>;subscriptions:Array<Record<string,any>>;events:Array<Record<string,any>>;actions:Array<Record<string,any>>;safety:Record<string,boolean>} | null;
  roleParity: {profiles:Array<Record<string,any>>;tasks:Array<Record<string,any>>;reports:Array<Record<string,any>>;evaluations:Array<Record<string,any>>;handoffs:Array<Record<string,any>>;allowedHandoffTypes:string[]} | null;
  commandCenter:any;
};

function safeJson(value: unknown) {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
}

export default function AgentStudioClient() {
  const [data, setData] = useState<Studio | null>(null);
  const [intent, setIntent] = useState("Prepare today's maintenance briefing. Prioritize life safety, guest impact, overdue compliance, and parts constraints.");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedRun, setSelectedRun] = useState<Record<string, any> | null>(null);
  const [systemName, setSystemName] = useState("OPERA Cloud");
  const [capabilityKey, setCapabilityKey] = useState("GUEST_CHECK_IN");
  const [workflow, setWorkflow] = useState("Find reservation\nVerify identity and stay details\nConfirm room readiness\nPost approved authorization token\nComplete digital check-in\nPrepare key encoding request");
  const [physicalSteps, setPhysicalSteps] = useState("Ask guest to tap or insert physical payment card\nVerify government ID in person\nEncode and hand the physical room key to guest");
  const [authorityRole,setAuthorityRole]=useState("front-desk");
  const [signalTopic,setSignalTopic]=useState("weather");
  const [signalSummary,setSignalSummary]=useState("Synthetic UAT event used only to verify signal delivery.");
  const [selectedAgentKey,setSelectedAgentKey]=useState("front-desk");
  const [operatorPrompt,setOperatorPrompt]=useState("Prepare a summary of today's open guest requests and tell me what needs human attention.");
  const [commandSessionId,setCommandSessionId]=useState("");
  const [listening,setListening]=useState(false);
  const [voiceLanguage,setVoiceLanguage]=useState("en-US");

  async function load() {
    const response = await fetch("/api/v1/agent-studio", { cache: "no-store" });
    if (response.ok) setData(await response.json());
    else setMessage((await response.json()).error || "Agent Studio could not load.");
  }
  useEffect(() => { void load(); }, []);

  async function runBriefing() {
    setBusy(true); setMessage("");
    const response = await fetch("/api/v1/agent-studio", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "RUN_MAINTENANCE_BRIEFING", intent }),
    });
    const result = await response.json();
    setBusy(false);
    setMessage(result.status === "MANUAL_FALLBACK"
      ? "The request was preserved as a visible manual-fallback case."
      : response.ok ? "Maintenance briefing completed and audited." : result.error || "The agent run failed.");
    await load();
  }
  async function command(body: Record<string, unknown>) {
    setBusy(true); setMessage("");
    const response = await fetch("/api/v1/agent-studio", { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    setMessage(response.ok ? "Digital workforce control updated and audited." : result.error || "The action failed.");
    setBusy(false); await load();
  }
  async function runOperator(inputMode="TEXT",promptOverride?:string){
    setBusy(true);setMessage("");
    const response=await fetch("/api/v1/agent-studio",{method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({action:"RUN_DIGITAL_EMPLOYEE_COMMAND",agentKey:selectedAgentKey,prompt:promptOverride||operatorPrompt,
        inputMode,sessionId:commandSessionId||undefined})});
    const result=await response.json();setBusy(false);
    if(response.ok){setCommandSessionId(result.sessionId);setMessage(result.response||"Digital Employee completed the governed task.");}
    else setMessage(result.error||"The Digital Employee could not complete the request.");
    await load();
  }
  function startVoice(){
    const SpeechRecognition=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;
    if(!SpeechRecognition){setMessage("Voice recognition is not available in this browser. Type the same instruction below.");return;}
    const recognition=new SpeechRecognition();recognition.lang=voiceLanguage;recognition.interimResults=false;
    recognition.onstart=()=>setListening(true);recognition.onend=()=>setListening(false);
    recognition.onerror=()=>{setListening(false);setMessage("Voice capture stopped. You can type the instruction instead.");};
    recognition.onresult=(event:any)=>{const transcript=String(event.results?.[0]?.[0]?.transcript||"").trim();
      if(transcript){setOperatorPrompt(transcript);void runOperator("VOICE_TRANSCRIPT",transcript);}};
    recognition.start();
  }

  const latest = selectedRun ?? data?.runs[0];
  const output = safeJson(latest?.output_json) as any;
  return <main className="agent-studio">
    <header className="agent-hero">
      <div><small>AAIQ DIGITAL WORKFORCE</small><h1>Digital Employees</h1>
        <p>Role-trained hotel and restaurant agents with property scope, explainable decisions, autonomy limits, human approvals, PMS/POS playbooks, source-linked traces, physical handoffs, and manual fallback.</p></div>
      <div className={`agent-connection ${data?.modelConnected ? "connected" : "manual"}`}>
        <span>{data?.modelConnected ? "MODEL CONNECTED" : "MANUAL MODE"}</span>
        <strong>{data?.property?.name ?? "Loading property…"}</strong>
        <small>{data?.property?.code ?? "PROPERTY"} · Governed operator runtime</small>
      </div>
    </header>

    <section className="agent-kpis">
      <article><small>Registered agents</small><strong>{data?.agents.length ?? "—"}</strong><span>Versioned and governed</span></article>
      <article><small>Recent runs</small><strong>{data?.runs.length ?? "—"}</strong><span>Property scoped</span></article>
      <article><small>Approval cases</small><strong>{data?.approvals.filter(item => item.status === "PENDING").length ?? "—"}</strong><span>Consequential actions stop here</span></article>
      <article><small>Manual exceptions</small><strong>{data?.exceptions.filter(item => item.status === "OPEN").length ?? "—"}</strong><span>No failed request disappears</span></article>
    </section>

    <DigitalEmployeeCommandCenter center={data?.commandCenter} busy={busy} onAction={command}/>

    <section className="digital-operator">
      <header><div><small>TEXT OR VOICE COMMAND CENTER</small><h2>Ask a Digital Employee to work</h2>
        <p>Select a role, describe the outcome, and AAIQ reads only the canonical property. Safe digital work runs now; financial, public, access, employment, physical, and irreversible actions stop for approval.</p></div>
        <span>{data?.property?.code||"PROPERTY"}</span></header>
      <div className="operator-agents">{data?.agents.map((agent)=><button type="button" key={agent.id}
        className={selectedAgentKey===agent.agent_key?"active":""} onClick={()=>{setSelectedAgentKey(agent.agent_key);setCommandSessionId("");}}>
        <b aria-hidden="true">{agent.agent_key==="front-desk"?"👩🏽‍💼":agent.agent_key==="wedding-planner"?"💍":agent.agent_key==="event-manager"?"📅":agent.agent_key==="banquet-coordinator"?"🍽️":agent.agent_key==="network-engineer"?"📡":agent.agent_key==="phone-engineer"?"☎️":agent.agent_key==="cash-auditor"?"💵":agent.agent_key==="hiring-manager"?"🧑🏽‍🤝‍🧑🏽":agent.agent_key==="visual-qa-supervisor"?"📷":agent.department==="HOUSEKEEPING"?"🧹":agent.department==="MAINTENANCE"?"🧰":agent.department==="COMPLIANCE"?"🛡️":agent.department==="MARKETING"?"📣":"🤖"}</b>
        <span><strong>{agent.name}</strong><small>{agent.department}</small></span></button>)}</div>
      <div className="operator-compose"><textarea aria-label="Instruction for Digital Employee" value={operatorPrompt}
        onChange={event=>setOperatorPrompt(event.target.value)} placeholder="Example: How much cash did we collect today?" />
        <div><label className="voice-language">Voice language<select value={voiceLanguage} onChange={event=>setVoiceLanguage(event.target.value)}><option value="en-US">English</option><option value="es-US">Español</option><option value="hi-IN">हिन्दी</option><option value="gu-IN">ગુજરાતી</option></select></label><button type="button" className="voice-command" disabled={busy||listening} onClick={startVoice}>{listening?"Listening…":"🎙 Speak"}</button>
          <button type="button" disabled={busy||operatorPrompt.trim().length<3} onClick={()=>void runOperator()}>{busy?"Working…":"Run task"}</button></div></div>
      {message&&<p className="operator-result">{message}</p>}
      <div className="operator-history">{data?.commandMessages?.filter(item=>!commandSessionId||item.session_id===commandSessionId).slice(0,6).reverse().map(item=><article key={item.id} className={String(item.sender_type).toLowerCase()}><small>{item.sender_type.replaceAll("_"," ")}</small><p>{item.body}</p></article>)}</div>
    </section>

    <section className="authority-explorer"><header><div><small>AUTHORITY & EXTERNAL SIGNALS</small><h2>What each Digital Employee can and cannot do</h2><p>This is the enforced operating contract—not a marketing description. Irreversible actions cannot be Autonomous, and unavailable external signals are never invented.</p></div><span>{data?.authority?.definitions.length??0} governed capabilities</span></header>
      <div className="authority-toolbar"><label>Digital Employee<select value={authorityRole} onChange={e=>setAuthorityRole(e.target.value)}>{Array.from(new Set((data?.authority?.definitions??[]).map(x=>x.role_key))).map(x=><option key={x} value={x}>{String(x).replaceAll("-"," ")}</option>)}</select></label><label>Signal topic<select value={signalTopic} onChange={e=>setSignalTopic(e.target.value)}>{data?.authority?.topics.map(x=><option key={x.id} value={x.topic_key}>{x.display_name} · {x.freshness}</option>)}</select></label><button disabled={busy||data?.authority?.role!=="admin"} onClick={()=>void command({action:"SUBSCRIBE_SIGNAL",roleKey:authorityRole,topicKey:signalTopic})}>Subscribe role</button></div>
      <div className="authority-list">{data?.authority?.definitions.filter(x=>x.role_key===authorityRole).map(item=><article key={item.id}><div><strong>{item.capability_key.replaceAll("_"," ")}</strong><p>{item.description}</p><small>{item.reversible?"Reversible":"Irreversible · cannot become Autonomous"} · Signals: {(safeJson(item.required_signal_topics_json) as string[])?.join(", ")||"none"}</small></div><select aria-label={`${item.capability_key} authority`} value={item.autonomy_level} disabled={busy||data?.authority?.role!=="admin"} onChange={e=>void command({action:"SAVE_AUTHORITY",id:item.id,autonomyLevel:e.target.value})}><option value="AUTONOMOUS">Autonomous</option><option value="PROPOSE_ONLY">Propose only</option><option value="HUMAN_REQUIRED">Human required</option></select></article>)}</div>
      <div className="signal-health"><header><strong>Signal health and truthful freshness</strong><span>{data?.authority?.topics.filter(x=>x.freshness==="FRESH").length??0} fresh</span></header>{data?.authority?.topics.map(topic=><article key={topic.id}><div><b>{topic.display_name}</b><small>{topic.source_connector.replaceAll("_"," ")} · refresh {topic.refresh_cadence_minutes} min</small></div><em className={`signal-${String(topic.freshness).toLowerCase()}`}>{topic.freshness}{topic.ageMinutes==null?"":` · ${topic.ageMinutes} min`}</em></article>)}</div>
      {data?.authority?.role==="admin"&&<div className="synthetic-signal"><label>Synthetic UAT event<input value={signalSummary} onChange={e=>setSignalSummary(e.target.value)}/></label><button disabled={busy||!signalSummary.trim()} onClick={()=>void command({action:"PUBLISH_SYNTHETIC_SIGNAL",topicKey:signalTopic,summary:signalSummary})}>Publish labeled UAT signal</button><small>This never represents live market/weather data and is visibly labeled in every downstream record.</small></div>}
      <details><summary>Detailed beginner help</summary><ol><li>Select a Digital Employee to see its enforced actions.</li><li><b>Autonomous</b> means the action can execute within policy and is audited. <b>Propose only</b> means a person approves it. <b>Human required</b> means AAIQ only prepares/routes work.</li><li>Subscribe roles only to sources they need. Freshness becomes Stale or Unavailable automatically.</li><li>Use the synthetic UAT event to test delivery. Never treat it as a real business signal.</li></ol></details>
    </section>

    <section className="approval-command"><header><div><small>ROLE PARITY CONTROL</small><h2>Complete authorized digital workload</h2></div><span>{data?.roleParity?.profiles.length ?? 0} property roles</span></header>
      <p>Digital-capable duties remain with the Digital Employee. Human handoffs are restricted to physical work or legally reserved decisions.</p>
      <button disabled={busy} onClick={()=>void command({action:"EVALUATE_ROLE_PARITY"})}>Run 24 policy cases per duty</button>
      <button disabled={busy} onClick={()=>void command({action:"RUN_SCHEDULED_ROLE_REPORTS"})}>Generate daily hierarchy reports</button>
      <div>{data?.roleParity?.profiles.map(profile=>{const tasks=data.roleParity?.tasks.filter(task=>task.role_key===profile.role_key)??[];const certified=data.roleParity?.evaluations.filter(item=>item.role_key===profile.role_key&&item.total_cases>=20&&item.out_of_policy_count===0).length??0;return <article key={profile.id}><div><strong>{profile.role_name}</strong><p>{tasks.length} digital duties · governed by {profile.owner_agent_key}</p><small>{certified}/{tasks.length} duties evaluation-certified</small></div><button disabled={busy} onClick={()=>void command({action:"GENERATE_ROLE_REPORT",roleKey:profile.role_key,reportType:"ON_DEMAND"})}>Generate report</button><em>{profile.status}</em></article>})}</div>
    </section>

    <section className="executive-feed"><header><div><small>ROLE REPORTING</small><h2>Manager-ready reports with source drill-down</h2></div></header><div>
      {data?.roleParity?.reports.map(report=>{const structured=safeJson(report.structured_json) as any;const links=safeJson(report.source_links_json) as string[];return <article key={report.id}><span>📊</span><div><strong>{String(report.role_key).replaceAll("_"," ")} · {report.report_type}</strong><p>{report.summary_text}</p><small>{structured?.categories?.length??0} task categories · {new Date(report.generated_at).toLocaleString()}</small>{Array.isArray(links)&&links.slice(0,4).map((link,index)=><a key={index} href={link}>Source {index+1}</a>)}</div><em>{report.status}</em></article>})}
      {!data?.roleParity?.reports.length&&<p>No role report exists yet. Generate one from live property records.</p>}
    </div></section>

    <section className="briefing-workbench">
      <div>
        <small>WORKING VERTICAL SLICE</small><h2>Maintenance Briefing Agent</h2>
        <p>Reads only authorized work orders, assets, and due compliance records for the active property. It cannot modify work, order parts, approve return to service, or bypass safety rules.</p>
      </div>
      <textarea value={intent} onChange={event => setIntent(event.target.value)} aria-label="Maintenance briefing request" />
      <button disabled={busy || !intent.trim()} onClick={() => void runBriefing()}>{busy ? "Running governed agent…" : "Run maintenance briefing"}</button>
      {message && <p className="agent-message">{message}</p>}
    </section>

    <section className="agent-grid">
      <div className="agent-registry">
        <header><div><small>AGENT REGISTRY</small><h2>AAIQ digital employees</h2></div><span>{data?.agents.length ?? 0} configured</span></header>
        <div className="agent-card-grid">{data?.agents.map((agent,index) => <article key={agent.id} className={selectedAgentKey===agent.agent_key?"selected-agent":""}>
          <button type="button" className="agent-identity" onClick={()=>{setSelectedAgentKey(agent.agent_key);setCommandSessionId("");document.querySelector(".digital-operator")?.scrollIntoView({behavior:"smooth"});}}><i>{index===2?"👩🏽‍💼":String(agent.department).slice(0, 2)}</i><span><strong>{agent.name}</strong><small>{agent.department} · click to assign work</small></span></button>
          <p>{agent.purpose}</p>
          <div className="autonomy-control"><label>Autonomy / HITL limit
            <input type="number" min="0" step="1" defaultValue={agent.hitl_threshold_usd ?? 0}
              id={`limit-${agent.agent_key}`} aria-label={`${agent.name} autonomy limit`} /></label>
            <button disabled={busy} onClick={() => void command({action:"UPDATE_POLICY",agentKey:agent.agent_key,
              limit:Number((document.getElementById(`limit-${agent.agent_key}`) as HTMLInputElement)?.value||0),
              status:agent.policy_status==="PAUSED"?"PAUSED":"ACTIVE"})}>Save limit</button>
            <button className="pause-agent" disabled={busy} onClick={() => void command({action:"UPDATE_POLICY",
              agentKey:agent.agent_key,limit:Number(agent.hitl_threshold_usd||0),
              status:agent.policy_status==="PAUSED"?"ACTIVE":"PAUSED"})}>
              {agent.policy_status==="PAUSED"?"Resume":"Pause"}</button></div>
          <footer><span className={`risk-${String(agent.risk_level).toLowerCase()}`}>{agent.risk_level} RISK</span><span>{agent.policy_status ?? agent.status}</span></footer>
        </article>)}</div>
      </div>

      <aside className="agent-trace">
        <header><small>RUN TRACE</small><h2>Evidence and decisions</h2></header>
        <div className="run-list">{data?.runs.map(run => <button key={run.id} onClick={() => setSelectedRun(run)} className={latest?.id === run.id ? "active" : ""}>
          <span><strong>{run.agent_name}</strong><small>{new Date(run.created_at).toLocaleString()}</small></span>
          <em>{run.status}</em>
        </button>)}</div>
        {latest ? <div className="run-detail">
          <dl><div><dt>Status</dt><dd>{latest.status}</dd></div><div><dt>Confidence</dt><dd>{latest.confidence == null ? "Not available" : `${Math.round(latest.confidence * 100)}%`}</dd></div>
            <div><dt>Approval</dt><dd>{latest.approval_status}</dd></div><div><dt>Latency</dt><dd>{latest.latency_ms} ms</dd></div></dl>
          <h3>{output?.headline ?? "Run preserved"}</h3><p>{output?.executiveSummary ?? latest.error_message ?? latest.intent}</p>
          {output?.recommendedNextAction && <div className="next-action"><small>ONE NEXT ACTION</small><strong>{output.recommendedNextAction}</strong></div>}
          {Array.isArray(output?.priorities) && <ol>{output.priorities.map((item:any, index:number) => <li key={index}><strong>{item.title}</strong><span>{item.reason}</span><small>Sources: {item.sourceIds.join(", ") || "Missing"}</small></li>)}</ol>}
        </div> : <div className="empty-trace"><strong>No agent run yet</strong><span>Run the Maintenance Briefing Agent to create a source-linked trace.</span></div>}
      </aside>
    </section>

    <section className="approval-command"><header><div><small>HUMAN-IN-THE-LOOP</small><h2>Action required</h2></div>
      <span>{data?.approvals.filter(item=>item.status==="PENDING").length ?? 0} pending</span></header>
      <div>{data?.approvals.filter(item=>item.status==="PENDING").map(item=><article key={item.id}>
        <div><strong>{item.action_type}</strong><p>{item.reason}</p><small>{item.assigned_role} · {item.risk_level} RISK</small></div>
        <button disabled={busy} onClick={()=>void command({action:"DECIDE_APPROVAL",id:item.id,decision:"APPROVED",
          reason:"Approved in AAIQ HITL Command Center"})}>Approve</button>
        <button className="reject" disabled={busy} onClick={()=>void command({action:"DECIDE_APPROVAL",id:item.id,
          decision:"REJECTED",reason:"Rejected and overridden in AAIQ HITL Command Center"})}>Reject & override</button>
      </article>)}{!data?.approvals.some(item=>item.status==="PENDING")&&<p>No digital employee actions currently require approval.</p>}</div>
    </section>

    <section className="approval-command"><header><div><small>SYSTEM-NEUTRAL OPERATIONS</small>
      <h2>Teach any PMS, POS, accounting, or banking workflow</h2></div>
      <span>{data?.capabilities.length ?? 0} playbooks</span></header>
      <div className="system-trainer">
        <label>System name<input value={systemName} onChange={e=>setSystemName(e.target.value)} /></label>
        <label>Capability<input value={capabilityKey} onChange={e=>setCapabilityKey(e.target.value)} /></label>
        <label>Verified digital steps<textarea value={workflow} onChange={e=>setWorkflow(e.target.value)} /></label>
        <label>Physical human handoffs<textarea value={physicalSteps} onChange={e=>setPhysicalSteps(e.target.value)} /></label>
        <button disabled={busy} onClick={()=>void command({action:"TEACH_SYSTEM_CAPABILITY",systemType:"PMS",
          systemName,capabilityKey,steps:workflow.split("\n"),physicalHandoffs:physicalSteps.split("\n"),
          riskLevel:"MEDIUM"})}>Save as reviewable playbook</button>
      </div>
      <div>{data?.capabilities.map(item=><article key={item.id}><div><strong>{item.system_name} · {item.capability_key}</strong>
        <p>{item.system_type} · version {item.version}</p><small>{item.risk_level} RISK</small></div>
        {item.status==="DRAFT"&&<button disabled={busy} onClick={()=>void command({
          action:"DECIDE_SYSTEM_CAPABILITY",id:item.id,decision:"APPROVED",
          reason:"Administrator verified the digital steps and physical handoffs."
        })}>Approve playbook</button>}
        <button disabled={busy} onClick={()=>void command({action:"RUN_SYSTEM_TASK",agentKey:"front-desk",
          capabilityId:item.id,capabilityKey:item.capability_key,
          intent:`Execute ${item.capability_key} in ${item.system_name}`})}>
          Run governed task</button><em>{item.status}</em></article>)}</div>
    </section>

    <section className="executive-feed"><header><div><small>PHYSICAL TASK QUEUE</small>
      <h2>Human actions the digital employee cannot perform</h2></div></header>
      <div>{data?.handoffs.map(item=><article key={item.id}><span>👤</span><div><strong>{item.title}</strong>
        <p>{item.instructions}</p><small>{item.assigned_role} · {item.capability_key}</small></div>
        <em>{item.status}</em></article>)}{!data?.handoffs.length&&<p>No physical handoffs are waiting.</p>}</div>
    </section>

    <section className="executive-feed"><header><div><small>EXECUTIVE FEED</small><h2>Audited digital employee activity</h2></div></header>
      <div>{data?.actions.map(item=><article key={item.id}><span>🤖</span><div><strong>{item.agent_name}</strong>
        <p>{item.context_trigger}</p><small>{item.tool_called} · ${Number(item.amount_usd||0).toFixed(2)} · {new Date(item.created_at).toLocaleString()}</small></div>
        <em>{item.status}</em></article>)}{!data?.actions.length&&<p>No consequential agent actions have been executed for this property.</p>}</div>
    </section>

    <section className="exception-panel"><header><div><small>MANUAL FALLBACK</small><h2>Automation exception queue</h2></div><span>{data?.exceptions.length ?? 0} cases</span></header>
      <div>{data?.exceptions.length ? data.exceptions.map(item => <article key={item.id}><span><strong>{item.exception_state}</strong><small>{item.owner_role} · {new Date(item.created_at).toLocaleString()}</small></span><p>{item.recommended_action}</p><em>{item.status}</em></article>) : <p>No open agent exceptions for this property.</p>}</div>
    </section>
  </main>;
}
