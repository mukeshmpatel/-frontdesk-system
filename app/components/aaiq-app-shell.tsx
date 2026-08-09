"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AAIQ_NAVIGATION, AAIQ_NAVIGATION_GROUPS } from "./aaiq-navigation";
import { recordModuleUse } from "./smart-quick-links";
const departmentApps=[
 {key:"AAIQ_DIGITAL_FRONT_DESK",href:"/digital-front-desk",name:"AAIQ Front Desk",description:"Guest requests, incidents and shift operations",group:"Operations"},
 {key:"AAIQ_HOUSEKEEPING",href:"/housekeeping",name:"AAIQ Housekeeping",description:"My rooms, evidence and room readiness",group:"Operations"},
 {key:"AAIQ_MAINTENANCE",href:"/maintenance",name:"AAIQ Maintenance",description:"Work orders, assets and preventive maintenance",group:"Operations"},
 {key:"AAIQ_COMPLIANCE_CENTER",href:"/compliance-center",name:"AAIQ Compliance",description:"PMI, inspections and guided compliance",group:"Operations"},
 {key:"AAIQ_EVENT_WORKFORCE",href:"/aaiq-event-workforce",name:"AAIQ Event Workforce",description:"Weddings, events, banquet portfolios and approval-ready documents",group:"Operations"},
 {key:"AAIQ_PROPERTY_INTELLIGENCE",href:"/property-intelligence",name:"AAIQ Inventory & Procurement",description:"Department counts, stock, requisitions, purchase orders and receiving",group:"Operations"},
 {key:"AAIQ_TIME_MANAGEMENT",href:"/workforce-time-clock",name:"AAIQ Workforce",description:"Secure clock-in, breaks, attendance and shift readiness",group:"People"},
 {key:"AAIQ_COMMUNICATION_CENTER",href:"/aaiq-communication-center",name:"AAIQ Master Inbox",description:"One governed inbox for operational communication",group:"People"},
 {key:"AAIQ_CUSTOMER_INTELLIGENCE",href:"/aaiq-customer-intelligence",name:"AAIQ Customer Intelligence",description:"Guest journeys, spending cohorts and governed activation",group:"Growth"},
 {key:"AAIQ_ONLINE_PRESENCE",href:"/aaiq-online-presence",name:"AAIQ Online Presence & Technology",description:"Marketing channels, rankings, networks, phones and cameras",group:"Growth"},
 {key:"AAIQ_REPORTING",href:"/reports",name:"AAIQ Enterprise Reports",description:"Property health and drill-down reporting",group:"Management"},
 {key:"AAIQ_USER_MANAGEMENT",href:"/aaiq-user-management",name:"AAIQ User & Access",description:"Roles, permissions and property access",group:"Management"},
];
export default function AaiqAppShell({children}:{children:React.ReactNode}){
 const path=usePathname();
 const [context,setContext]=useState<{property?:{id:string;code:string;name:string;address?:string;timezone?:string;status?:string};properties?:Array<{id:string;code:string;name:string;address?:string;timezone?:string;status?:string}>;role?:string;currentUser?:{displayName:string}}|null>(null);
 const [allowedModules,setAllowedModules]=useState<Set<string>|null>(null);
 const [capabilityStatuses,setCapabilityStatuses]=useState<Record<string,{status:string;gap?:string}>>({});
 const [propertyOpen,setPropertyOpen]=useState(false),[appsOpen,setAppsOpen]=useState(false),[appsGroup,setAppsGroup]=useState("Operations"),[query,setQuery]=useState(""),[switching,setSwitching]=useState("");
 const activeItem=useMemo(()=>AAIQ_NAVIGATION.find(item=>path===item.href||path.startsWith(`${item.href}/`))??AAIQ_NAVIGATION[0],[path]);
 const activeGroup=activeItem.group;
 const [openGroup,setOpenGroup]=useState<string>(activeGroup);
 const [shiftReady,setShiftReady]=useState<"checking"|"ready"|"required">("checking");
 async function fetchContext(){const response=await fetch("/api/operations/front-desk",{cache:"no-store"});return response.ok?response.json():null}
 useEffect(()=>{setOpenGroup(activeGroup)},[activeGroup]);
 useEffect(()=>{
  if(path.startsWith("/api/")||path.startsWith("/workforce-time-clock")){setShiftReady("ready");return}
  recordModuleUse(path);
  void Promise.all([
   fetchContext().then(data=>{if(data)setContext(data)}),
   fetch("/api/operations",{cache:"no-store"}).then(async response=>response.ok?((await response.json()) as any).operations:null),
   fetch("/api/v1/access-management",{cache:"no-store"}).then(async response=>response.ok?((await response.json()) as any).allowedModules:[]).then(keys=>setAllowedModules(new Set<string>(keys))),
   fetch("/api/v1/capability-ledger?itemType=module",{cache:"no-store"}).then(async response=>response.ok?((await response.json()) as any).moduleStatuses:{}).then(statuses=>setCapabilityStatuses(statuses as Record<string,{status:string;gap?:string}>)).catch(()=>setCapabilityStatuses({}))
  ]).then(([,operations])=>{
   if(operations?.currentOpenEntry){setShiftReady("ready");return}
   setShiftReady("required");
   window.location.replace(`/workforce-time-clock?returnTo=${encodeURIComponent(path)}`);
  }).catch(()=>setShiftReady("required"));
 },[path]);
 async function switchProperty(propertyId:string){setSwitching(propertyId);const response=await fetch("/api/operations/front-desk",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"SWITCH_PROPERTY",propertyId})});if(response.ok){setPropertyOpen(false);const data=await fetchContext();if(data)setContext(data);window.location.reload()}setSwitching("")}
 const properties=(context?.properties??[]).filter(property=>`${property.name} ${property.code} ${property.address??""}`.toLowerCase().includes(query.toLowerCase()));
 if(path.startsWith("/api/")||path.startsWith("/install")||path.startsWith("/capture")||path.startsWith("/site-preview/"))return <>{children}</>;
 if(path!=="/workforce-time-clock"&&shiftReady!=="ready")return <main className="aaiq-shift-gate"><div className="shift-gate-mark">AA</div><small>AAIQ WORKFORCE</small><h1>{shiftReady==="checking"?"Checking shift readiness…":"Clock-in required"}</h1><p>Your secure time clock opens before the workspace so attendance, assignments and audit history start correctly.</p><a href={`/workforce-time-clock?returnTo=${encodeURIComponent(path)}`}>Open AAIQ Clock-In</a></main>;
 return <div className="aaiq-persistent-shell">
  <aside><Link className="persistent-brand" href="/"><Image src="/aai-tech-logo.jpeg" alt="AAI Tech" width={64} height={64} unoptimized/><span>AAI Q<small>Enterprise Operations</small></span></Link>
   <nav>{AAIQ_NAVIGATION_GROUPS.map(group=>{const visible=AAIQ_NAVIGATION.filter(item=>item.group===group&&(!allowedModules||allowedModules.has(item.key)));if(!visible.length)return null;const expanded=openGroup===group;const groupActive=activeGroup===group;return <section className={`shell-nav-group${groupActive?" active-group":""}`} key={group}><button className="shell-group-toggle" aria-expanded={expanded} onClick={()=>setOpenGroup(expanded?"":group)}><span>{group}</span><i>{expanded?"−":"+"}</i></button><div className="shell-group-items" hidden={!expanded}>{visible.map(item=>{const i=AAIQ_NAVIGATION.indexOf(item),status=capabilityStatuses[item.key]?.status;const badge=status==="working_verified"?"VERIFIED":status==="blocked_credentials"?"CONFIG":status==="simulated"?"SIMULATED":status==="broken"?"BROKEN":status?"PREVIEW":("badge" in item?item.badge:undefined);return <Link key={item.href} className={path===item.href||path.startsWith(`${item.href}/`)?"active":""} href={item.href}><i>{String(i+1).padStart(2,"0")}</i><span>{item.label}</span>{badge&&<b>{badge}</b>}</Link>})}</div></section>})}</nav>
   <footer><b>AAIQ Workspace</b><small>Secure · audited · approval controlled</small></footer>
  </aside>
  <section className="aaiq-shell-body">
   <Link className="aaiq-social-card-strip" href="/" aria-label="AAIQ Home — Everything important, remembered">
    <i aria-hidden="true">AA</i>
    <span><strong>AAIQ Enterprise Operations</strong><small>Everything important, connected and governed</small></span>
    <em>Secure workspace</em>
   </Link>
   <header>
    <Link href="/">AAIQ Home</Link>
    <button className="shell-property-context" onClick={()=>setPropertyOpen(true)} aria-haspopup="dialog"><span>{context?.property?.code ?? "PROPERTY"} ▾</span><strong>{context?.property?.name ?? "Loading property context…"}</strong><small>{context?.property?.address??`${context?.currentUser?.displayName ?? "Authorized user"} · ${(context?.role ?? "staff").toUpperCase()}`}</small></button>
    <nav><button onClick={()=>setAppsOpen(true)}>AAIQ Apps</button>{(!allowedModules||allowedModules.has("AAIQ_ACTION_CENTER"))&&<Link href="/action-center">Actions</Link>}{(!allowedModules||allowedModules.has("AAIQ_REPORTING"))&&<Link href="/reports">Reports</Link>}{(!allowedModules||allowedModules.has("AAIQ_USER_MANAGEMENT"))&&<Link href="/aaiq-user-management">Access</Link>}</nav>
   </header>
   <div className="aaiq-module-context"><div><small>{activeGroup}</small><strong>{activeItem.label}</strong></div><span><i/> Clocked in · workspace ready</span></div>
   <div className="aaiq-shell-content">{children}</div>
  </section>
  {propertyOpen&&<div className="context-overlay" role="dialog" aria-modal="true" aria-label="Property and location switcher"><section className="context-dialog"><header><div><small>AAIQ Property Context</small><h2>Choose a property</h2><p>All tasks, rooms, reports, inventory and alerts will refresh to the selected property.</p></div><button onClick={()=>setPropertyOpen(false)} aria-label="Close">×</button></header><input autoFocus value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search property, code, city or brand"/><div className="property-choice-list">{properties.map(property=><button key={property.id} className={property.id===context?.property?.id?"selected":""} disabled={Boolean(switching)} onClick={()=>void switchProperty(property.id)}><span><b>{property.name}</b><small>{property.address||"Address not configured"}</small></span><span><strong>{property.code}</strong><small>{property.id===context?.property?.id?"Current property":switching===property.id?"Switching…":property.status??"ACTIVE"}</small></span></button>)}</div><footer><span>{properties.length} authorized propert{properties.length===1?"y":"ies"}</span>{context?.role==="admin"&&<Link href="/aaiq-asset-registry">Manage properties & locations →</Link>}</footer></section></div>}
  {appsOpen&&<div className="context-overlay" role="dialog" aria-modal="true" aria-label="AAIQ department applications"><section className="context-dialog app-launcher"><header><div><small>Shared core · focused workspaces</small><h2>AAIQ Apps by function</h2><p>Choose a functional group. Every app uses the same identity, property data, workflows, reporting and audit history.</p></div><button onClick={()=>setAppsOpen(false)} aria-label="Close">×</button></header><div className="app-group-tabs" role="tablist">{["Operations","People","Growth","Management"].map(group=><button role="tab" aria-selected={appsGroup===group} className={appsGroup===group?"active":""} onClick={()=>setAppsGroup(group)} key={group}>{group}</button>)}</div><div className="app-launch-grid">{departmentApps.filter(app=>app.group===appsGroup&&(!allowedModules||allowedModules.has(app.key))).map(app=><Link href={app.href} key={app.href}><i>AA</i><span><b>{app.name}</b><small>{app.description}</small><em>{context?.property?.code??"PROPERTY"} · Open app</em></span></Link>)}</div></section></div>}
 </div>
}
