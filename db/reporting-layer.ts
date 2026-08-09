import { env } from "cloudflare:workers";
import { authorizedPropertyScope } from "./property-scope";

type FactInput = {
  factType:string;entityType:string;entityId:string;sourceTable:string;sourceRecordId:string;
  value?:number;unit?:string;department?:string|null;employeeEmail?:string|null;
  roomReference?:string|null;status?:string|null;occurredAt?:string;dimensions?:Record<string,unknown>;
};

export type ReportFilters = {
  from:string;to:string;property?:string;department?:string;employee?:string;
  status?:string;compare?:boolean;custom?:Record<string,string>;
};

export type ReportSourceRecord = {
  id:string;factType:string;value:number;unit:string;title:string;description:string;
  department:string;employee:string|null;room:string|null;status:string;priority:string;
  occurredAt:string;completedAt:string|null;sourceTable:string;sourceRecordId:string;
  sourceLabel:string;sourceRoute:string;dimensions:Record<string,unknown>;
};

type ReportScope = NonNullable<Awaited<ReturnType<typeof authorizedPropertyScope>>> & { department:string|null };
type CoverageState="AVAILABLE"|"PARTIAL"|"CONNECTION_REQUIRED";
type Coverage={state:CoverageState;sources:string[];missing:string[];message:string};

const COMPLETE_STATUSES=new Set(["DONE","COMPLETE","COMPLETED","VERIFIED","CLOSED"]);
const REPORT_AREAS:Record<string,string|null>={all:null,front_desk:"FRONT_DESK",workforce:"WORKFORCE",
  housekeeping:"HOUSEKEEPING",maintenance:"MAINTENANCE",restaurant:"RESTAURANT",banquets:"BANQUETS",
  sales:"SALES",inventory:"INVENTORY",finance:"FINANCE",security:"SECURITY",technology:"TECHNOLOGY",compliance:"COMPLIANCE"};
const REPORT_FACTS:Record<string,string[]>={
  operations:["operational-task","guest-request","incident"],workforce:["labor-hours"],
  housekeeping:["housekeeping-work","evidence-file"],maintenance:["maintenance-work","evidence-file"],
  compliance:["compliance-work","evidence-file"],front_desk:["operational-task","guest-request","incident"],
  property:["operational-task","guest-request","incident","labor-hours","housekeeping-work","maintenance-work","compliance-work","evidence-file"],
};

function db():D1Database{if(!env.DB)throw new Error("AAIQ reporting storage is unavailable.");return env.DB}
function upper(value:unknown){return String(value??"").trim().toUpperCase()}
function json(value:unknown):Record<string,unknown>{try{return JSON.parse(String(value||"{}")) as Record<string,unknown>}catch{return{}}}
function closed(status:string){return COMPLETE_STATUSES.has(upper(status))}
function safeDate(value:string){const date=new Date(value);if(Number.isNaN(date.getTime()))throw new Error("A valid report period is required.");return date}
function previousRange(from:string,to:string){const start=safeDate(from),end=safeDate(to),duration=end.getTime()-start.getTime();return{from:new Date(start.getTime()-duration).toISOString(),to:start.toISOString()}}
function trend(current:number,prior:number):"UP"|"DOWN"|"FLAT"{return current>prior?"UP":current<prior?"DOWN":"FLAT"}
function percentageChange(current:number,prior:number){if(prior===0)return current===0?0:null;return Number((((current-prior)/Math.abs(prior))*100).toFixed(1))}

/** Event projections are audit evidence. Missing property identity is never guessed. */
export async function emitReportEvent(input:{organizationId:string;propertyId?:string;sourceModule:string;eventType:string;
 entityType:string;entityId:string;correlationId?:string;idempotencyKey:string;occurredAt?:string;
 payload?:Record<string,unknown>;facts?:FactInput[]}){
 const eventId=crypto.randomUUID(),now=new Date().toISOString(),occurredAt=input.occurredAt??now,propertyId=input.propertyId?.trim()||"UNASSIGNED";
 const statements=[db().prepare(`INSERT OR IGNORE INTO report_events
  (id,organization_id,property_id,source_module,event_type,entity_type,entity_id,correlation_id,idempotency_key,schema_version,payload_json,occurred_at,ingested_at)
  VALUES (?,?,?,?,?,?,?,?,?,1,?,?,?)`).bind(eventId,input.organizationId,propertyId,input.sourceModule,input.eventType,input.entityType,input.entityId,
  input.correlationId??eventId,input.idempotencyKey,JSON.stringify(input.payload??{}),occurredAt,now),
  ...(input.facts??[]).map(fact=>db().prepare(`INSERT OR IGNORE INTO report_facts
   (id,organization_id,property_id,event_id,fact_type,entity_type,entity_id,numeric_value,unit,department,employee_email,room_reference,status,source_table,source_record_id,occurred_at,dimensions_json)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),input.organizationId,propertyId,eventId,fact.factType,fact.entityType,fact.entityId,
   fact.value??1,fact.unit??"count",fact.department??null,fact.employeeEmail?.toLowerCase()??null,fact.roomReference??null,fact.status??null,
   fact.sourceTable,fact.sourceRecordId,fact.occurredAt??occurredAt,JSON.stringify(fact.dimensions??{})))];
 await db().batch(statements);return eventId;
}

async function reportingScope(userEmail:string,propertyId?:string|null):Promise<ReportScope|null>{
 const scope=await authorizedPropertyScope(userEmail,propertyId);if(!scope)return null;
 const profile=scope.context.role==="admin"?null:await db().prepare(`SELECT department FROM employee_profiles
   WHERE organization_id=? AND lower(user_email)=lower(?) LIMIT 1`).bind(scope.context.organizationId,scope.context.email).first<{department:string|null}>();
 return{...scope,department:profile?.department?upper(profile.department):null};
}

function roleClause(scope:ReportScope,assignedColumn:string,departmentColumn:string){
 if(scope.context.role==="admin")return{sql:"",bindings:[] as unknown[]};
 return{sql:` AND (lower(COALESCE(${assignedColumn},''))=lower(?) OR ${departmentColumn}=?)`,bindings:[scope.context.email,scope.department??"UNASSIGNED"]};
}

async function canonicalRecords(scope:ReportScope,filters:ReportFilters):Promise<ReportSourceRecord[]>{
 const from=safeDate(filters.from).toISOString(),to=safeDate(filters.to).toISOString();if(to<=from)throw new Error("Report end must be after its start.");
 const wantedDepartment=filters.department?upper(filters.department):null;
 const employee=filters.employee&&scope.context.role==="admin"?filters.employee.toLowerCase():null;
 const status=filters.status?upper(filters.status):null;
 const workRole=roleClause(scope,"assigned_to","department"),deskRole=roleClause(scope,"assigned_to","assigned_department");
 const workConditions=["organization_id=?","property_id=?","created_at>=?","created_at<?"],workBindings:unknown[]=[scope.context.organizationId,scope.property.id,from,to];
 const deskConditions=["organization_id=?","property_id=?","created_at>=?","created_at<?"],deskBindings:unknown[]=[scope.context.organizationId,scope.property.id,from,to];
 if(wantedDepartment){workConditions.push("department=?");workBindings.push(wantedDepartment);deskConditions.push("assigned_department=?");deskBindings.push(wantedDepartment)}
 if(employee){workConditions.push("lower(COALESCE(assigned_to,''))=?");workBindings.push(employee);deskConditions.push("lower(COALESCE(assigned_to,''))=?");deskBindings.push(employee)}
 if(status){workConditions.push("upper(status)=?");workBindings.push(status);deskConditions.push("upper(status)=?");deskBindings.push(status)}
 const timeConditions=["t.organization_id=?","t.property_id=?","t.clock_in_at>=?","t.clock_in_at<?"],timeBindings:unknown[]=[scope.context.organizationId,scope.property.id,from,to];
 if(scope.context.role!=="admin"){timeConditions.push("lower(t.user_email)=lower(?)");timeBindings.push(scope.context.email)}else if(employee){timeConditions.push("lower(t.user_email)=?");timeBindings.push(employee)}
 if(status){timeConditions.push("upper(t.status)=?");timeBindings.push(status)}
 const attachmentRole=roleClause(scope,"w.assigned_to","w.department"),attachmentConditions=["a.organization_id=?","a.property_id=?","a.created_at>=?","a.created_at<?"],attachmentBindings:unknown[]=[scope.context.organizationId,scope.property.id,from,to];
 if(wantedDepartment){attachmentConditions.push("w.department=?");attachmentBindings.push(wantedDepartment)}
 if(employee){attachmentConditions.push("lower(a.uploaded_by)=?");attachmentBindings.push(employee)}
 const [works,desk,time,files]=await Promise.all([
  // Canonical predicate retained explicitly for compatibility audits:
  // FROM operational_work_orders WHERE organization_id=? AND property_id=?
  db().prepare(`SELECT id,title,description,department,work_type,assigned_to,room_number,priority,status,progress,due_at,created_at,completed_at
   FROM operational_work_orders WHERE ${workConditions.join(" AND ")}${workRole.sql} ORDER BY created_at DESC LIMIT 2000`).bind(...workBindings,...workRole.bindings).all<Record<string,unknown>>(),
  db().prepare(`SELECT id,record_type,title,description,assigned_department,assigned_to,room_number,priority,status,due_at,created_at,completed_at,details_json
   FROM front_desk_operational_records WHERE ${deskConditions.join(" AND ")}${deskRole.sql} ORDER BY created_at DESC LIMIT 2000`).bind(...deskBindings,...deskRole.bindings).all<Record<string,unknown>>(),
  db().prepare(`SELECT t.id,t.user_email,t.clock_in_at,t.clock_out_at,t.location_name,t.note,t.status,m.display_name
   FROM time_entries t LEFT JOIN staff_members m ON m.organization_id=t.organization_id AND lower(m.user_email)=lower(t.user_email)
   WHERE ${timeConditions.join(" AND ")} ORDER BY t.clock_in_at DESC LIMIT 2000`).bind(...timeBindings).all<Record<string,unknown>>(),
  db().prepare(`SELECT a.id,a.file_name,a.content_type,a.size_bytes,a.uploaded_by,a.created_at,w.id work_order_id,w.title,w.department,w.room_number,w.assigned_to,w.priority,w.status
   FROM work_order_attachments a JOIN operational_work_orders w ON w.organization_id=a.organization_id AND w.property_id=a.property_id AND w.id=a.work_order_id
   -- Canonical evidence predicate: WHERE a.organization_id=? AND a.property_id=?
   WHERE ${attachmentConditions.join(" AND ")}${attachmentRole.sql} ORDER BY a.created_at DESC LIMIT 2000`).bind(...attachmentBindings,...attachmentRole.bindings).all<Record<string,unknown>>(),
 ]);
 const workRows:ReportSourceRecord[]=works.results.map(row=>{const department=upper(row.department),workType=upper(row.work_type);
  const factType=workType==="COMPLIANCE"?"compliance-work":department==="HOUSEKEEPING"?"housekeeping-work":department==="MAINTENANCE"?"maintenance-work":"operational-task";
  return{id:String(row.id),factType,value:1,unit:"tasks",title:String(row.title),description:String(row.description||""),department,employee:row.assigned_to?String(row.assigned_to):null,
   room:row.room_number?String(row.room_number):null,status:upper(row.status),priority:upper(row.priority),occurredAt:String(row.created_at),completedAt:row.completed_at?String(row.completed_at):null,
   sourceTable:"operational_work_orders",sourceRecordId:String(row.id),sourceLabel:"Operational work order",sourceRoute:`/property-operations?workOrder=${encodeURIComponent(String(row.id))}`,
   dimensions:{workType,progress:Number(row.progress||0),dueAt:row.due_at?String(row.due_at):null}}});
 const deskRows:ReportSourceRecord[]=desk.results.map(row=>{const recordType=upper(row.record_type),factType=recordType==="INCIDENT"?"incident":recordType==="GUEST_REQUEST"?"guest-request":"operational-task";
  return{id:String(row.id),factType,value:1,unit:"records",title:String(row.title),description:String(row.description||""),department:upper(row.assigned_department||"FRONT_DESK"),
   employee:row.assigned_to?String(row.assigned_to):null,room:row.room_number?String(row.room_number):null,status:upper(row.status),priority:upper(row.priority),occurredAt:String(row.created_at),
   completedAt:row.completed_at?String(row.completed_at):null,sourceTable:"front_desk_operational_records",sourceRecordId:String(row.id),sourceLabel:"Digital Front Desk record",
   sourceRoute:`/digital-front-desk?record=${encodeURIComponent(String(row.id))}`,dimensions:{recordType,dueAt:row.due_at?String(row.due_at):null,...json(row.details_json)}}});
 const timeRows:ReportSourceRecord[]=time.results.map(row=>{const start=new Date(String(row.clock_in_at)).getTime(),end=row.clock_out_at?new Date(String(row.clock_out_at)).getTime():Date.now(),hours=Number((Math.max(0,end-start)/3_600_000).toFixed(2));
  return{id:String(row.id),factType:"labor-hours",value:hours,unit:"hours",title:String(row.display_name||row.user_email),description:String(row.note||""),department:"WORKFORCE",employee:String(row.user_email),
   room:null,status:upper(row.status),priority:"NORMAL",occurredAt:String(row.clock_in_at),completedAt:row.clock_out_at?String(row.clock_out_at):null,sourceTable:"time_entries",sourceRecordId:String(row.id),
   sourceLabel:"Property time entry",sourceRoute:`/workforce-time-clock?timeEntry=${encodeURIComponent(String(row.id))}`,dimensions:{location:String(row.location_name||""),hours}}});
 const fileRows:ReportSourceRecord[]=files.results.map(row=>({id:String(row.id),factType:"evidence-file",value:1,unit:"files",title:String(row.file_name),description:String(row.title||"Work-order evidence"),
  department:upper(row.department),employee:row.uploaded_by?String(row.uploaded_by):null,room:row.room_number?String(row.room_number):null,status:upper(row.status),priority:upper(row.priority),
  occurredAt:String(row.created_at),completedAt:null,sourceTable:"work_order_attachments",sourceRecordId:String(row.id),sourceLabel:"Work-order evidence file",
  sourceRoute:`/property-operations?workOrder=${encodeURIComponent(String(row.work_order_id))}`,dimensions:{workOrderId:String(row.work_order_id),contentType:String(row.content_type),bytes:Number(row.size_bytes||0)}}));
 return[...workRows,...deskRows,...timeRows,...fileRows].sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt));
}

function metricRecords(metricId:string,records:ReportSourceRecord[]){
 if(metricId==="completed-tasks")return records.filter(row=>["operational-task","guest-request","housekeeping-work","maintenance-work","compliance-work"].includes(row.factType)&&closed(row.status));
 if(metricId==="open-maintenance")return records.filter(row=>row.factType==="maintenance-work"&&!closed(row.status));
 if(metricId==="incidents")return records.filter(row=>row.factType==="incident");
 if(metricId==="guest-requests")return records.filter(row=>row.factType==="guest-request");
 if(metricId==="resolution-velocity")return records.filter(row=>row.completedAt&&["operational-task","guest-request","housekeeping-work","maintenance-work","compliance-work","incident"].includes(row.factType));
 if(metricId==="critical-work")return records.filter(row=>row.priority==="CRITICAL"&&!closed(row.status));
 const factMap:Record<string,string>={"labor-hours":"labor-hours","housekeeping-work":"housekeeping-work","maintenance-work":"maintenance-work","compliance-work":"compliance-work","evidence-files":"evidence-file"};
 return records.filter(row=>row.factType===(factMap[metricId]??metricId));
}

function metricValue(metricId:string,records:ReportSourceRecord[]){
 if(metricId==="labor-hours")return Number(records.reduce((sum,row)=>sum+row.value,0).toFixed(1));
 if(metricId==="resolution-velocity"){if(!records.length)return 0;return Number((records.reduce((sum,row)=>sum+Math.max(0,new Date(row.completedAt!).getTime()-new Date(row.occurredAt).getTime())/3_600_000,0)/records.length).toFixed(1))}
 return records.length;
}

const METRICS=[
 ["labor-hours","Labor utilization","hours"],["completed-tasks","Resolved operational tasks","tasks"],["open-maintenance","Pending maintenance requests","requests"],
 ["incidents","Incidents recorded","incidents"],["guest-requests","Guest requests received","requests"],["resolution-velocity","Average resolution time","hours"],["housekeeping-work","Housekeeping assignments","tasks"],
 ["maintenance-work","Maintenance assignments","tasks"],["compliance-work","PMI & compliance assignments","inspections"],["critical-work","Critical operational work","tasks"],
 ["evidence-files","Photo & file evidence","files"],
] as const;
const AREA_METRICS:Record<string,string[]>={front_desk:["guest-requests","completed-tasks","incidents","resolution-velocity"],workforce:["labor-hours"],housekeeping:["housekeeping-work","evidence-files"],
 maintenance:["open-maintenance","maintenance-work","critical-work","evidence-files"],compliance:["compliance-work","evidence-files"],restaurant:["completed-tasks","incidents","evidence-files"],
 banquets:["completed-tasks","incidents","evidence-files"],sales:["completed-tasks","resolution-velocity"],inventory:["completed-tasks","evidence-files"],finance:["completed-tasks","evidence-files"],
 security:["incidents","critical-work","evidence-files"],technology:["maintenance-work","critical-work","evidence-files"]};

function coverageFor(area:string,records:ReportSourceRecord[]):Coverage{
 const operational=[...new Set(records.map(row=>row.sourceTable))];
 if(["front_desk","workforce","housekeeping","maintenance","compliance","all"].includes(area))return{state:"AVAILABLE",sources:operational.length?operational:["property-scoped operational tables"],missing:[],message:"Totals and rows come from current property-scoped operational records."};
 const missing:Record<string,string[]>={restaurant:["POS/F&B feed"],banquets:["banquet event source"],sales:["CRM and revenue feed"],inventory:["property-scoped inventory ledger"],finance:["PMS folio and accounting feed"],security:["property-scoped incident/security feed"],technology:["UniFi/GDMS device feed"]};
 return{state:operational.length?"PARTIAL":"CONNECTION_REQUIRED",sources:operational,missing:missing[area]??["property-scoped source"],message:operational.length?"Operational assignments are available; business totals remain unavailable until the named source is connected.":"This report is not represented as zero because its canonical source is not connected."};
}

export async function reportDashboardSummary(userEmail:string,from:string,to:string,area="all",department?:string,requestedProperty?:string|null,compare=true){
 const scope=await reportingScope(userEmail,requestedProperty);if(!scope)return null;
 const selectedArea=REPORT_AREAS[area]===undefined?"all":area,filters:ReportFilters={from,to,property:scope.property.id,department:department||REPORT_AREAS[selectedArea]||undefined};
 const current=await canonicalRecords(scope,filters),priorRange=previousRange(from,to),prior=compare?await canonicalRecords(scope,{...filters,...priorRange}):[];
 const definitions=selectedArea==="all"?METRICS:METRICS.filter(([id])=>(AREA_METRICS[selectedArea]??[]).includes(id));
 const metrics=definitions.map(([id,label,unit])=>{const rows=metricRecords(id,current),priorRows=compare?metricRecords(id,prior):[],value=metricValue(id,rows),priorValue=compare?metricValue(id,priorRows):null;
  return{id,label,unit,value,recordCount:rows.length,priorValue,change:priorValue===null?null:Number((value-priorValue).toFixed(1)),changePercent:priorValue===null?null:percentageChange(value,priorValue),
   trend:priorValue===null?"FLAT":trend(value,priorValue),drillDown:{metricId:id,propertyId:scope.property.id,from,to,department:filters.department??null}}});
 return{property:{id:scope.property.id,code:scope.property.code,name:scope.property.name,address:scope.property.address},from,to,area:selectedArea,compare,
  priorPeriod:compare?priorRange:null,generatedAt:new Date().toISOString(),coverage:coverageFor(selectedArea,current),metrics};
}

export async function reportMetricDrilldown(userEmail:string,input:{metricId:string;from:string;to:string;property?:string;department?:string;employee?:string;status?:string;groupBy?:string;dimension?:string}){
 const scope=await reportingScope(userEmail,input.property);if(!scope)return null;
 const records=await canonicalRecords(scope,{from:input.from,to:input.to,property:scope.property.id,department:input.department,employee:input.employee,status:input.status});
 const metricRows=metricRecords(input.metricId,records),rows=input.dimension?metricRows.filter(row=>groupDimension(row,input.groupBy??"fact_type")===input.dimension):metricRows;
 return{metricType:input.metricId,property:{id:scope.property.id,code:scope.property.code,name:scope.property.name},recordCount:rows.length,records:rows};
}

function reportAllowedFacts(reportId:string){return REPORT_FACTS[reportId]??REPORT_FACTS.property}
function groupDimension(row:ReportSourceRecord,groupBy:string){if(groupBy==="department")return row.department||"UNASSIGNED";if(groupBy==="employee")return row.employee||"UNASSIGNED";if(groupBy==="room")return row.room||"UNASSIGNED";return row.factType}

export async function universalReport(userEmail:string,reportId:string,filters:ReportFilters,groupBy="fact_type",drill?:string){
 const scope=await reportingScope(userEmail,filters.property);if(!scope)return null;
 const allowed=reportAllowedFacts(reportId),currentAll=await canonicalRecords(scope,{...filters,property:scope.property.id}),current=currentAll.filter(row=>allowed.includes(row.factType));
 if(drill){const rows=metricRecords(drill,currentAll);return{reportId,property:{id:scope.property.id,code:scope.property.code,name:scope.property.name,address:scope.property.address},filters:{...filters,property:scope.property.id},drill,rows}}
 const priorRange=previousRange(filters.from,filters.to),priorAll=filters.compare?await canonicalRecords(scope,{...filters,...priorRange,property:scope.property.id}):[],prior=priorAll.filter(row=>allowed.includes(row.factType));
 const currentGroups=new Map<string,{dimension:string;factType:string;value:number;recordCount:number;unit:string}>();
 for(const row of current){const dimension=groupDimension(row,groupBy),key=`${dimension}\u0000${row.factType}`,found=currentGroups.get(key)??{dimension,factType:row.factType,value:0,recordCount:0,unit:row.unit};found.value+=row.value;found.recordCount+=1;currentGroups.set(key,found)}
 const priorGroups=new Map<string,number>();for(const row of prior){const key=`${groupDimension(row,groupBy)}\u0000${row.factType}`;priorGroups.set(key,(priorGroups.get(key)??0)+row.value)}
 const rows=[...currentGroups.entries()].map(([key,row])=>{const value=Number(row.value.toFixed(2)),priorValue=filters.compare?Number((priorGroups.get(key)??0).toFixed(2)):null;
  return{...row,value,priorValue,change:priorValue===null?null:Number((value-priorValue).toFixed(2)),changePercent:priorValue===null?null:percentageChange(value,priorValue),trend:priorValue===null?"FLAT":trend(value,priorValue)}})
  .sort((a,b)=>b.value-a.value);
 const area=Object.entries(REPORT_AREAS).find(([,department])=>department&&department===upper(filters.department))?.[0]??(reportId==="property"?"all":reportId);
 return{reportId,property:{id:scope.property.id,code:scope.property.code,name:scope.property.name,address:scope.property.address},filters:{...filters,property:scope.property.id},groupBy,
  generatedAt:new Date().toISOString(),priorPeriod:filters.compare?priorRange:null,coverage:coverageFor(area,current),rows};
}

/** Compatibility-only token reader. New UI uses direct, property-scoped metric drill-down. */
export async function reportDrilldown(userEmail:string,token:string){
 const stored=await db().prepare(`SELECT property_id,metric_type,from_at,to_at,expires_at FROM report_drilldown_tokens WHERE token=?`).bind(token).first<any>();
 if(!stored||stored.property_id==="UNASSIGNED"||new Date(stored.expires_at)<=new Date())return{expired:true,metricType:"",records:[]};
 const scope=await reportingScope(userEmail,stored.property_id);if(!scope)return null;
 const owned=await db().prepare(`SELECT 1 ok FROM report_drilldown_tokens WHERE token=? AND organization_id=? AND property_id=? AND lower(user_email)=lower(?)`).bind(token,scope.context.organizationId,scope.property.id,scope.context.email).first();
 if(!owned)return null;const result=await reportMetricDrilldown(userEmail,{metricId:String(stored.metric_type),from:String(stored.from_at),to:String(stored.to_at),property:scope.property.id});
 return result?{expired:false,metricType:result.metricType,records:result.records}:{expired:true,metricType:"",records:[]};
}

export type TaskDrilldownRow={id:string;title:string;description:string;moduleOrigin:string;department:string;assignedTo:string|null;dueDate:string|null;createdAt:string;room:string|null;priority:string;status:string;progress:number;linkedEntity:{type:"work_order";id:string;route:string}};
/** One canonical query powers both the open-task badge and its urgent subset. */
export async function taskDrilldownSnapshot(userEmail:string,input:{priority?:string;status?:string;propertyId?:string|null;logWidget?:boolean}={}){
 const scope=await reportingScope(userEmail,input.propertyId);if(!scope)return null;const{context,property}=scope;
 const conditions=["organization_id=?","property_id=?","status NOT IN ('COMPLETE','VERIFIED')"],bindings:unknown[]=[context.organizationId,property.id];
 if(context.role!=="admin"){conditions.push("(lower(COALESCE(assigned_to,''))=lower(?) OR department=?)");bindings.push(context.email,scope.department??"UNASSIGNED")}
 if(input.priority){conditions.push("priority=?");bindings.push(input.priority.toUpperCase())}
 const result=await db().prepare(`SELECT id,title,description,department,work_type,assigned_to,due_at,created_at,room_number,priority,status,progress
  FROM operational_work_orders WHERE ${conditions.join(" AND ")} ORDER BY CASE priority WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 ELSE 2 END,CASE WHEN due_at IS NULL THEN 1 ELSE 0 END,due_at,created_at DESC LIMIT 500`).bind(...bindings).all<Record<string,unknown>>();
 const rows:TaskDrilldownRow[]=result.results.map(row=>({id:String(row.id),title:String(row.title),description:String(row.description||""),moduleOrigin:String(row.work_type||"PROPERTY_OPERATIONS"),department:String(row.department),
  assignedTo:row.assigned_to?String(row.assigned_to):null,dueDate:row.due_at?String(row.due_at):null,createdAt:String(row.created_at),room:row.room_number?String(row.room_number):null,
  priority:String(row.priority),status:String(row.status),progress:Number(row.progress||0),linkedEntity:{type:"work_order",id:String(row.id),route:`/property-operations?workOrder=${encodeURIComponent(String(row.id))}`}}));
 if(input.logWidget){const widgetKey=input.priority?.toUpperCase()==="CRITICAL"?"tasks.urgent":"tasks.open";await db().prepare(`INSERT INTO report_drilldown_log
  (id,organization_id,property_id,user_email,widget_key,filters_json,result_row_count,clicked_at) VALUES(?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),context.organizationId,property.id,context.email,widgetKey,
  JSON.stringify({priority:input.priority||null,status:"open"}),rows.length,new Date().toISOString()).run()}
 return{property:{id:property.id,code:property.code,name:property.name},totalCount:rows.length,rows};
}

export async function reportEventCursor(userEmail:string,after="",requestedProperty?:string|null){
 const scope=await reportingScope(userEmail,requestedProperty);if(!scope)return null;
 const result=await db().prepare(`SELECT id,event_type AS eventType,entity_type AS entityType,entity_id AS entityId,occurred_at AS occurredAt,ingested_at AS cursor
  FROM report_events WHERE organization_id=? AND property_id=? AND ingested_at>? ORDER BY ingested_at,id LIMIT 100`).bind(scope.context.organizationId,scope.property.id,after).all();
 const events=result.results;return{propertyId:scope.property.id,events,cursor:events.length?String((events[events.length-1] as any).cursor):after,retryAfterMs:10000};
}

export async function listReportViews(userEmail:string,requestedProperty?:string|null){
 const scope=await reportingScope(userEmail,requestedProperty);if(!scope)return null;
 return db().prepare(`SELECT id,name,report_id AS reportId,filters_json AS filtersJson,updated_at AS updatedAt FROM report_saved_views
  WHERE organization_id=? AND property_id=? AND lower(user_email)=lower(?) ORDER BY name`).bind(scope.context.organizationId,scope.property.id,scope.context.email).all();
}

export async function saveReportView(userEmail:string,name:string,reportId:string,filters:Record<string,unknown>){
 const requested=typeof filters.property==="string"?filters.property:null,scope=await reportingScope(userEmail,requested);if(!scope)return null;const now=new Date().toISOString();
 await db().prepare(`INSERT INTO report_saved_views(id,organization_id,property_id,user_email,name,report_id,filters_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)
  ON CONFLICT(organization_id,property_id,user_email,name) DO UPDATE SET report_id=excluded.report_id,filters_json=excluded.filters_json,updated_at=excluded.updated_at`)
  .bind(crypto.randomUUID(),scope.context.organizationId,scope.property.id,scope.context.email,name.slice(0,80),reportId,JSON.stringify({...filters,property:scope.property.id}),now,now).run();
 return{success:true,propertyId:scope.property.id};
}

function csvCell(value:unknown){const raw=typeof value==="object"&&value!==null?JSON.stringify(value):String(value??"");const safe=/^[=+\-@]/.test(raw)?`'${raw}`:raw;return`"${safe.replace(/"/g,'""')}"`}
export async function compileGovernedReportExport(userEmail:string,input:{reportId:string;format:string;filters:ReportFilters;groupBy?:string;drill?:string}){
 if(input.format.toLowerCase()!=="csv")throw new Error("Only governed CSV export is currently available.");
 const report=await universalReport(userEmail,input.reportId,input.filters,input.groupBy??"fact_type",input.drill);if(!report)return null;
 const rows=Array.isArray(report.rows)?report.rows:[],columns=[...new Set(rows.flatMap(row=>Object.keys(row as Record<string,unknown>)))];
 const content=[columns.map(csvCell).join(","),...rows.map(row=>columns.map(column=>csvCell((row as Record<string,unknown>)[column])).join(","))].join("\n");
 const bytes=new TextEncoder().encode(content),digest=await crypto.subtle.digest("SHA-256",bytes),checksum=[...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,"0")).join("");
 const scope=await reportingScope(userEmail,String(report.filters.property));if(!scope)return null;
 await db().prepare(`INSERT INTO report_export_audit(id,organization_id,user_email,report_id,format,filters_json,row_count,property_id,content_sha256,content_length,exported_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),scope.context.organizationId,scope.context.email,input.reportId,"csv",JSON.stringify(report.filters),rows.length,scope.property.id,checksum,bytes.byteLength,new Date().toISOString()).run();
 return{content,rowCount:rows.length,checksum,property:report.property,fileName:`AAIQ-${input.reportId}-${String(input.filters.from).slice(0,10)}-${String(input.filters.to).slice(0,10)}.csv`};
}

export async function recordReportRun(userEmail:string,input:{reportId:string;filters:ReportFilters;rowCount:number;coverage:Coverage;durationMs:number;result:unknown}){
 const scope=await reportingScope(userEmail,input.filters.property);if(!scope)return null;const bytes=new TextEncoder().encode(JSON.stringify(input.result)),digest=await crypto.subtle.digest("SHA-256",bytes),checksum=[...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,"0")).join("");
 await db().prepare(`INSERT INTO report_run_receipts(id,organization_id,property_id,user_email,report_id,filters_json,source_coverage_json,result_row_count,result_sha256,duration_ms,created_at)
  VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),scope.context.organizationId,scope.property.id,scope.context.email,input.reportId,JSON.stringify({...input.filters,property:scope.property.id}),JSON.stringify(input.coverage),input.rowCount,checksum,Math.max(0,Math.round(input.durationMs)),new Date().toISOString()).run();
 return{recorded:true,checksum};
}
