import { env } from "cloudflare:workers";
import { activeStaffContext } from "./staff";
import { emitReportEvent } from "./reporting-layer";
import { recordSystemAudit } from "./platform-controls";
import { authorizedPropertyScope } from "./property-scope";

function db(): D1Database {
  if (!env.DB) throw new Error("Property workflow storage is unavailable.");
  return env.DB;
}

async function ensureTables() {
  db();
}

async function propertyFor(context:{organizationId:string;email:string;role?:string},requested?:string){
  return (await authorizedPropertyScope(context.email,requested))?.property||null;
}

async function workflowScope(email:string,requestedPropertyId?:string,adminRequired=false){
  const context=await activeStaffContext(email);
  if(!context||(adminRequired&&context.role!=="admin"))return null;
  await ensureTables();
  const property=await propertyFor(context,requestedPropertyId);
  return property?{context,property}:null;
}

async function mayOperateDepartment(
  context:{organizationId:string;email:string;role?:string},propertyId:string,department:string,assignedTo?:string|null,
){
  if(context.role==="admin"||Boolean(assignedTo&&assignedTo.toLowerCase()===context.email.toLowerCase()))return true;
  const assignment=await db().prepare(`SELECT department,role_label FROM property_assignments
    WHERE organization_id=? AND property_id=? AND lower(user_email)=lower(?) AND status='ACTIVE' LIMIT 1`)
    .bind(context.organizationId,propertyId,context.email).first<{department:string|null;role_label:string|null}>();
  const assignedDepartment=String(assignment?.department||"").toUpperCase();
  const role=String(assignment?.role_label||"").toUpperCase();
  return assignedDepartment===department.toUpperCase()||["EXECUTIVE","MANAGEMENT","GENERAL_MANAGER","SUPERVISOR"].includes(assignedDepartment)||["GENERAL_MANAGER","SUPERVISOR"].includes(role);
}

async function ensureComplianceTemplates(context: { organizationId:string },propertyId:string) {
  const due = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
  const results=await db().batch(
    [["FIRE-EXT-MONTHLY","Fire extinguisher inspection","Verify gauge, pin, seal, access and inspection tag.","MONTHLY","Photo and completed checklist"],
    ["POOL-DAILY","Pool safety and chemistry log","Record sanitizer, pH, temperature, gates and rescue equipment.","DAILY","Readings, checklist and photo"],
    ["EM-LIGHT-MONTHLY","Emergency lighting test","Function-test emergency lights and exit signs.","MONTHLY","Checklist and exception photos"],
    ["HVAC-QUARTERLY","Guest-room HVAC preventive maintenance (PMI)","Inspect filters, coils, condensate, electrical condition and operating temperatures.","QUARTERLY","PMI checklist, readings and before/after photos"],
    ["GUESTROOM-PMI","Guest-room preventive maintenance inspection","Complete the full room PMI covering plumbing, electrical, HVAC, locks, life safety, furniture and finishes.","QUARTERLY","Completed PMI checklist and exception photos"],
    ["BACKFLOW-ANNUAL","Backflow prevention review","Verify current certified inspection and record deficiencies or vendor follow-up.","ANNUAL","Certificate or vendor report"],
    ["BOILER-ANNUAL","Boiler and water-heating inspection","Inspect operating condition, safety controls, leaks and required service documentation.","ANNUAL","Readings, checklist and service record"],
    ].map(([code,name,description,frequency,evidence]) => db().prepare(`INSERT OR IGNORE INTO maintenance_compliance_templates
    (id,organization_id,code,name,description,frequency,required_evidence,active,next_due_at,property_id)
	    VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),context.organizationId,code,name,description,frequency,evidence,1,due,propertyId))
  );
  return results.reduce((count,result)=>count+Number(result.meta?.changes||0),0);
}

export async function getPropertyWorkflows(email:string,requestedPropertyId?:string) {
  const context = await activeStaffContext(email); if (!context) return null;
  await ensureTables();const property=await propertyFor(context,requestedPropertyId);if(!property)return{forbidden:true};
  const [orders,templates,attachments,steps,imports,evidenceReviews] = await Promise.all([
    db().prepare("SELECT * FROM operational_work_orders WHERE organization_id=? AND property_id=? ORDER BY CASE priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 ELSE 3 END, created_at DESC").bind(context.organizationId,property.id).all(),
    db().prepare("SELECT * FROM maintenance_compliance_templates WHERE organization_id=? AND property_id=? ORDER BY next_due_at").bind(context.organizationId,property.id).all(),
    db().prepare("SELECT id,work_order_id,file_name,content_type,size_bytes,created_at FROM work_order_attachments WHERE organization_id=? AND property_id=? ORDER BY created_at DESC").bind(context.organizationId,property.id).all(),
    db().prepare("SELECT * FROM work_order_steps WHERE organization_id=? AND property_id=? ORDER BY work_order_id,step_number").bind(context.organizationId,property.id).all(),
    db().prepare("SELECT * FROM night_room_report_imports WHERE organization_id=? AND property_id=? ORDER BY created_at DESC LIMIT 10").bind(context.organizationId,property.id).all(),
    db().prepare("SELECT * FROM work_evidence_reviews WHERE organization_id=? AND property_id=? ORDER BY created_at DESC").bind(context.organizationId,property.id).all(),
  ]);
  return {
    role:context.role,property,orders:orders.results, templates:templates.results, attachments:attachments.results,
    steps:steps.results, imports:imports.results, evidenceReviews:evidenceReviews.results,
    evidenceRequirements:Object.fromEntries((orders.results as Record<string,any>[]).map((order)=>[
      order.id, requiredEvidenceAreas(order.department,order.work_type),
    ])),
  };
}

export async function updateWorkOrder(email:string,id:string,progress:number,status?:string,requestedPropertyId?:string) {
  const scope=await workflowScope(email,requestedPropertyId);if(!scope)return null;
  const {context,property}=scope;
  let safe=Math.max(0,Math.min(100,Math.round(progress)));
  const order=await db().prepare("SELECT department,work_type,progress,status,assigned_to FROM operational_work_orders WHERE id=? AND organization_id=? AND property_id=?")
    .bind(id,context.organizationId,property.id).first<{department:string;work_type:string;progress:number;status:string;assigned_to:string|null}>();
  if(!order)return null;
  if(!await mayOperateDepartment(context,property.id,order.department,order.assigned_to))return null;
  const explicitStatus=context.role==="admin"&&["ASSIGNED","IN_PROGRESS","REWORK_REQUIRED","CANCELLED"].includes(String(status))?String(status):null;
  let next=explicitStatus ?? (safe===100?"COMPLETE":safe>0?"IN_PROGRESS":"ASSIGNED");
  if(safe===100){
    const required=requiredEvidenceAreas(order.department,order.work_type);
    const reviews=await db().prepare("SELECT evidence_area,review_status FROM work_evidence_reviews WHERE work_order_id=? AND organization_id=? AND property_id=?")
      .bind(id,context.organizationId,property.id).all<{evidence_area:string;review_status:string}>();
    const covered=new Set(reviews.results.map(review=>review.evidence_area));
    const missing=required.filter(area=>!covered.has(area));
    if(missing.length)throw new Error(`Completion blocked. Add required photos for: ${missing.map(evidenceAreaLabel).join(", ")}.`);
    if(reviews.results.some(review=>review.review_status==="REWORK_REQUIRED")){
      throw new Error("Completion blocked. AI/manager review found deficiencies that require corrected photos.");
    }
    const passed=reviews.results.filter(review=>required.includes(review.evidence_area))
      .every(review=>["PASS","MANAGER_APPROVED"].includes(review.review_status));
    if(passed)next="VERIFIED";
    else{safe=95;next="AWAITING_EVIDENCE_REVIEW"}
  }
  const now=new Date().toISOString();
  await db().prepare(`UPDATE operational_work_orders SET progress=?,status=?,updated_at=?,completed_at=CASE WHEN ? IN ('COMPLETE','VERIFIED') THEN ? ELSE completed_at END
    WHERE id=? AND organization_id=? AND property_id=?`).bind(safe,next,now,next,now,id,context.organizationId,property.id).run();
  await recordSystemAudit({organizationId:context.organizationId,propertyId:property.id,eventType:"work_order.progress.updated",
    entityType:"WORK_ORDER",entityId:id,authorType:"USER",authorId:email,correlationId:id,
    before:{progress:order.progress,status:order.status},after:{progress:safe,status:next},delta:{progress:safe,status:next}});
  await emitReportEvent({organizationId:context.organizationId,propertyId:property.id,sourceModule:"PROPERTY_WORKFLOWS",eventType:"WORK_ORDER_UPDATED",
    entityType:"work_order",entityId:id,idempotencyKey:`work-order:${id}:${safe}:${now}`,occurredAt:now,payload:{progress:safe,status:next}});
  return {id,progress:safe,status:next};
}

const evidenceAreaLabels:Record<string,string>={
  ENTRY:"Entry & door",BEDS:"Beds & linens",BATHROOM:"Bathroom",VANITY:"Vanity & amenities",
  FLOOR:"Floor & corners",FINAL_WIDE:"Final wide view",BEFORE:"Before condition",
  REPAIR_DETAIL:"Completed repair detail",AFTER:"After condition",SAFETY_CHECK:"Final safety check",
};
function evidenceAreaLabel(area:string){return evidenceAreaLabels[area]??area.replaceAll("_"," ").toLowerCase()}
function requiredEvidenceAreas(department:string,workType:string){
  if(department==="HOUSEKEEPING")return["ENTRY","BEDS","BATHROOM","VANITY","FLOOR","FINAL_WIDE"];
  if(department==="MAINTENANCE"||workType==="COMPLIANCE")return["BEFORE","REPAIR_DETAIL","AFTER","SAFETY_CHECK"];
  return["FINAL_WIDE"];
}

export async function createMaintenanceIssue(email:string,input:{parentId:string;room:string;title:string;description:string;priority:string},requestedPropertyId?:string) {
  const scope=await workflowScope(email,requestedPropertyId);if(!scope)return null;
  const {context,property}=scope;
  if(input.parentId){
    const parent=await db().prepare("SELECT id FROM operational_work_orders WHERE id=? AND organization_id=? AND property_id=?")
      .bind(input.parentId,context.organizationId,property.id).first();
    if(!parent)throw new Error("The source work order is not available in the active property.");
  }
  const now=new Date(), id=crypto.randomUUID();
  const active=await db().prepare(`SELECT assigned_to,COUNT(*) load FROM operational_work_orders
    WHERE organization_id=? AND property_id=? AND department='MAINTENANCE' AND assigned_to IS NOT NULL
      AND status NOT IN ('COMPLETE','VERIFIED') GROUP BY assigned_to ORDER BY load ASC LIMIT 1`)
    .bind(context.organizationId,property.id).first<{assigned_to:string|null}>();
  const assignee=active?.assigned_to || "Maintenance queue";
  await db().prepare(`INSERT INTO operational_work_orders
    (id,organization_id,property_id,department,work_type,title,description,room_number,assigned_to,status,progress,priority,parent_order_id,due_at,created_by,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,'ASSIGNED',0,?,?,?,?,?,?)`)
    .bind(id,context.organizationId,property.id,"MAINTENANCE","HOUSEKEEPING_ESCALATION",input.title.slice(0,140),input.description.slice(0,2000),input.room.slice(0,12),assignee,
      ["LOW","MEDIUM","HIGH","CRITICAL"].includes(input.priority)?input.priority:"HIGH",input.parentId||null,new Date(now.getTime()+30*60_000).toISOString(),email,now.toISOString(),now.toISOString()).run();
  await db().prepare(`UPDATE operational_work_orders SET asset_id=(SELECT id FROM property_assets
   WHERE organization_id=? AND property_id=? AND asset_type='ROOM' AND room_number=? LIMIT 1)
   WHERE id=? AND organization_id=? AND property_id=?`)
   .bind(context.organizationId,property.id,input.room,id,context.organizationId,property.id).run();
  await recordSystemAudit({organizationId:context.organizationId,propertyId:property.id,eventType:"maintenance.issue.created",
    entityType:"WORK_ORDER",entityId:id,authorType:"USER",authorId:email,correlationId:input.parentId||id,
    delta:{status:"ASSIGNED",priority:["LOW","MEDIUM","HIGH","CRITICAL"].includes(input.priority)?input.priority:"HIGH",assignedTo:assignee,parentId:input.parentId||null}});
  await emitReportEvent({organizationId:context.organizationId,propertyId:property.id,sourceModule:"MAINTENANCE",eventType:"WORK_ORDER_CREATED",
    entityType:"work_order",entityId:id,idempotencyKey:`work-order:${id}:created`,occurredAt:now.toISOString(),
    payload:{title:input.title,priority:input.priority,parentId:input.parentId},
    facts:[{factType:"maintenance-work",entityType:"work_order",entityId:id,sourceTable:"operational_work_orders",sourceRecordId:id,
      department:"MAINTENANCE",employeeEmail:assignee,roomReference:input.room,status:"ASSIGNED",occurredAt:now.toISOString(),
      dimensions:{priority:input.priority,workType:"HOUSEKEEPING_ESCALATION"}}]});
  return {id,assignedTo:assignee};
}

export async function generateComplianceAssignments(email:string,requestedPropertyId?:string) {
  const scope=await workflowScope(email,requestedPropertyId,true);if(!scope)return null;
  const {context,property}=scope;
  await ensureComplianceTemplates(context,property.id);
  const due=await db().prepare("SELECT * FROM maintenance_compliance_templates WHERE organization_id=? AND property_id=? AND active=1 AND next_due_at<=?")
    .bind(context.organizationId,property.id,new Date(Date.now()+48*60*60_000).toISOString()).all<Record<string,any>>();
  let created=0;
  for(const t of due.results){
    const targetWhere=String(t.code)==="GUESTROOM-PMI"?"asset_type='ROOM'":String(t.code).startsWith("HVAC")?"asset_type='EQUIPMENT' AND (upper(name) LIKE '%HVAC%' OR upper(name) LIKE '%PTAC%' OR upper(name) LIKE '%THERMOSTAT%')":String(t.code).startsWith("FIRE-EXT")?"asset_type='EQUIPMENT' AND upper(name) LIKE '%EXTINGUISHER%'":String(t.code).startsWith("POOL")?"(asset_type='SPACE' OR asset_type='EQUIPMENT') AND upper(name) LIKE '%POOL%'":"0";
    const targets=await db().prepare(`SELECT id,name,room_number FROM property_assets WHERE organization_id=? AND property_id=? AND ${targetWhere} ORDER BY code`)
      .bind(context.organizationId,property.id).all<{id:string;name:string;room_number:string|null}>();
    const scopes=targets.results.length?targets.results:[{id:null,name:"Property-wide",room_number:null}];
    for(const target of scopes){
    const title=target.id?`${t.name} — ${target.name}`:t.name;
    const exists=await db().prepare("SELECT id FROM operational_work_orders WHERE organization_id=? AND property_id=? AND work_type='COMPLIANCE' AND title=? AND status NOT IN ('COMPLETE','VERIFIED')")
      .bind(context.organizationId,property.id,title).first();
    if(exists) continue;const now=new Date().toISOString(),orderId=crypto.randomUUID();
    await db().prepare(`INSERT INTO operational_work_orders
      (id,organization_id,property_id,department,work_type,title,description,room_number,asset_id,assigned_to,status,progress,priority,due_at,created_by,created_at,updated_at)
      VALUES (?,?,?,'MAINTENANCE','COMPLIANCE',?,?,?,?,'Maintenance compliance queue','ASSIGNED',0,'HIGH',?,?,?,?)`)
      .bind(orderId,context.organizationId,property.id,title,`${t.description} Required evidence: ${t.required_evidence}`,target.room_number,target.id,t.next_due_at,email,now,now).run();
    const order={id:orderId};
    if(order) {
      await seedGuidedSteps(context.organizationId,property.id,order.id,String(t.code));
      await emitReportEvent({organizationId:context.organizationId,propertyId:property.id,sourceModule:"COMPLIANCE",eventType:"COMPLIANCE_ASSIGNMENT_CREATED",
        entityType:"work_order",entityId:order.id,idempotencyKey:`work-order:${order.id}:created`,occurredAt:now,
        payload:{templateCode:t.code,title:t.name},facts:[{factType:"compliance-work",entityType:"work_order",entityId:order.id,
          sourceTable:"operational_work_orders",sourceRecordId:order.id,department:"MAINTENANCE",status:"ASSIGNED",occurredAt:now,
          dimensions:{priority:"HIGH",workType:"COMPLIANCE"}}]});
    }
    created++;
    }
  }
  await recordSystemAudit({organizationId:context.organizationId,propertyId:property.id,eventType:"compliance.assignments.generated",
    entityType:"PROPERTY",entityId:property.id,authorType:"USER",authorId:email,correlationId:crypto.randomUUID(),
    delta:{created,templatesEvaluated:due.results.length}});
  return {created};
}

const complianceSteps:Record<string,string[]>={
  "FIRE-EXT-MONTHLY":["Confirm extinguisher is visible, unobstructed and in its assigned location.","Verify pressure gauge is in the operable range.","Inspect pin, tamper seal, hose and cylinder for damage or corrosion.","Confirm inspection tag is present and record the inspection date.","Photograph exceptions; remove unsafe equipment from service and escalate."],
  "POOL-DAILY":["Wear required PPE and verify the pool area is secured before testing.","Record water temperature, sanitizer and pH readings using approved test equipment.","Inspect gates, latches, drain covers, rescue equipment and required signage.","Check deck, lighting and mechanical-room conditions for hazards.","Attach readings and photographs, then escalate any unsafe condition immediately."],
  "EM-LIGHT-MONTHLY":["Notify affected staff before beginning the test.","Inspect exit signs and emergency fixtures for visible damage.","Use the test control to verify each fixture operates on backup power.","Record failed fixtures and create a linked repair ticket.","Attach evidence and restore all controls to normal operation."],
  "HVAC-QUARTERLY":["Lock out equipment when required and follow the manufacturer safety procedure.","Inspect and replace/clean filters as required.","Inspect coil, drain pan, condensate path, wiring and visible connections.","Record supply/return temperatures and verify heating/cooling operation.","Photograph condition before and after service; document parts or follow-up required."],
  "GUESTROOM-PMI":["Confirm room access and place the room in maintenance inspection status.","Inspect entry door, deadbolt, latch, viewer, smoke/CO devices and emergency information.","Test lights, receptacles, GFCI, television, telephone and HVAC operation.","Inspect plumbing fixtures, drains, caulk, leaks, hot water and exhaust fan.","Inspect furniture, case goods, walls, flooring, window, drapery and guest amenities.","Photograph every exception and create linked corrective maintenance tickets.","Complete final safety check, attach evidence and submit for supervisor verification."],
  "BACKFLOW-ANNUAL":["Locate the current certified test record.","Verify device identification and inspection due date.","Inspect for leakage, damage and access obstruction.","Record certified vendor follow-up when testing is due.","Attach the certificate or service report."],
  "BOILER-ANNUAL":["Review lockout/tagout and manufacturer safety requirements.","Inspect for leaks, corrosion, venting and abnormal noise.","Record temperature, pressure and safety-control observations.","Confirm required licensed inspection/service documentation is current.","Attach readings and service evidence; escalate unsafe conditions."],
};
async function seedGuidedSteps(organizationId:string,propertyId:string,workOrderId:string,code:string){
  const steps=complianceSteps[code]??["Review the assignment and required safety procedure.","Complete the inspection and record all readings.","Attach required evidence and escalate every exception.","Submit the work for supervisor verification."];
  await db().batch(steps.map((instruction,index)=>db().prepare(`INSERT OR IGNORE INTO work_order_steps
    (id,organization_id,property_id,work_order_id,step_number,instruction,safety_note,completed) VALUES (?,?,?,?,?,?,?,0)`)
    .bind(crypto.randomUUID(),organizationId,propertyId,workOrderId,index+1,instruction,index===0?"Stop work and notify a supervisor if conditions are unsafe.":null)));
}

export async function toggleWorkStep(email:string,stepId:string,completed:boolean,requestedPropertyId?:string){
  const scope=await workflowScope(email,requestedPropertyId);if(!scope)return null;
  const {context,property}=scope;
  const step=await db().prepare(`SELECT s.completed,s.work_order_id,w.department,w.assigned_to
    FROM work_order_steps s JOIN operational_work_orders w
      ON w.id=s.work_order_id AND w.organization_id=s.organization_id AND w.property_id=s.property_id
    WHERE s.id=? AND s.organization_id=? AND s.property_id=?`)
    .bind(stepId,context.organizationId,property.id).first<{completed:number;work_order_id:string;department:string;assigned_to:string|null}>();
  if(!step)return null;
  if(!await mayOperateDepartment(context,property.id,step.department,step.assigned_to))return null;
  const now=new Date().toISOString();
  await db().prepare(`UPDATE work_order_steps SET completed=?,completed_by=?,completed_at=? WHERE id=? AND organization_id=? AND property_id=?`)
    .bind(completed?1:0,completed?email:null,completed?now:null,stepId,context.organizationId,property.id).run();
  await recordSystemAudit({organizationId:context.organizationId,propertyId:property.id,eventType:"work_order.step.updated",
    entityType:"WORK_ORDER_STEP",entityId:stepId,authorType:"USER",authorId:email,correlationId:step.work_order_id,
    before:{completed:Boolean(step.completed)},after:{completed},delta:{completed}});
  return {stepId,completed};
}

export async function importNightRoomReport(email:string,fileName:string,objectKey:string,text:string,requestedPropertyId?:string){
  const scope=await workflowScope(email,requestedPropertyId,true);if(!scope)return null;
  const {context,property}=scope;
  const lines=text.split(/\r?\n/).map(line=>line.trim()).filter(Boolean).slice(0,500);
  let read=0,created=0;
  for(const line of lines){
    const parts=line.split(/[,;\t|]/).map(value=>value.trim());
    const room=(parts.find(value=>/^\d{3,4}$/.test(value))??line.match(/\b\d{3,4}\b/)?.[0]??"").slice(0,12);
    const upper=line.toUpperCase(); if(!room)continue; read++;
    const maintenance=/OUT OF ORDER|OOO|MAINTENANCE|REPAIR|BROKEN/.test(upper);
    const housekeeping=/DIRTY|CHECK.?OUT|DUE OUT|VACANT DIRTY|VD\b/.test(upper);
    if(!maintenance&&!housekeeping)continue;
    const department=maintenance?"MAINTENANCE":"HOUSEKEEPING", workType=maintenance?"NIGHT_REPORT_EXCEPTION":"ROOM_TURN";
    const exists=await db().prepare(`SELECT id FROM operational_work_orders WHERE organization_id=? AND property_id=? AND room_number=? AND department=? AND status NOT IN ('COMPLETE','VERIFIED')`)
      .bind(context.organizationId,property.id,room,department).first();
    if(exists)continue;
    const now=new Date(), id=crypto.randomUUID();
    await db().prepare(`INSERT INTO operational_work_orders
      (id,organization_id,property_id,department,work_type,title,description,room_number,assigned_to,status,progress,priority,due_at,created_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,'ASSIGNED',0,?,?,?,?,?)`)
      .bind(id,context.organizationId,property.id,department,workType,maintenance?`Room ${room} maintenance exception`:`Room ${room} departure clean`,`Automatically created from previous-night room report row: ${line.slice(0,500)}`,room,`${department==="HOUSEKEEPING"?"Housekeeping":"Maintenance"} queue`,maintenance?"HIGH":"MEDIUM",new Date(now.getTime()+(maintenance?30:120)*60_000).toISOString(),email,now.toISOString(),now.toISOString()).run();
    await db().prepare(`UPDATE operational_work_orders SET asset_id=(SELECT id FROM property_assets
     WHERE organization_id=? AND property_id=? AND asset_type='ROOM' AND room_number=? LIMIT 1)
     WHERE id=? AND organization_id=? AND property_id=?`)
     .bind(context.organizationId,property.id,room,id,context.organizationId,property.id).run();
    await emitReportEvent({organizationId:context.organizationId,propertyId:property.id,sourceModule:"NIGHT_AUDIT",eventType:"WORK_ORDER_CREATED",
      entityType:"work_order",entityId:id,idempotencyKey:`work-order:${id}:created`,occurredAt:now.toISOString(),payload:{room,department,source:"night-room-report"},
      facts:[{factType:maintenance?"maintenance-work":"housekeeping-work",entityType:"work_order",entityId:id,
        sourceTable:"operational_work_orders",sourceRecordId:id,department,roomReference:room,status:"ASSIGNED",occurredAt:now.toISOString(),
        dimensions:{priority:maintenance?"HIGH":"MEDIUM",workType}}]});
    created++;
  }
  await db().prepare(`INSERT INTO night_room_report_imports
    (id,organization_id,property_id,object_key,file_name,rooms_read,assignments_created,imported_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(),context.organizationId,property.id,objectKey,fileName.slice(0,180),read,created,email,new Date().toISOString()).run();
  await recordSystemAudit({organizationId:context.organizationId,propertyId:property.id,eventType:"night_room_report.imported",
    entityType:"NIGHT_ROOM_REPORT",entityId:objectKey,authorType:"USER",authorId:email,correlationId:objectKey,
    delta:{fileName:fileName.slice(0,180),roomsRead:read,assignmentsCreated:created}});
  return {roomsRead:read,assignmentsCreated:created};
}

export async function saveAttachment(email:string,workOrderId:string,file:{name:string;type:string;size:number},objectKey:string,evidenceArea="FINAL_WIDE",evidenceStage="AFTER",requestedPropertyId?:string) {
  const scope=await workflowScope(email,requestedPropertyId);if(!scope)return null;
  const {context,property}=scope;
  const owns=await db().prepare("SELECT id,department,work_type,assigned_to FROM operational_work_orders WHERE id=? AND organization_id=? AND property_id=?")
    .bind(workOrderId,context.organizationId,property.id).first<{id:string;department:string;work_type:string;assigned_to:string|null}>();
  if(!owns) return null;
  if(!await mayOperateDepartment(context,property.id,owns.department,owns.assigned_to))return null;
  const allowed=requiredEvidenceAreas(owns.department,owns.work_type);
  const area=allowed.includes(evidenceArea)?evidenceArea:allowed[0];
  const stage=["BEFORE","DURING","AFTER"].includes(evidenceStage)?evidenceStage:"AFTER";
  const id=crypto.randomUUID();
  const now=new Date().toISOString();
  const isImage=file.type.startsWith("image/");
  // File size proves only that bytes arrived. It cannot prove cleanliness,
  // workmanship, lighting, framing, or brand-standard compliance.
  const reviewStatus=isImage?"PENDING_SUPERVISOR_REVIEW":"SUPPORTING_DOCUMENT";
  await db().batch([
    db().prepare(`INSERT INTO work_order_attachments (id,organization_id,property_id,work_order_id,object_key,file_name,content_type,size_bytes,uploaded_by,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(id,context.organizationId,property.id,workOrderId,objectKey,file.name.slice(0,180),file.type||"application/octet-stream",file.size,email,now),
    db().prepare(`INSERT INTO work_evidence_reviews
      (id,organization_id,property_id,work_order_id,attachment_id,evidence_area,evidence_stage,review_status,quality_score,
       deficiencies_json,provider_label,reviewer_email,reviewer_note,reviewed_at,created_at)
      VALUES (?,?,?,?,?,?,?,?,NULL,?,'UPLOAD_INTEGRITY_ONLY_V1',NULL,NULL,NULL,?)`)
      .bind(crypto.randomUUID(),context.organizationId,property.id,workOrderId,id,area,stage,
        reviewStatus,JSON.stringify([]),now),
  ]);
  await recordSystemAudit({organizationId:context.organizationId,propertyId:property.id,eventType:"work_order.evidence.attached",
    entityType:"WORK_ORDER_ATTACHMENT",entityId:id,authorType:"USER",authorId:email,correlationId:workOrderId,
    delta:{fileName:file.name.slice(0,180),contentType:file.type||"application/octet-stream",sizeBytes:file.size,evidenceArea:area,evidenceStage:stage}});
  await emitReportEvent({organizationId:context.organizationId,propertyId:property.id,sourceModule:"PROPERTY_WORKFLOWS",eventType:"EVIDENCE_ATTACHED",
    entityType:"attachment",entityId:id,idempotencyKey:`attachment:${id}:created`,occurredAt:now,
    payload:{workOrderId,fileName:file.name,evidenceArea:area,evidenceStage:stage,reviewStatus},
    facts:[{factType:"evidence-file",entityType:"attachment",entityId:id,sourceTable:"work_order_attachments",sourceRecordId:id,
      employeeEmail:email,status:"UPLOADED",occurredAt:now,unit:"files",dimensions:{workOrderId,fileName:file.name}}]});
  return {id};
}

export async function decideEvidenceReview(email:string,reviewId:string,decision:string,note:string,requestedPropertyId?:string){
  const scope=await workflowScope(email,requestedPropertyId,true);if(!scope)return null;
  const {context,property}=scope;
  const review=await db().prepare("SELECT work_order_id,review_status FROM work_evidence_reviews WHERE id=? AND organization_id=? AND property_id=?")
    .bind(reviewId,context.organizationId,property.id).first<{work_order_id:string;review_status:string}>();
  if(!review)return null;
  const status=decision==="APPROVE"?"MANAGER_APPROVED":"REWORK_REQUIRED",now=new Date().toISOString();
  await db().prepare(`UPDATE work_evidence_reviews SET review_status=?,reviewer_email=?,reviewer_note=?,reviewed_at=?
    WHERE id=? AND organization_id=? AND property_id=?`).bind(status,email,note.slice(0,1000),now,reviewId,context.organizationId,property.id).run();
  if(review&&status==="REWORK_REQUIRED")await db().prepare(`UPDATE operational_work_orders SET status='REWORK_REQUIRED',
    progress=75,updated_at=? WHERE id=? AND organization_id=? AND property_id=?`).bind(now,review.work_order_id,context.organizationId,property.id).run();
  await recordSystemAudit({organizationId:context.organizationId,propertyId:property.id,eventType:"work_order.evidence.reviewed",
    entityType:"WORK_EVIDENCE_REVIEW",entityId:reviewId,authorType:"USER",authorId:email,correlationId:review.work_order_id,
    before:{status:review.review_status},after:{status,note:note.slice(0,1000)},delta:{status}});
  return{reviewId,status};
}

export async function attachmentForUser(email:string,id:string,requestedPropertyId?:string) {
  const scope=await workflowScope(email,requestedPropertyId);if(!scope)return null;
  const item=await db().prepare("SELECT * FROM work_order_attachments WHERE id=? AND organization_id=? AND property_id=?")
    .bind(id,scope.context.organizationId,scope.property.id).first<Record<string,any>>();
  if(item)await recordSystemAudit({organizationId:scope.context.organizationId,propertyId:scope.property.id,
    eventType:"work_order.evidence.accessed",entityType:"WORK_ORDER_ATTACHMENT",entityId:id,authorType:"USER",
    authorId:email,correlationId:String(item.work_order_id),delta:{action:"VIEW"}});
  return item;
}
