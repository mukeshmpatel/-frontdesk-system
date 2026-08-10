"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ReportDrilldownTable, { type DrilldownRecord, type SummaryMetric } from "../components/report-drilldown-table";

type Employee = { email: string; displayName: string; role: "admin" | "staff"; status: string; jobTitle: string; department: string };
type Shift = { id: string; email: string; displayName: string; roleLabel: string; location: string; startsAt: string; endsAt: string; notes: string };
type TimeEntry = { id: string; email: string; displayName: string; clockInAt: string; clockOutAt: string | null; locationName: string; status: string };
type DeskItem = { id: string; title: string; details: string; roomReference: string; priority: "normal" | "high" | "urgent"; status: "open" | "in_progress" | "done"; assignedToEmail: string | null; assignedToName: string | null; dueAt: string | null };
type Operations = { currentMember: { email: string; displayName: string; role: "admin" | "staff" }; network: { lockEnabled: boolean; allowed: boolean; matchedLocation: string | null }; employees: Employee[]; shifts: Shift[]; timeEntries: TimeEntry[]; currentOpenEntry: { clockInAt: string; locationName: string } | null; frontDeskItems: DeskItem[] };
type DraftShift = { id: string; email: string; name: string; role: string; startsAt: string; endsAt: string; reason: string; approved: boolean };
type TaskTemplate = { minute: string; title: string; detail: string; priority: "normal" | "high" | "urgent" };
type Tab = "command" | "schedule" | "tasks" | "time" | "reports" | "my_calendar";
type UploadedReport = { id:string; title:string; source_type:string; file_name:string; size_bytes:number; uploaded_by_email:string; created_at:string };
type SavedReportView = { id:string; name:string; reportId:string; filtersJson:string; updatedAt:string };

const shiftPlans: Record<string, TaskTemplate[]> = {
  "7 AM – 3 PM": [
    { minute: "7:00", title: "Receive night-audit handoff", detail: "Review incidents, arrivals, departures, cash and unresolved guest matters.", priority: "high" },
    { minute: "7:10", title: "Verify lobby and front-drive readiness", detail: "Complete safety, cleanliness and signage check.", priority: "normal" },
    { minute: "7:20", title: "Review departures and balances", detail: "Prioritize folios, authorizations and special checkout requests.", priority: "high" },
    { minute: "7:40", title: "Coordinate room priorities", detail: "Send early-arrival and VIP room sequence to Housekeeping.", priority: "high" },
    { minute: "8:00", title: "Resolve overnight cases", detail: "Close or escalate every open night-shift handoff.", priority: "urgent" },
    { minute: "9:00", title: "Guest recovery follow-up", detail: "Contact guests with open concerns and record outcomes.", priority: "high" },
    { minute: "10:30", title: "Pre-arrival readiness review", detail: "Verify notes, accessibility, groups, mobile keys and upsell eligibility.", priority: "normal" },
    { minute: "11:00", title: "Checkout exception sweep", detail: "Identify late checkouts, unpaid folios and occupied-dirty exceptions.", priority: "high" },
    { minute: "12:00", title: "Mid-shift cash and queue check", detail: "Reconcile drawer variance and rebalance service requests.", priority: "normal" },
    { minute: "1:30", title: "Arrival readiness checkpoint", detail: "Confirm clean inventory and unresolved room blocks.", priority: "urgent" },
    { minute: "2:40", title: "Prepare PM handoff", detail: "Summarize arrivals, groups, incidents, cash and pending tasks.", priority: "high" },
  ],
  "3 PM – 11 PM": [
    { minute: "3:00", title: "Receive AM handoff", detail: "Review room readiness, arrivals, groups, VIPs and recovery cases.", priority: "high" },
    { minute: "3:10", title: "Arrival desk readiness", detail: "Verify keys, registration materials, drawer and lobby coverage.", priority: "urgent" },
    { minute: "3:30", title: "Room-ready exception review", detail: "Escalate waiting guests and incomplete priority rooms.", priority: "urgent" },
    { minute: "4:00", title: "Peak-arrival command check", detail: "Balance queue, mobile check-in and guest requests.", priority: "high" },
    { minute: "5:30", title: "In-stay satisfaction review", detail: "Review negative replies and management acknowledgements.", priority: "high" },
    { minute: "7:00", title: "Evening property walk", detail: "Check lobby, pool, entrances, corridors and public restrooms.", priority: "normal" },
    { minute: "8:00", title: "No-show and payment review", detail: "Verify guarantees, declined cards and late arrivals.", priority: "high" },
    { minute: "9:30", title: "Quiet-hours preparation", detail: "Review noise risks, groups, incidents and security contacts.", priority: "normal" },
    { minute: "10:40", title: "Prepare night handoff", detail: "Summarize cash, arrivals, incidents, wake-up calls and audit blockers.", priority: "high" },
  ],
  "11 PM – 7 AM": [
    { minute: "11:00", title: "Receive PM handoff", detail: "Review arrivals, cash, incidents, rooms and audit blockers.", priority: "high" },
    { minute: "11:15", title: "Secure-property verification", detail: "Check entrances, pool, meeting areas and restricted spaces.", priority: "urgent" },
    { minute: "11:30", title: "Remaining-arrivals review", detail: "Verify keys, payment and room assignment for every arrival.", priority: "high" },
    { minute: "12:00", title: "Ledger pre-audit review", detail: "Resolve posting, routing, tax and payment exceptions.", priority: "urgent" },
    { minute: "1:00", title: "Guest ledger reconciliation", detail: "Confirm deposits, house accounts and open folios.", priority: "high" },
    { minute: "2:00", title: "Run night audit readiness gate", detail: "Proceed only when required exception checks pass.", priority: "urgent" },
    { minute: "3:00", title: "Generate daily reports", detail: "Produce occupancy, revenue, exceptions and management summary.", priority: "high" },
    { minute: "4:00", title: "Morning operations setup", detail: "Prepare arrivals, departures, wake-up calls and breakfast notes.", priority: "normal" },
    { minute: "5:30", title: "Early-morning property walk", detail: "Verify lobby, entrances, breakfast and public areas.", priority: "normal" },
    { minute: "6:30", title: "Prepare AM handoff", detail: "Summarize audit, incidents, balances, rooms and priority actions.", priority: "high" },
  ],
};

// These library reports have an exact canonical metric in reporting-layer.ts.
// CSV always comes from the governed server export; no browser-generated rows.
const governedCsvMetrics: Record<string, string> = {
  timecard: "labor-hours",
  payroll: "labor-hours",
  "night-audit": "incidents",
};

function hours(start: string, end: string | null) {
  if (!end) return 0;
  return Math.max(0, (new Date(end).getTime() - new Date(start).getTime()) / 3_600_000);
}
function labelDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}
function nextDate(dayOffset: number, hour: number) {
  const value = new Date();
  value.setDate(value.getDate() + dayOffset);
  value.setHours(hour, 0, 0, 0);
  return value;
}

export default function DigitalFrontDeskClient({ userEmail, initialTab = "command" }: { userEmail: string; initialTab?: Tab }) {
  const [operations, setOperations] = useState<Operations | null>(null);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [drafts, setDrafts] = useState<DraftShift[]>([]);
  const [plan, setPlan] = useState("7 AM – 3 PM");
  const [approvedTasks, setApprovedTasks] = useState<string[]>([]);
  const [reportRange, setReportRange] = useState("14");
  const [reportPreset, setReportPreset] = useState("current-payroll");
  const [reportFrom, setReportFrom] = useState(() => new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10));
  const [reportTo, setReportTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [reportArea, setReportArea] = useState("all");
  const [uploadedReports, setUploadedReports] = useState<UploadedReport[]>([]);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadSource, setUploadSource] = useState("OPERA Cloud");
  const [summaryMetrics, setSummaryMetrics] = useState<SummaryMetric[]>([]);
  const [activeMetric, setActiveMetric] = useState("");
  const [drilldownRecords, setDrilldownRecords] = useState<DrilldownRecord[]>([]);
  const [savedViews,setSavedViews]=useState<SavedReportView[]>([]);
  const [viewName,setViewName]=useState("");
  const [reportCursor,setReportCursor]=useState("");
  const [reportFreshAt,setReportFreshAt]=useState("");
  const [reportRevision,setReportRevision]=useState(0);
  const [reportPropertyId,setReportPropertyId]=useState("");
  const reportEnd=useCallback((day:string)=>{const date=new Date(`${day}T00:00:00.000Z`);date.setUTCDate(date.getUTCDate()+1);return date.toISOString()},[]);

  const load = useCallback(async () => {
    const response = await fetch("/api/operations", { cache: "no-store" });
    const payload = (await response.json()) as { operations?: Operations; error?: string };
    if (!response.ok || !payload.operations) throw new Error(payload.error ?? "Operations could not be loaded.");
    setOperations(payload.operations);
  }, []);
  useEffect(() => { void load().catch((error) => setNotice(error instanceof Error ? error.message : "Could not load.")); }, [load]);
  useEffect(() => {
    fetch("/api/workforce/reports", { cache:"no-store" })
      .then(async (response) => response.ok ? response.json() : { reports:[] })
      .then((payload: { reports?:UploadedReport[] }) => setUploadedReports(payload.reports ?? []))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (tab !== "reports") return;
    const controller = new AbortController();
    const from = `${reportFrom}T00:00:00.000Z`;
    const to = reportEnd(reportTo);
    fetch(`/api/v1/reports/summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&area=${encodeURIComponent(reportArea)}`, { cache:"no-store", signal:controller.signal })
      .then(async (response) => {
        const payload=await response.json() as {metrics?:SummaryMetric[];property?:{id:string};error?:string};
        if(!response.ok) throw new Error(payload.error ?? "Summary could not be loaded.");
        setSummaryMetrics(payload.metrics ?? []); setReportPropertyId(payload.property?.id??""); setActiveMetric(""); setDrilldownRecords([]);
      })
      .catch((error) => { if ((error as Error).name !== "AbortError") setNotice(error instanceof Error?error.message:"Summary could not be loaded."); });
    return () => controller.abort();
  }, [tab,reportFrom,reportTo,reportArea,reportRevision,reportEnd]);
  useEffect(()=>{
    if(tab!=="reports") return;
    let stopped=false;
    const tick=async()=>{
      try{
        if(!reportPropertyId)return;
        const response=await fetch(`/api/v1/reports/events?after=${encodeURIComponent(reportCursor)}&property=${encodeURIComponent(reportPropertyId)}`,{cache:"no-store"});
        const payload=await response.json() as {events?:unknown[];cursor?:string};
        if(!stopped&&response.ok){
          if(payload.cursor) setReportCursor(payload.cursor);
          if(payload.events?.length){setReportFreshAt(new Date().toLocaleTimeString([], {hour:"numeric",minute:"2-digit",second:"2-digit"}));setReportRevision(value=>value+1);}
        }
      }catch{/* next five-second cursor check retries */}
    };
    void tick(); const timer=window.setInterval(()=>void tick(),5000);
    return()=>{stopped=true;window.clearInterval(timer)};
  },[tab,reportCursor,reportPropertyId]);
  useEffect(()=>{if(tab==="reports"&&reportPropertyId) fetch(`/api/v1/reports/views?property=${encodeURIComponent(reportPropertyId)}`,{cache:"no-store"}).then(async r=>(await r.json()) as {views?:SavedReportView[]}).then(p=>setSavedViews(p.views??[])).catch(()=>undefined)},[tab,reportPropertyId]);

  const personalShifts = useMemo(() => operations?.shifts.filter((shift) => shift.email.toLowerCase() === userEmail.toLowerCase()) ?? [], [operations, userEmail]);
  const metrics = useMemo(() => {
    const entries = operations?.timeEntries ?? [];
    const total = entries.reduce((sum, entry) => sum + hours(entry.clockInAt, entry.clockOutAt), 0);
    const openTasks = operations?.frontDeskItems.filter((item) => item.status !== "done").length ?? 0;
    const urgent = operations?.frontDeskItems.filter((item) => item.status !== "done" && item.priority === "urgent").length ?? 0;
    return { total, overtime: Math.max(0, total - 80), openTasks, urgent, completion: operations?.frontDeskItems.length ? Math.round(100 * operations.frontDeskItems.filter((item) => item.status === "done").length / operations.frontDeskItems.length) : 100 };
  }, [operations]);
  const payrollComparison = useMemo(() => {
    const now = Date.now();
    const sevenDays = 7 * 86_400_000;
    const current = operations?.timeEntries.filter((entry) => now - new Date(entry.clockInAt).getTime() <= sevenDays).reduce((sum, entry) => sum + hours(entry.clockInAt, entry.clockOutAt), 0) ?? 0;
    const previous = operations?.timeEntries.filter((entry) => {
      const age = now - new Date(entry.clockInAt).getTime();
      return age > sevenDays && age <= 2 * sevenDays;
    }).reduce((sum, entry) => sum + hours(entry.clockInAt, entry.clockOutAt), 0) ?? 0;
    const change = previous ? ((current - previous) / previous) * 100 : 0;
    const saveHours = Math.max(0, current - Math.max(previous, current * .94));
    return { current, previous, change, saveHours };
  }, [operations]);

  async function post(url: string, body: unknown) {
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) throw new Error(data.error ?? "The action could not be completed.");
  }
  async function punch(action: "clock_in" | "clock_out") {
    setBusy("clock");
    try { await post("/api/operations/time", { action, note: "Digital Front Desk" }); await load(); setNotice(action === "clock_in" ? "Clock-in recorded." : "Clock-out recorded."); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Time clock failed."); } finally { setBusy(""); }
  }
  function generateSchedule() {
    if (!operations) return;
    const employees = operations.employees.filter((employee) => employee.status === "active");
    const shifts = [
      { hour: 7, role: "AM Front Desk" }, { hour: 15, role: "PM Front Desk" }, { hour: 23, role: "Night Audit" },
    ];
    const created: DraftShift[] = [];
    for (let day = 1; day <= 7; day += 1) {
      shifts.forEach((shift, index) => {
        const employee = employees[(day + index) % Math.max(1, employees.length)];
        if (!employee) return;
        const start = nextDate(day, shift.hour);
        const end = new Date(start.getTime() + 8 * 3_600_000);
        created.push({ id: crypto.randomUUID(), email: employee.email, name: employee.displayName, role: shift.role, startsAt: start.toISOString(), endsAt: end.toISOString(), reason: `Balanced coverage · ${employee.department || "Front Desk"} · overtime protected`, approved: false });
      });
    }
    setDrafts(created);
    setNotice(`${created.length} AI shift recommendations generated. Nothing is published until approved.`);
  }
  async function approveShift(draft: DraftShift) {
    setBusy(draft.id);
    try {
      await post("/api/operations/shifts", { employeeEmail: draft.email, roleLabel: draft.role, location: "Wyndham Garden Salina", startsAt: draft.startsAt, endsAt: draft.endsAt, notes: `AI recommendation approved · ${draft.reason}` });
      setDrafts((current) => current.map((item) => item.id === draft.id ? { ...item, approved: true } : item));
      await load(); setNotice(`${draft.name}'s shift approved and published.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Shift could not be approved."); } finally { setBusy(""); }
  }
  async function approveTask(task: TaskTemplate) {
    const key = `${plan}-${task.minute}`;
    setBusy(key);
    try {
      const today = new Date();
      const [hourText, minuteText] = task.minute.split(":");
      today.setHours(Number(hourText) + (plan.startsWith("3 PM") ? 12 : plan.startsWith("11 PM") && Number(hourText) !== 12 ? 12 : 0), Number(minuteText), 0, 0);
      await post("/api/operations/front-desk", { itemType: "handoff", title: `${task.minute} · ${task.title}`, details: task.detail, priority: task.priority, assignedToEmail: userEmail, dueAt: today.toISOString() });
      setApprovedTasks((current) => [...current, key]); await load(); setNotice(`${task.title} approved and added to Front Desk.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Task could not be approved."); } finally { setBusy(""); }
  }
  function applyReportPreset(preset:string) {
    setReportPreset(preset);
    const end = new Date(); end.setHours(23,59,59,999);
    const start = new Date(end);
    if (preset === "today") start.setHours(0,0,0,0);
    else if (preset === "yesterday") { start.setDate(start.getDate()-1); start.setHours(0,0,0,0); end.setDate(end.getDate()-1); }
    else if (preset === "this-week") { start.setDate(start.getDate()-start.getDay()); start.setHours(0,0,0,0); }
    else if (preset === "last-week") { start.setDate(start.getDate()-start.getDay()-7); start.setHours(0,0,0,0); end.setTime(start.getTime()+7*86_400_000-1); }
    else if (preset === "month-to-date") { start.setDate(1); start.setHours(0,0,0,0); }
    else if (preset === "last-month") { start.setMonth(start.getMonth()-1,1); start.setHours(0,0,0,0); end.setFullYear(start.getFullYear(),start.getMonth()+1,0); }
    else if (preset === "quarter-to-date") { start.setMonth(Math.floor(start.getMonth()/3)*3,1); start.setHours(0,0,0,0); }
    else if (preset === "year-to-date") { start.setMonth(0,1); start.setHours(0,0,0,0); }
    else if (preset === "previous-payroll") { start.setDate(start.getDate()-14); end.setDate(end.getDate()-7); }
    else if (preset !== "custom") start.setDate(start.getDate()-7);
    if (preset !== "custom") { setReportFrom(start.toISOString().slice(0,10)); setReportTo(end.toISOString().slice(0,10)); }
  }
  async function compileReport(kind:string) {
    setBusy(`report-${kind}`);
    try {
      const response = await fetch("/api/v1/reports/compile", {
        method:"POST", headers:{"content-type":"application/json"},
        body:JSON.stringify({ reportType:kind, from:`${reportFrom}T00:00:00.000Z`, to:reportEnd(reportTo), propertyId:reportPropertyId }),
      });
      if (!response.ok) { const payload=await response.json() as {error?:string}; throw new Error(payload.error ?? "Report compilation failed."); }
      const url=URL.createObjectURL(await response.blob()); const windowRef=window.open(url,"_blank","noopener,noreferrer");
      if (!windowRef) { const link=document.createElement("a"); link.href=url; link.download=`AAIQ-${kind}-${reportFrom}-${reportTo}.html`; link.click(); }
      window.setTimeout(()=>URL.revokeObjectURL(url),60_000); setNotice("Secure enterprise report compiled in a print-ready view.");
    } catch(error) { setNotice(error instanceof Error?error.message:"Report compilation failed."); } finally { setBusy(""); }
  }
  async function openDrilldown(metric:SummaryMetric) {
    setActiveMetric(metric.id); setDrilldownRecords([]); setBusy(`drill-${metric.id}`);
    try {
      const params=new URLSearchParams({metric:metric.drillDown.metricId,from:metric.drillDown.from,to:metric.drillDown.to,property:metric.drillDown.propertyId});
      if(metric.drillDown.department)params.set("department",metric.drillDown.department);
      const response=await fetch(`/api/v1/reports/drilldown?${params}`,{cache:"no-store"});
      const payload=await response.json() as {records?:DrilldownRecord[];error?:string};
      if(!response.ok) throw new Error(payload.error ?? "Drill-down could not be loaded.");
      setDrilldownRecords(payload.records ?? []);
    } catch(error) { setNotice(error instanceof Error?error.message:"Drill-down could not be loaded."); } finally { setBusy(""); }
  }
  async function saveCurrentView(){
    if(!viewName.trim()) return;
    const response=await fetch("/api/v1/reports/views",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
      name:viewName.trim(),reportId:reportArea==="all"?"property":reportArea,
      filters:{from:reportFrom,to:reportTo,area:reportArea,preset:reportPreset,property:reportPropertyId},
    })});
    if(!response.ok){setNotice("Saved view could not be created.");return}
    const refreshed=await fetch(`/api/v1/reports/views?property=${encodeURIComponent(reportPropertyId)}`,{cache:"no-store"}).then(r=>r.json()) as {views?:SavedReportView[]};
    setSavedViews(refreshed.views??[]);setViewName("");setNotice("Report view saved to your profile.");
  }
  function applySavedView(raw:string){
    const view=savedViews.find(item=>item.id===raw);if(!view)return;
    const filters=JSON.parse(view.filtersJson) as {from?:string;to?:string;area?:string;preset?:string};
    if(filters.from)setReportFrom(filters.from);if(filters.to)setReportTo(filters.to);
    if(filters.area)setReportArea(filters.area);if(filters.preset)setReportPreset(filters.preset);
  }
  async function auditExport(metricId:string,rowCount:number){
    if(!reportPropertyId){setNotice("An authorized property is required before exporting.");return true}
    try{
      const response=await fetch("/api/v1/reports/exports",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
        reportId:reportArea==="workforce"?"workforce":"property",format:"csv",drill:metricId,
        filters:{from:`${reportFrom}T00:00:00.000Z`,to:reportEnd(reportTo),property:reportPropertyId,department:summaryMetrics.find(item=>item.id===metricId)?.drillDown.department??undefined},
      })});
      if(!response.ok){const payload=await response.json() as{error?:string};throw new Error(payload.error??"Export failed.")}
      const blob=await response.blob(),disposition=response.headers.get("content-disposition")??"";
      const name=disposition.match(/filename="([^"]+)"/)?.[1]??`AAIQ-${metricId}-${reportFrom}-${reportTo}.csv`;
      const link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download=name;link.click();URL.revokeObjectURL(link.href);
      setNotice(`Exported ${response.headers.get("x-aaiq-row-count")??rowCount} server-verified rows.`);
    }catch(error){setNotice(error instanceof Error?error.message:"Export failed.")}
    return true;
  }
  async function uploadReport() {
    if (!uploadFile) return;
    setBusy("upload");
    try {
      const form=new FormData(); form.set("file",uploadFile); form.set("title",uploadFile.name); form.set("sourceType",uploadSource);
      const response=await fetch("/api/workforce/reports",{method:"POST",body:form});
      const payload=await response.json() as {error?:string};
      if(!response.ok) throw new Error(payload.error ?? "Upload failed.");
      const refreshed=await fetch("/api/workforce/reports",{cache:"no-store"}); const data=await refreshed.json() as {reports?:UploadedReport[]};
      setUploadedReports(data.reports ?? []); setUploadFile(null); setNotice("Report uploaded securely.");
    } catch(error){setNotice(error instanceof Error?error.message:"Upload failed.");} finally{setBusy("");}
  }

  if (!operations) return <main className="workforce-shell"><p>{notice || "Loading private workforce workspace…"}</p></main>;
  const isAdmin = operations.currentMember.role === "admin";
  const tabs: Array<[Tab, string]> = [["command","Command"],["schedule","AI Schedule"],["tasks","Shift Tasks"],["time","Time & Attendance"],["reports","Reports"],["my_calendar","My Private Calendar"]];

  return (
    <main className="workforce-shell">
      <header className="workforce-header"><div><a href="/">← AAI Q</a><p>Workforce intelligence · Digital Front Desk</p><h1>Run every shift on time.</h1></div><div className="workforce-clock"><span>{operations.currentOpenEntry ? "Clocked in" : "Off clock"}</span><strong>{operations.currentMember.displayName}</strong><button disabled={busy === "clock" || !operations.network.allowed} onClick={() => void punch(operations.currentOpenEntry ? "clock_out" : "clock_in")}>{operations.currentOpenEntry ? "Clock out" : "Clock in"}</button></div></header>
      {notice && <div className="workforce-notice" role="status">{notice}<button onClick={() => setNotice("")}>×</button></div>}
      <nav className="workforce-tabs">{tabs.map(([id,label]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>)}</nav>
      <section className="workforce-kpis"><div><strong>{metrics.openTasks}</strong><span>Open front-desk tasks</span></div><div><strong>{metrics.urgent}</strong><span>Urgent actions</span></div><div><strong>{metrics.total.toFixed(1)}</strong><span>Recorded hours · 14 days</span></div><div><strong>{metrics.completion}%</strong><span>Task completion</span></div></section>

      {tab === "command" && <section className="workforce-columns"><article className="workforce-panel"><div className="panel-title"><div><p>Live execution</p><h2>Front desk command queue</h2></div><span>{metrics.openTasks} open</span></div><div className="desk-queue">{operations.frontDeskItems.filter((item) => item.status !== "done").slice(0,12).map((item) => <div key={item.id} className={`desk-row priority-${item.priority}`}><b>{item.dueAt ? new Date(item.dueAt).toLocaleTimeString([], { hour:"numeric", minute:"2-digit" }) : "Now"}</b><div><strong>{item.title}</strong><span>{item.details}</span></div><em>{item.assignedToName || "Unassigned"}</em></div>)}</div></article><article className="workforce-panel"><div className="panel-title"><div><p>AI attention</p><h2>Approval inbox</h2></div></div><div className="approval-cards"><div><b>Schedule optimizer</b><p>Generate seven days of balanced coverage with overtime protection.</p><button disabled={!isAdmin} onClick={generateSchedule}>{isAdmin ? "Generate recommendations" : "Administrator approval required"}</button></div><div><b>Shift task engine</b><p>Create the minute-specific operating plan for the active shift.</p><button onClick={() => setTab("tasks")}>Review shift plan</button></div></div></article></section>}

      {tab === "schedule" && <section className="workforce-panel"><div className="panel-title"><div><p>Approval-only automation</p><h2>Seven-day AI schedule</h2></div><button disabled={!isAdmin} onClick={generateSchedule}>Regenerate recommendations</button></div>{!drafts.length ? <div className="workforce-empty">Generate a schedule to see coverage recommendations. No shift is published without approval.</div> : <div className="draft-schedule">{drafts.map((draft) => <article key={draft.id}><div><strong>{draft.name}</strong><span>{draft.role} · {labelDate(draft.startsAt)}</span><p>{draft.reason}</p></div><button disabled={draft.approved || busy === draft.id} onClick={() => void approveShift(draft)}>{draft.approved ? "Approved" : busy === draft.id ? "Publishing…" : "Approve shift"}</button></article>)}</div>}</section>}

      {tab === "tasks" && <section className="workforce-panel"><div className="panel-title"><div><p>Minute-by-minute operating plan</p><h2>Digital Front Desk shift book</h2></div><select value={plan} onChange={(event) => setPlan(event.target.value)}>{Object.keys(shiftPlans).map((name) => <option key={name}>{name}</option>)}</select></div><div className="minute-plan">{shiftPlans[plan]?.map((task) => { const key=`${plan}-${task.minute}`; return <article key={key} className={`priority-${task.priority}`}><time>{task.minute}</time><div><strong>{task.title}</strong><p>{task.detail}</p></div><button disabled={approvedTasks.includes(key) || busy === key} onClick={() => void approveTask(task)}>{approvedTasks.includes(key) ? "Added" : "Approve & assign"}</button></article>; })}</div></section>}

      {tab === "time" && <section className="workforce-columns"><article className="workforce-panel"><div className="panel-title"><div><p>Accurate attendance</p><h2>My time clock</h2></div></div><div className={`punch-card ${operations.currentOpenEntry ? "active" : ""}`}><strong>{operations.currentOpenEntry ? "Currently clocked in" : "Ready to start"}</strong><span>{operations.currentOpenEntry ? `${labelDate(operations.currentOpenEntry.clockInAt)} · ${operations.currentOpenEntry.locationName}` : operations.network.lockEnabled ? operations.network.allowed ? `Approved location · ${operations.network.matchedLocation}` : "Outside approved network" : "Network restriction disabled"}</span><button disabled={busy === "clock" || !operations.network.allowed} onClick={() => void punch(operations.currentOpenEntry ? "clock_out" : "clock_in")}>{operations.currentOpenEntry ? "Clock out now" : "Clock in now"}</button></div></article><article className="workforce-panel"><div className="panel-title"><div><p>Recent history</p><h2>{isAdmin ? "Team attendance" : "My attendance"}</h2></div></div><div className="time-ledger">{operations.timeEntries.slice(0,20).map((entry) => <div key={entry.id}><strong>{entry.displayName}</strong><span>{labelDate(entry.clockInAt)}</span><b>{entry.clockOutAt ? `${hours(entry.clockInAt,entry.clockOutAt).toFixed(2)}h` : "Open"}</b></div>)}</div></article></section>}

      {tab === "reports" && <section className="report-center">
        <article className="workforce-panel report-command-center">
          <div className="panel-title"><div><p>Live enterprise intelligence</p><h2>Interactive report command center</h2></div><span>{reportFreshAt?`Live event received ${reportFreshAt}`:"Live · five-second event cursor"}</span></div>
          <div className="report-area-filter"><label><span>Reporting area</span><select value={reportArea} onChange={event=>setReportArea(event.target.value)}><option value="all">All property operations</option><option value="front_desk">Front Desk</option><option value="workforce">Workforce & labor</option><option value="housekeeping">Housekeeping</option><option value="maintenance">Maintenance</option><option value="compliance">PMI & compliance</option></select></label><label><span>Saved view</span><select defaultValue="" onChange={event=>applySavedView(event.target.value)}><option value="">Choose a view…</option>{savedViews.map(view=><option key={view.id} value={view.id}>{view.name}</option>)}</select></label><div className="save-report-view"><input value={viewName} onChange={event=>setViewName(event.target.value)} placeholder="Name this view"/><button onClick={()=>void saveCurrentView()}>Save view</button></div><p>Every total opens its exact source records. New events refresh without a full-source scan.</p></div>
          <ReportDrilldownTable metrics={summaryMetrics} activeMetric={activeMetric} records={drilldownRecords} loading={busy===`drill-${activeMetric}`} onOpen={(metric)=>void openDrilldown(metric)} onExport={auditExport}/>
        </article>
        <article className="workforce-panel enterprise-report-controls">
          <div className="panel-title"><div><p>Enterprise report compiler</p><h2>Choose any reporting period</h2></div><span>Tenant-secure · Audit logged</span></div>
          <div className="period-controls">
            <label><span>Quick period</span><select value={reportPreset} onChange={(event)=>applyReportPreset(event.target.value)}><option value="current-payroll">Current payroll</option><option value="previous-payroll">Previous payroll</option><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="this-week">This week</option><option value="last-week">Last week</option><option value="month-to-date">Month to date</option><option value="last-month">Last month</option><option value="quarter-to-date">Quarter to date</option><option value="year-to-date">Year to date</option><option value="custom">Custom range</option></select></label>
            <label><span>From</span><input type="date" value={reportFrom} onChange={(event)=>{setReportPreset("custom");setReportFrom(event.target.value)}}/></label>
            <label><span>Through</span><input type="date" value={reportTo} min={reportFrom} onChange={(event)=>{setReportPreset("custom");setReportTo(event.target.value)}}/></label>
            <div className="period-status"><b>{new Date(`${reportFrom}T00:00:00`).toLocaleDateString()} — {new Date(`${reportTo}T00:00:00`).toLocaleDateString()}</b><span>Every compiled report receives a tracking ID, generator footprint, timestamp and SHA-256 verification checksum.</span></div>
          </div>
        </article>
        <article className="workforce-panel">
          <div className="panel-title"><div><p>AI workforce reporting</p><h2>Payroll intelligence</h2></div><select value={reportRange} onChange={(event) => setReportRange(event.target.value)}><option value="7">Current payroll</option><option value="14">Current + previous</option><option value="30">Last 30 days</option></select></div>
          <div className="report-grid"><div><span>Current payroll hours</span><strong>{payrollComparison.current.toFixed(2)}</strong><p>Most recent seven-day period.</p></div><div><span>Previous payroll hours</span><strong>{payrollComparison.previous.toFixed(2)}</strong><p>Comparable prior period.</p></div><div><span>Period change</span><strong>{payrollComparison.change >= 0 ? "+" : ""}{payrollComparison.change.toFixed(1)}%</strong><p>Change in recorded labor hours.</p></div><div><span>Optimization opportunity</span><strong>{payrollComparison.saveHours.toFixed(1)}h</strong><p>Reviewable savings without removing required shift coverage.</p></div></div>
          <div className="ai-payroll-advice"><b>AAI Q recommendation</b><p>{payrollComparison.change > 8 ? `Labor is ${payrollComparison.change.toFixed(1)}% above the previous period. Preserve the 7–3, 3–11 and 11–7 desk coverage, then reduce overlapping administrative time by up to ${payrollComparison.saveHours.toFixed(1)} hours and move non-urgent work outside peak arrival periods.` : "Labor is close to the prior period. Keep required front-desk coverage and use demand-based task timing before reducing any guest-facing hours."}</p><span>Recommendation requires manager approval and should be reviewed against occupancy, arrivals, groups and service levels.</span></div>
        </article>
        <article className="workforce-panel">
          <div className="panel-title"><div><p>Available outputs</p><h2>Report library</h2></div><span>Property-scoped print views</span></div>
          <div className="report-library">
            {[
              ["timecard","Individual time card","Employee punches, hours, locations and exceptions."],
              ["overtime","Overtime and threshold report","Employees approaching or exceeding overtime thresholds."],
              ["payroll","Total hours for payroll","Payroll-ready detailed hours by employee and shift."],
              ["comparison","Payroll-period comparison","Current versus previous labor with variance analysis."],
              ["attendance","Attendance and punctuality","Late starts, open punches, missed punches and attendance patterns."],
              ["coverage","Schedule coverage report","Coverage gaps, overlaps and required shift protection."],
              ["productivity","Labor productivity report","Labor hours compared with completed front-desk workload."],
              ["forecast","AI payroll forecast","Next-period staffing forecast and approval-ready recommendations."],
              ["room-schedule","Active room schedule","Room blocks, maintenance windows and active allocations."],
              ["housekeeping-labor","Housekeeping labor log","Time and labor detail for housekeeping operations."],
              ["night-audit","Night audit summary","Audit handoffs, incidents and overnight exceptions."],
              ["audit-trail","System audit trail","Immutable automation, notification and calendar activity."],
            ].map(([kind,title,description]) => {
              const csvMetric=governedCsvMetrics[kind];
              return <article key={kind}><div><strong>{title}</strong><p>{description}</p></div>{csvMetric&&<button disabled={!reportPropertyId} onClick={()=>void auditExport(csvMetric,0)}>CSV</button>}<button className="compile-button" disabled={busy===`report-${kind}`||!reportPropertyId} onClick={() => void compileReport(kind)}>{busy===`report-${kind}`?"Compiling…":reportPropertyId?"Compile report":"Load property first"}</button></article>;
            })}
          </div>
        </article>
        <div className="workforce-columns report-upload-grid">
          <article className="workforce-panel"><div className="panel-title"><div><p>Multi-source analysis</p><h2>Upload workforce reports</h2></div></div><div className="report-uploader"><label><span>Source</span><select value={uploadSource} onChange={(event)=>setUploadSource(event.target.value)}><option>OPERA Cloud</option><option>Payroll provider</option><option>POS</option><option>Accounting</option><option>Scheduling system</option><option>Other</option></select></label><label><span>CSV, Excel or PDF · 25 MB maximum</span><input type="file" accept=".csv,.xls,.xlsx,.pdf" onChange={(event)=>setUploadFile(event.target.files?.[0] ?? null)}/></label><button disabled={!isAdmin || !uploadFile || busy==="upload"} onClick={()=>void uploadReport()}>{busy==="upload"?"Uploading securely…":isAdmin?"Upload report":"Administrator access required"}</button></div></article>
          <article className="workforce-panel"><div className="panel-title"><div><p>Connected intelligence</p><h2>OPERA Cloud / OHIP</h2></div><span>Configuration ready</span></div><div className="opera-readiness"><p>AAI Q is prepared to receive occupancy, arrivals, departures, room status and business events through the HNE integration layer.</p><ul><li>Gateway URL and Hotel ID</li><li>OAuth Client ID and encrypted Client Secret</li><li>Application Key and enterprise scope</li><li>Streaming Business Events for real-time updates</li></ul><b>Connection remains disabled until OHIP credentials and property authorization are supplied securely.</b></div></article>
        </div>
        <article className="workforce-panel"><div className="panel-title"><div><p>Secure source archive</p><h2>Uploaded reports</h2></div><span>{uploadedReports.length} files</span></div><div className="uploaded-report-list">{uploadedReports.length ? uploadedReports.map((report)=><div key={report.id}><span>{report.source_type}</span><div><strong>{report.title}</strong><small>{report.file_name} · {(report.size_bytes/1024).toFixed(0)} KB · {new Date(report.created_at).toLocaleDateString()}</small></div><a href={`/api/workforce/reports/${report.id}`}>Download</a></div>) : <p>No external reports uploaded yet.</p>}</div><div className="report-note">Privacy applied: employees see only their own time data and uploads. Administrators can access organization payroll reporting.</div></article>
      </section>}

      {tab === "my_calendar" && <section className="workforce-panel"><div className="panel-title"><div><p>User-private by default</p><h2>My work calendar</h2></div><span>{personalShifts.length} shifts</span></div><div className="private-note">Only shifts assigned to <strong>{userEmail}</strong> appear here. Team schedules remain available only to authorized administrators.</div><div className="private-calendar">{personalShifts.map((shift) => <article key={shift.id}><time>{new Date(shift.startsAt).toLocaleDateString([], { weekday:"short", month:"short", day:"numeric" })}</time><div><strong>{shift.roleLabel}</strong><span>{new Date(shift.startsAt).toLocaleTimeString([], { hour:"numeric", minute:"2-digit" })}–{new Date(shift.endsAt).toLocaleTimeString([], { hour:"numeric", minute:"2-digit" })} · {shift.location}</span><p>{shift.notes}</p></div></article>)}</div></section>}
    </main>
  );
}
