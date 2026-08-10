import { env } from "cloudflare:workers";
import { activeStaffContext } from "./staff";

const DEPARTMENTS = ["FRONT_DESK","HOUSEKEEPING","MAINTENANCE","EXECUTIVE"];
const ROLE_LEVELS = ["ASSOCIATE","SUPERVISOR","MANAGER","CORPORATE"];
const SOURCES = ["ANY_MESSAGE","GMAIL","SMS","TASK","REPORT_EVENT","CALENDAR"];
const ACTIONS = ["CREATE_REMINDER","CREATE_TASK","NOTIFY_ROLE","REQUEST_APPROVAL","ESCALATE"];

function db(): D1Database {
  if (!env.DB) throw new Error("AAI Q automation storage is unavailable.");
  return env.DB;
}
function clean(value: unknown, max = 160) { return String(value ?? "").trim().slice(0,max); }
async function ensureTables() {
  db();
}

export async function automationCenter(userEmail: string) {
  await ensureTables();
  const context = await activeStaffContext(userEmail); if (!context) return null;
  const ruleScope = context.role === "admin" ? "" : " AND created_by_email=?";
  const [rules, policies, briefings, preference] = await Promise.all([
    db().prepare(`SELECT id,name,description,trigger_source AS triggerSource,trigger_condition AS triggerCondition,
      action_type AS actionType,target_department AS targetDepartment,minimum_confidence AS minimumConfidence,
      approval_mode AS approvalMode,urgency,enabled,updated_at AS updatedAt FROM ai_automation_rules
      WHERE organization_id=?${ruleScope} ORDER BY enabled DESC,updated_at DESC`)
      .bind(...(context.role === "admin" ? [context.organizationId] : [context.organizationId,context.email])).all(),
    db().prepare(`SELECT id,name,department,role_level AS roleLevel,delivery_time AS deliveryTime,timezone,
      channels_json AS channelsJson,include_sections_json AS includeSectionsJson,hierarchy_rollup AS hierarchyRollup,
      enabled FROM briefing_policies WHERE organization_id=? ORDER BY department,role_level`)
      .bind(context.organizationId).all(),
    db().prepare(`SELECT id,recipient_email AS recipientEmail,recipient_name AS recipientName,department,
      role_level AS roleLevel,briefing_date AS briefingDate,title,summary,sections_json AS sectionsJson,
      delivery_status AS deliveryStatus,generated_at AS generatedAt,acknowledged_at AS acknowledgedAt
      FROM daily_briefings WHERE organization_id=? AND (?='admin' OR lower(recipient_email)=?)
      ORDER BY briefing_date DESC,recipient_name LIMIT 100`)
      .bind(context.organizationId,context.role,context.email).all(),
    db().prepare(`SELECT timing_mode AS timingMode,shift_offset_minutes AS shiftOffsetMinutes,fixed_time AS fixedTime,
      timezone,summary_only AS summaryOnly FROM briefing_preferences WHERE organization_id=? AND lower(user_email)=?`)
      .bind(context.organizationId,context.email).first(),
  ]);
  return { role: context.role, rules: rules.results, policies: policies.results, briefings: briefings.results,
    preference:preference??{timingMode:"SHIFT_OFFSET",shiftOffsetMinutes:15,fixedTime:null,timezone:"America/Chicago",summaryOnly:0} };
}

export async function createAutomationRule(userEmail:string,input:Record<string,unknown>) {
  await ensureTables(); const context=await activeStaffContext(userEmail);
  if(!context||context.role!=="admin") return null;
  const name=clean(input.name), source=clean(input.triggerSource), action=clean(input.actionType);
  const department=clean(input.targetDepartment), condition=clean(input.triggerCondition,500);
  if(!name||!condition||!SOURCES.includes(source)||!ACTIONS.includes(action)||!DEPARTMENTS.includes(department)) throw new Error("Complete every rule field.");
  const now=new Date().toISOString(),id=crypto.randomUUID();
  await db().prepare(`INSERT INTO ai_automation_rules
    (id,organization_id,name,description,trigger_source,trigger_condition,action_type,target_department,
     minimum_confidence,approval_mode,urgency,enabled,created_by_email,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id,context.organizationId,name,clean(input.description,500),source,condition,action,department,
      Math.max(50,Math.min(100,Number(input.minimumConfidence)||90)),
      input.approvalMode==="AUTO_EXECUTE"?"AUTO_EXECUTE":"REQUIRE_APPROVAL",
      ["LOW","MEDIUM","HIGH","CRITICAL"].includes(clean(input.urgency))?clean(input.urgency):"MEDIUM",
      1,context.email,now,now).run();
  return { id };
}

export async function updateAutomationRule(userEmail:string,id:string,input:Record<string,unknown>) {
  await ensureTables(); const context=await activeStaffContext(userEmail);
  if(!context||context.role!=="admin") return null;
  await db().prepare(`UPDATE ai_automation_rules SET enabled=?,updated_at=? WHERE id=? AND organization_id=?`)
    .bind(input.enabled?1:0,new Date().toISOString(),id,context.organizationId).run();
  return { id, enabled:Boolean(input.enabled) };
}

export async function createBriefingPolicy(userEmail:string,input:Record<string,unknown>) {
  await ensureTables(); const context=await activeStaffContext(userEmail);
  if(!context||context.role!=="admin") return null;
  const department=clean(input.department),roleLevel=clean(input.roleLevel);
  if(!DEPARTMENTS.includes(department)||!ROLE_LEVELS.includes(roleLevel)) throw new Error("Choose a valid department and role level.");
  const channels=Array.isArray(input.channels)?input.channels.filter(v=>["IN_APP","EMAIL","SMS"].includes(String(v))):["IN_APP"];
  const sections=Array.isArray(input.sections)?input.sections.map(v=>clean(v,60)).filter(Boolean):[];
  if(!sections.length) throw new Error("Select at least one briefing section.");
  const now=new Date().toISOString(),id=crypto.randomUUID();
  await db().prepare(`INSERT INTO briefing_policies
    (id,organization_id,name,department,role_level,delivery_time,timezone,channels_json,include_sections_json,
     hierarchy_rollup,enabled,created_by_email,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id,context.organizationId,clean(input.name)||`${department} daily briefing`,department,roleLevel,
      clean(input.deliveryTime)||"07:00",clean(input.timezone)||"America/Chicago",JSON.stringify(channels),
      JSON.stringify(sections),input.hierarchyRollup?1:0,1,context.email,now,now).run();
  return { id };
}

export async function saveBriefingPreference(userEmail:string,input:Record<string,unknown>){
  await ensureTables();const context=await activeStaffContext(userEmail);if(!context)return null;
  const timingMode=input.timingMode==="FIXED_TIME"?"FIXED_TIME":"SHIFT_OFFSET";
  const offset=Math.max(0,Math.min(180,Number(input.shiftOffsetMinutes)||15));
  const fixed=/^\d{2}:\d{2}$/.test(clean(input.fixedTime))?clean(input.fixedTime):null;
  if(timingMode==="FIXED_TIME"&&!fixed)throw new Error("Choose a valid briefing time.");
  await db().prepare(`INSERT INTO briefing_preferences
    (organization_id,user_email,timing_mode,shift_offset_minutes,fixed_time,timezone,summary_only,updated_at)
    VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(organization_id,user_email) DO UPDATE SET timing_mode=excluded.timing_mode,
    shift_offset_minutes=excluded.shift_offset_minutes,fixed_time=excluded.fixed_time,timezone=excluded.timezone,
    summary_only=excluded.summary_only,updated_at=excluded.updated_at`)
    .bind(context.organizationId,context.email,timingMode,offset,fixed,"America/Chicago",input.summaryOnly?1:0,new Date().toISOString()).run();
  return{timingMode,shiftOffsetMinutes:offset,fixedTime:fixed,summaryOnly:Boolean(input.summaryOnly)};
}

const weight=(level:string)=>({ASSOCIATE:1,SUPERVISOR:2,MANAGER:3,CORPORATE:4}[level]??1);
export async function generateDailyBriefings(userEmail:string) {
  await ensureTables(); const context=await activeStaffContext(userEmail);
  if(!context||context.role!=="admin") return null;
  const today=new Date().toISOString().slice(0,10),from=new Date(Date.now()-24*3600_000).toISOString(),now=new Date().toISOString();
  const [people,policies,facts,openItems,shifts,preferences]=await Promise.all([
    db().prepare(`SELECT m.user_email AS email,m.display_name AS name,COALESCE(NULLIF(p.department,''),'FRONT_DESK') AS department,
      CASE WHEN m.role='admin' THEN 'MANAGER' WHEN lower(COALESCE(p.job_title,'')) LIKE '%supervisor%' THEN 'SUPERVISOR' ELSE 'ASSOCIATE' END AS roleLevel
      FROM staff_members m LEFT JOIN employee_profiles p ON p.organization_id=m.organization_id AND lower(p.user_email)=lower(m.user_email)
      WHERE m.organization_id=? AND m.status='active'`).bind(context.organizationId).all<{email:string;name:string;department:string;roleLevel:string}>(),
    db().prepare(`SELECT * FROM briefing_policies WHERE organization_id=? AND enabled=1`).bind(context.organizationId).all<any>(),
    db().prepare(`SELECT fact_type,department,employee_email,status,COUNT(*) AS total,SUM(numeric_value) AS value
      FROM report_facts WHERE organization_id=? AND occurred_at>=? GROUP BY fact_type,department,employee_email,status`)
      .bind(context.organizationId,from).all<any>(),
    db().prepare(`SELECT item_type,priority,status,assigned_to_email,COUNT(*) AS total FROM front_desk_items
      WHERE organization_id=? AND status!='completed' GROUP BY item_type,priority,status,assigned_to_email`)
      .bind(context.organizationId).all<any>(),
    db().prepare(`SELECT user_email,role_label,location,starts_at,ends_at FROM employee_shifts
      WHERE organization_id=? AND starts_at<? AND ends_at>?`).bind(context.organizationId,`${today}T23:59:59Z`,`${today}T00:00:00Z`).all<any>(),
    db().prepare(`SELECT user_email,timing_mode,shift_offset_minutes,fixed_time,summary_only FROM briefing_preferences
      WHERE organization_id=?`).bind(context.organizationId).all<any>(),
  ]);
  let generated=0;
  for(const person of people.results){
    const policy=policies.results.find(p=>p.department===person.department&&p.role_level===person.roleLevel)
      ?? policies.results.find(p=>p.department===person.department);
    const ownFacts=facts.results.filter(f=>String(f.employee_email??"").toLowerCase()===person.email.toLowerCase());
    const deptFacts=facts.results.filter(f=>f.department===person.department);
    const rollup=policy?.hierarchy_rollup&&weight(person.roleLevel)>=3;
    const activeFacts=rollup?facts.results:weight(person.roleLevel)>=2?deptFacts:ownFacts;
    const assigned=openItems.results.filter(i=>!i.assigned_to_email||String(i.assigned_to_email).toLowerCase()===person.email.toLowerCase());
    const shift=shifts.results.find(s=>String(s.user_email).toLowerCase()===person.email.toLowerCase());
    const preference=preferences.results.find(p=>String(p.user_email).toLowerCase()===person.email.toLowerCase());
    let sections=[
      {title:"Your shift",items:shift?[`${shift.role_label||person.department} · ${new Date(shift.starts_at).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})}–${new Date(shift.ends_at).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})}`,shift.location||"Property-wide"]:[`No scheduled shift found for ${today}.`]},
      {title:"Priority actions",items:assigned.length?assigned.map(i=>`${i.total} ${i.priority} ${String(i.item_type).replaceAll("_"," ")} item(s) · ${i.status}`):["No open actions assigned."]},
      {title:rollup?"Property roll-up":weight(person.roleLevel)>=2?`${person.department} performance`:"Your performance",items:activeFacts.length?activeFacts.slice(0,8).map(f=>`${String(f.fact_type).replaceAll("_"," ")}: ${Number(f.value||f.total).toFixed(Number(f.value||0)%1?1:0)} · ${f.status||"recorded"}`):["No new performance events in the last 24 hours."]},
      {title:"AI focus",items:[assigned.some(i=>i.priority==="critical")?"Critical work requires acknowledgement before routine work.":"Start with the oldest high-priority assignment, then continue in queue order.","Document exceptions, photos, and handoff notes at the source record."]},
    ];
    if(preference?.summary_only)sections=sections.filter(section=>["Priority actions","AI focus"].includes(section.title));
    const title=`${person.name}'s ${person.department.replaceAll("_"," ")} daily briefing`;
    const delivery=preference?.timing_mode==="FIXED_TIME"?preference.fixed_time:
      shift?`${new Date(new Date(shift.starts_at).getTime()+(preference?.shift_offset_minutes??15)*60_000).toISOString()}`:"15 minutes after scheduled shift start";
    const summary=`${assigned.reduce((n,i)=>n+Number(i.total),0)} open actions · ${activeFacts.length} operational signals · ${shift?"shift scheduled":"schedule not found"} · delivery ${delivery}.`;
    await db().prepare(`INSERT INTO daily_briefings
      (id,organization_id,recipient_email,recipient_name,department,role_level,briefing_date,title,summary,sections_json,
       delivery_status,generated_at,acknowledged_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NULL)
      ON CONFLICT(organization_id,recipient_email,briefing_date) DO UPDATE SET
       title=excluded.title,summary=excluded.summary,sections_json=excluded.sections_json,generated_at=excluded.generated_at`)
      .bind(crypto.randomUUID(),context.organizationId,person.email,person.name,person.department,person.roleLevel,today,
        title,summary,JSON.stringify(sections),"READY",now).run();
    generated++;
  }
  return { generated, briefingDate:today };
}

export async function runScheduledDailyBriefings() {
  await ensureTables();
  const admins=await db().prepare(`SELECT user_email AS email FROM staff_members
    WHERE status='active' AND role='admin' ORDER BY organization_id`).all<{email:string}>();
  let generated=0;
  for(const admin of admins.results){
    const result=await generateDailyBriefings(admin.email);
    generated+=result?.generated??0;
  }
  return { organizations:admins.results.length,generated,runAt:new Date().toISOString() };
}
