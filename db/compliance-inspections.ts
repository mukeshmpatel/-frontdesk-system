import { env } from "cloudflare:workers";
import { activeStaffContext } from "./staff";
import { emitReportEvent } from "./reporting-layer";
import { recordSystemAudit } from "./platform-controls";
import { createMaintenanceCase } from "./maintenance-repairs";
import { authorizedPropertyScope } from "./property-scope";
import {
  assertComplianceTransition, COMPLIANCE_BASELINES, COMPLIANCE_POLICY_VERSION, evaluateResponse, nextDueAt,
  targetMatcher, type ComplianceState, type ProgramItem,
} from "../lib/compliance-inspection-engine";

type StaffContext=Exclude<Awaited<ReturnType<typeof activeStaffContext>>,null>;
type Scope={context:StaffContext;property:Record<string,any>;canManage:boolean;canInspect:boolean};

function database():D1Database{if(!env.DB)throw new Error("Compliance workflow storage is unavailable.");return env.DB}

async function scopeFor(email:string,requestedPropertyId?:string|null):Promise<Scope|null>{
  const scoped=await authorizedPropertyScope(email,requestedPropertyId);if(!scoped)return null;const {context,property:canonical}=scoped;
  if(context.role==="admin"){
    return{context,property:canonical,canManage:true,canInspect:true};
  }
  const property=await database().prepare(`SELECT p.*,a.department assignment_department,a.role_label assignment_role FROM property_contexts p
    JOIN property_assignments a ON a.organization_id=p.organization_id AND a.property_id=p.id WHERE p.organization_id=? AND p.id=?
    AND lower(a.user_email)=lower(?) AND a.status='ACTIVE' AND p.status='ACTIVE' LIMIT 1`).bind(context.organizationId,canonical.id,context.email).first<Record<string,any>>();
  if(!property)return null;const department=String(property.assignment_department||"").toUpperCase(),role=String(property.assignment_role||"").toUpperCase();
  return{context,property,canManage:/MANAGER|SUPERVISOR|ADMIN|OWNER/.test(role)||["MANAGEMENT","EXECUTIVE"].includes(department),
    canInspect:department==="COMPLIANCE"||/COMPLIANCE|INSPECTOR/.test(role)};
}

async function inspectorRoster(scope:Scope){
  const result=await database().prepare(`SELECT m.user_email email,m.display_name,a.department,a.role_label,
    CASE WHEN EXISTS(SELECT 1 FROM time_entries t WHERE t.organization_id=m.organization_id AND t.property_id=a.property_id
      AND lower(t.user_email)=lower(m.user_email) AND t.status='open' AND t.clock_out_at IS NULL) THEN 1 ELSE 0 END clocked_in,
    (SELECT COUNT(*) FROM compliance_inspection_cases c WHERE c.organization_id=m.organization_id AND c.property_id=a.property_id
      AND lower(c.assigned_to_email)=lower(m.user_email) AND c.state NOT IN('COMPLIANT','WAIVED','CANCELLED')) open_load
    FROM property_assignments a JOIN staff_members m ON m.organization_id=a.organization_id AND lower(m.user_email)=lower(a.user_email)
    WHERE a.organization_id=? AND a.property_id=? AND a.status='ACTIVE' AND m.status='active'
      AND (upper(a.department)='COMPLIANCE' OR upper(a.role_label) LIKE '%COMPLIANCE%' OR upper(a.role_label) LIKE '%INSPECTOR%')
    ORDER BY clocked_in DESC,open_load,m.user_email`).bind(scope.context.organizationId,scope.property.id).all<Record<string,any>>();
  return result.results.map(row=>({email:String(row.email).toLowerCase(),displayName:String(row.display_name),department:String(row.department||""),
    roleLabel:String(row.role_label||""),clockedIn:Number(row.clocked_in)===1,openLoad:Number(row.open_load||0)}));
}

async function managerEmail(scope:Scope){return database().prepare(`SELECT m.user_email FROM property_assignments a JOIN staff_members m
  ON m.organization_id=a.organization_id AND lower(m.user_email)=lower(a.user_email) WHERE a.organization_id=? AND a.property_id=?
  AND a.status='ACTIVE' AND m.status='active' AND (upper(a.role_label) LIKE '%MANAGER%' OR upper(a.role_label) LIKE '%SUPERVISOR%'
    OR upper(a.role_label) LIKE '%ADMIN%' OR m.role='admin') ORDER BY CASE WHEN m.role='admin' THEN 0 ELSE 1 END,m.user_email LIMIT 1`)
  .bind(scope.context.organizationId,scope.property.id).first<{user_email:string}>()}

async function createException(scope:Scope,sourceId:string,state:string,severity:"MEDIUM"|"HIGH"|"CRITICAL",title:string,detail:string){
  const existing=await database().prepare(`SELECT id FROM automation_exceptions WHERE organization_id=? AND property_id=?
    AND source_type='COMPLIANCE_CASE' AND source_id=? AND exception_state=? AND status='OPEN' LIMIT 1`)
    .bind(scope.context.organizationId,scope.property.id,sourceId,state).first<{id:string}>();if(existing)return{created:false,id:existing.id};
  const manager=await managerEmail(scope),recipient=manager?.user_email||scope.context.email,now=new Date().toISOString(),id=crypto.randomUUID();
  await database().batch([
    database().prepare(`INSERT INTO automation_exceptions(id,organization_id,property_id,source_type,source_id,exception_state,severity,title,
      detail,extracted_json,missing_fields_json,recommended_action,owner_email,status,retry_count,next_retry_at,created_at,updated_at)
      VALUES(?,?,?,'COMPLIANCE_CASE',?,?,?,?,?,'{}','[]','Open AAIQ Compliance Center, review source evidence and record the reserved human decision.',?,'OPEN',0,NULL,?,?)`)
      .bind(id,scope.context.organizationId,scope.property.id,sourceId,state,severity,title,detail,recipient,now,now),
    database().prepare(`INSERT INTO staff_notifications(id,organization_id,event_id,recipient_email,sender_email,title,message,status,created_at,read_at)
      VALUES(?,?,NULL,?,'AAIQ-COMPLIANCE',?,?,'unread',?,NULL)`).bind(crypto.randomUUID(),scope.context.organizationId,recipient,title,detail,now),
  ]);return{created:true,id};
}

async function appendEvent(scope:Scope,caseId:string,eventType:string,fromState:string|null,toState:string|null,actorType:"USER"|"SYSTEM",actorId:string,detail:Record<string,unknown>){
  await database().prepare(`INSERT INTO compliance_case_events(id,organization_id,property_id,case_id,event_type,from_state,to_state,actor_type,actor_id,detail_json,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),scope.context.organizationId,scope.property.id,caseId,eventType,fromState,toState,
    actorType,actorId,JSON.stringify(detail),new Date().toISOString()).run();
}

async function ensureDigitalDuty(scope:Scope){const now=new Date().toISOString();await database().prepare(`INSERT INTO digital_employee_duties
  (id,organization_id,authority_definition_id,role_key,duty_key,duty_name,trigger_type,trigger_definition,data_sources_json,
   decision_logic_description,tool_or_action_used,verification_method,confidence_threshold,retry_policy,escalation_condition,
   escalation_target,status,created_at,updated_at)
  VALUES(?,?,NULL,'COMPLIANCE_INSPECTOR','RULE_TO_REVIEWED_CLOSURE','Coordinate due compliance inspections','schedule',?,?,?,?,?,0.90,?,?,?,'working_incomplete',?,?)
  ON CONFLICT(organization_id,role_key,duty_key) DO UPDATE SET trigger_definition=excluded.trigger_definition,data_sources_json=excluded.data_sources_json,
    decision_logic_description=excluded.decision_logic_description,tool_or_action_used=excluded.tool_or_action_used,
    verification_method=excluded.verification_method,retry_policy=excluded.retry_policy,escalation_condition=excluded.escalation_condition,
    escalation_target=excluded.escalation_target,updated_at=excluded.updated_at`)
  .bind(crypto.randomUUID(),scope.context.organizationId,"Approved property compliance program becomes due.",
    JSON.stringify(["compliance_programs","compliance_program_items","property_assets","property_assignments","compliance_inspection_cases"]),
    `Deterministic ${COMPLIANCE_POLICY_VERSION} due/target/assignment and failure-containment policy.`,
    "Create local due cases, route to eligible inspectors, validate required records, open exceptions, and monitor deadlines; never perform physical or legal sign-off.",
    "Approved source, exact target, required typed responses, private evidence, independent qualified review, and immutable trace.",
    "Retry idempotent provisioning and due-case creation up to three times; never retry inspection, waiver, or sign-off actions.",
    "Missing source/asset/inspector, failed critical item, overdue work, missing evidence, or rejected independent review.",
    "Property Compliance manager or administrator; qualified/licensed human where configured.",now,now).run()}

async function prepareBaselineScope(scope:Scope){
  const now=new Date().toISOString();let prepared=0;
  for(const definition of COMPLIANCE_BASELINES){
    let template=await database().prepare(`SELECT id FROM maintenance_compliance_templates WHERE organization_id=? AND property_id=? AND code=?`)
      .bind(scope.context.organizationId,scope.property.id,definition.code).first<{id:string}>();
    if(!template){const id=crypto.randomUUID();await database().prepare(`INSERT INTO maintenance_compliance_templates
      (id,organization_id,code,name,description,frequency,required_evidence,active,next_due_at,property_id) VALUES(?,?,?,?,?,?,?,?,?,?)`)
      .bind(id,scope.context.organizationId,definition.code,definition.name,definition.description,definition.frequency,definition.evidence.join(", "),1,now,scope.property.id).run();template={id}}
    let program=await database().prepare(`SELECT id FROM compliance_programs WHERE organization_id=? AND property_id=? AND program_code=?`)
      .bind(scope.context.organizationId,scope.property.id,definition.code).first<{id:string}>();
    if(!program){const id=crypto.randomUUID();await database().prepare(`INSERT INTO compliance_programs(id,organization_id,property_id,template_id,
      program_code,target_kind,source_status,licensed_signoff_required,required_evidence_json,frequency,active,next_due_at,created_at,updated_at)
      VALUES(?,?,?,?,?,?,'CONFIGURATION_REQUIRED',?,?,?,1,?,?,?)`).bind(id,scope.context.organizationId,scope.property.id,template.id,
      definition.code,definition.targetKind,definition.licensedSignoffRequired?1:0,JSON.stringify(definition.evidence),definition.frequency,now,now,now).run();program={id};prepared++}
    for(const [index,item] of definition.items.entries())await database().prepare(`INSERT INTO compliance_program_items(id,organization_id,property_id,
      program_id,item_code,step_number,instruction,response_type,required,critical,measurement_unit,minimum_value,maximum_value,
      evidence_required_on_failure,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(organization_id,property_id,program_id,item_code)
      DO UPDATE SET step_number=excluded.step_number,instruction=excluded.instruction,response_type=excluded.response_type,required=excluded.required,
      critical=excluded.critical,measurement_unit=excluded.measurement_unit,minimum_value=excluded.minimum_value,maximum_value=excluded.maximum_value,
      evidence_required_on_failure=excluded.evidence_required_on_failure,updated_at=excluded.updated_at`)
      .bind(crypto.randomUUID(),scope.context.organizationId,scope.property.id,program.id,item.code,index+1,item.instruction,item.responseType,
        item.required?1:0,item.critical?1:0,item.measurementUnit||null,item.minimum??null,item.maximum??null,item.evidenceRequiredOnFailure?1:0,now,now).run();
  }
  await ensureDigitalDuty(scope);return prepared;
}

export async function prepareComplianceBaseline(email:string,requestedPropertyId?:string|null){const scope=await scopeFor(email,requestedPropertyId);
  if(!scope||!scope.canManage)return null;const prepared=await prepareBaselineScope(scope);const pending=await database().prepare(`SELECT COUNT(*) count FROM compliance_programs
    WHERE organization_id=? AND property_id=? AND source_status='CONFIGURATION_REQUIRED'`).bind(scope.context.organizationId,scope.property.id).first<{count:number}>();
  if(Number(pending?.count||0)>0)await createException(scope,scope.property.id,"SOURCE_CONFIGURATION","HIGH","Compliance sources require approval",
    `${pending?.count||0} baseline program(s) need a property-approved SOP, authority, jurisdiction, or certificate source before due inspections can be certified.`);
  await recordSystemAudit({organizationId:scope.context.organizationId,propertyId:scope.property.id,eventType:"COMPLIANCE_BASELINE_PREPARED",
    entityType:"PROPERTY",entityId:scope.property.id,authorType:"USER",authorId:scope.context.email,correlationId:scope.property.id,
    delta:{prepared,pendingSources:Number(pending?.count||0),policy:COMPLIANCE_POLICY_VERSION}});return{prepared,pendingSources:Number(pending?.count||0)}}

export async function configureComplianceProgram(email:string,input:Record<string,unknown>,requestedPropertyId?:string|null){const scope=await scopeFor(email,requestedPropertyId);
  if(!scope||!scope.canManage)return null;const id=String(input.programId||""),sourceTitle=String(input.sourceTitle||"").trim().slice(0,240),
    sourceReference=String(input.sourceReference||"").trim().slice(0,500),jurisdiction=String(input.jurisdiction||"").trim().slice(0,160),
    effectiveDate=String(input.effectiveDate||"");if(!id||!sourceTitle||!sourceReference||!jurisdiction||!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate))
      throw new Error("Source title, reference, jurisdiction, and effective date are required.");
  const row=await database().prepare(`SELECT id,source_status,program_code FROM compliance_programs WHERE id=? AND organization_id=? AND property_id=?`)
    .bind(id,scope.context.organizationId,scope.property.id).first<Record<string,any>>();if(!row)return null;const now=new Date().toISOString();
  const numericItems=await database().prepare(`SELECT id,item_code,critical,minimum_value,maximum_value FROM compliance_program_items
    WHERE organization_id=? AND property_id=? AND program_id=? AND response_type='NUMBER' ORDER BY step_number`)
    .bind(scope.context.organizationId,scope.property.id,id).all<Record<string,any>>();
  const ranges=typeof input.itemRanges==="object"&&input.itemRanges?input.itemRanges as Record<string,unknown>:{};
  const updates:D1PreparedStatement[]=[];const approvedRanges:Record<string,{minimum:number|null;maximum:number|null}>={};
  for(const item of numericItems.results){
    const raw=typeof ranges[item.id]==="object"&&ranges[item.id]?ranges[item.id] as Record<string,unknown>:{};
    const minimum=raw.minimum===""||raw.minimum==null?null:Number(raw.minimum),maximum=raw.maximum===""||raw.maximum==null?null:Number(raw.maximum);
    if((minimum!=null&&!Number.isFinite(minimum))||(maximum!=null&&!Number.isFinite(maximum))||(minimum!=null&&maximum!=null&&minimum>maximum))
      throw new Error(`Enter a valid approved range for ${item.item_code}.`);
    if(Number(item.critical)===1&&(minimum==null||maximum==null))throw new Error(`Critical numeric item ${item.item_code} requires an approved minimum and maximum.`);
    approvedRanges[item.item_code]={minimum,maximum};updates.push(database().prepare(`UPDATE compliance_program_items SET minimum_value=?,maximum_value=?,updated_at=?
      WHERE id=? AND organization_id=? AND property_id=? AND program_id=?`).bind(minimum,maximum,now,item.id,scope.context.organizationId,scope.property.id,id));
  }
  await database().batch([
    database().prepare(`UPDATE compliance_programs SET source_status='APPROVED',source_title=?,source_reference=?,jurisdiction=?,effective_date=?,
      configured_by=?,configured_at=?,updated_at=? WHERE id=? AND organization_id=? AND property_id=?`)
      .bind(sourceTitle,sourceReference,jurisdiction,effectiveDate,scope.context.email,now,now,id,scope.context.organizationId,scope.property.id),
    ...updates,
  ]);
  const pending=await database().prepare(`SELECT COUNT(*) count FROM compliance_programs WHERE organization_id=? AND property_id=? AND source_status='CONFIGURATION_REQUIRED'`)
    .bind(scope.context.organizationId,scope.property.id).first<{count:number}>();
  if(Number(pending?.count||0)===0)await database().prepare(`UPDATE automation_exceptions SET status='RESOLVED',updated_at=? WHERE organization_id=? AND property_id=?
    AND source_type='COMPLIANCE_CASE' AND source_id=? AND exception_state='SOURCE_CONFIGURATION' AND status='OPEN'`)
    .bind(now,scope.context.organizationId,scope.property.id,scope.property.id).run();
  await recordSystemAudit({organizationId:scope.context.organizationId,propertyId:scope.property.id,eventType:"COMPLIANCE_PROGRAM_SOURCE_APPROVED",
    entityType:"COMPLIANCE_PROGRAM",entityId:id,authorType:"USER",authorId:scope.context.email,correlationId:id,
    before:{sourceStatus:String(row.source_status)},after:{sourceStatus:"APPROVED"},delta:{sourceTitle,sourceReference,jurisdiction,effectiveDate,approvedRanges}});
  return{id,sourceStatus:"APPROVED"}}

async function createDueCases(scope:Scope,horizonHours=48){
  await prepareBaselineScope(scope);const horizon=new Date(Date.now()+Math.max(0,Math.min(168,horizonHours))*3600_000).toISOString();
  const programs=await database().prepare(`SELECT p.*,t.name,t.description FROM compliance_programs p JOIN maintenance_compliance_templates t
    ON t.id=p.template_id AND t.organization_id=p.organization_id AND t.property_id=p.property_id WHERE p.organization_id=? AND p.property_id=?
    AND p.active=1 AND p.source_status='APPROVED' AND p.next_due_at<=? ORDER BY p.next_due_at`)
    .bind(scope.context.organizationId,scope.property.id,horizon).all<Record<string,any>>();
  const roster=await inspectorRoster(scope);let casesCreated=0,exceptionsCreated=0;
  for(const program of programs.results){const matcher=targetMatcher(String(program.target_kind));
    if(!matcher){const result=await createException(scope,program.id,"TARGET_RULE_MISSING","HIGH",`Target rule missing · ${program.name}`,
      `Program ${program.program_code} has no governed target rule.`);exceptionsCreated+=result.created?1:0;continue}
    const targets=await database().prepare(`SELECT id,name,code,room_number FROM property_assets WHERE organization_id=? AND property_id=? AND status!='INACTIVE' AND ${matcher} ORDER BY code`)
      .bind(scope.context.organizationId,scope.property.id).all<Record<string,any>>();
    if(!targets.results.length){const result=await createException(scope,program.id,"TARGET_ASSET_MISSING","HIGH",`Required assets missing · ${program.name}`,
      `No active ${program.target_kind} asset exists at ${scope.property.name}. AAIQ did not invent a property-wide target.`);exceptionsCreated+=result.created?1:0;continue}
    for(const target of targets.results){const dueKey=`${program.id}:${String(program.next_due_at).slice(0,10)}`;
      const exists=await database().prepare(`SELECT id FROM compliance_inspection_cases WHERE organization_id=? AND property_id=? AND program_id=?
        AND target_asset_id=? AND due_instance_key=?`).bind(scope.context.organizationId,scope.property.id,program.id,target.id,dueKey).first();if(exists)continue;
      const assignee=roster[0]||null,state:ComplianceState=assignee?"ASSIGNED":"UNASSIGNED",now=new Date().toISOString(),caseId=crypto.randomUUID(),workOrderId=crypto.randomUUID();
      const targetLabel=target.room_number?`Room ${target.room_number} · ${target.name}`:String(target.name),assignmentReason=assignee?
        `${assignee.clockedIn?"Clocked-in":"Active"} eligible property inspector with ${assignee.openLoad} open case(s).`:
        "No active same-property Compliance inspector is available.";
      await database().batch([
        database().prepare(`INSERT INTO operational_work_orders(id,organization_id,property_id,department,work_type,title,description,room_number,asset_id,
          assigned_to,status,progress,priority,parent_order_id,due_at,created_by,created_at,updated_at,completed_at)
          VALUES(?,?,?,'COMPLIANCE','COMPLIANCE_INSPECTION',?,?,?,?,?,'ASSIGNED',0,'HIGH',NULL,?,'AAIQ-COMPLIANCE',?,?,NULL)`)
          .bind(workOrderId,scope.context.organizationId,scope.property.id,`${program.name} — ${targetLabel}`,program.description,target.room_number||null,target.id,
            assignee?.email||null,program.next_due_at,now,now),
        database().prepare(`INSERT INTO compliance_inspection_cases(id,organization_id,property_id,program_id,template_id,work_order_id,target_asset_id,target_label,
          due_instance_key,state,assigned_to_email,assignment_reason,due_at,created_by,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'AAIQ-COMPLIANCE',?,?)`).bind(caseId,scope.context.organizationId,scope.property.id,program.id,program.template_id,
            workOrderId,target.id,targetLabel,dueKey,state,assignee?.email||null,assignmentReason,program.next_due_at,now,now),
      ]);await appendEvent(scope,caseId,"COMPLIANCE_CASE_CREATED",null,state,"SYSTEM","AAIQ-COMPLIANCE",{programCode:program.program_code,
        targetAssetId:target.id,targetLabel,assignedTo:assignee?.email||null,assignmentReason,sourceReference:program.source_reference,policy:COMPLIANCE_POLICY_VERSION});
      await emitReportEvent({organizationId:scope.context.organizationId,propertyId:scope.property.id,sourceModule:"COMPLIANCE",eventType:"COMPLIANCE_CASE_CREATED",
        entityType:"compliance_case",entityId:caseId,idempotencyKey:`compliance:${caseId}:created`,occurredAt:now,
        payload:{programCode:program.program_code,targetAssetId:target.id,state},facts:[{factType:"compliance-work",entityType:"compliance_case",entityId:caseId,
          sourceTable:"compliance_inspection_cases",sourceRecordId:caseId,department:"COMPLIANCE",employeeEmail:assignee?.email||null,
          roomReference:target.room_number||null,status:state,occurredAt:now,dimensions:{programCode:program.program_code,targetKind:program.target_kind,
            sourceStatus:program.source_status,policy:COMPLIANCE_POLICY_VERSION}}]});
      if(!assignee){const result=await createException(scope,caseId,"UNASSIGNED","HIGH",`Unassigned compliance inspection · ${program.name}`,
        `No active same-property Compliance inspector can accept ${targetLabel}.`);exceptionsCreated+=result.created?1:0}casesCreated++;
    }
  }return{programsEvaluated:programs.results.length,casesCreated,exceptionsCreated};
}

export async function runComplianceAutomation(email:string,requestedPropertyId?:string|null){const scope=await scopeFor(email,requestedPropertyId);
  if(!scope||!scope.canManage)return null;const day=new Date().toISOString().slice(0,13),runKey=`manual:${day}:${scope.context.email}`;
  const existing=await database().prepare(`SELECT * FROM compliance_automation_runs WHERE organization_id=? AND property_id=? AND run_key=?`)
    .bind(scope.context.organizationId,scope.property.id,runKey).first<Record<string,any>>();if(existing)return{...existing,duplicate:true};
  const started=new Date().toISOString(),result=await createDueCases(scope),completed=new Date().toISOString();
  await database().prepare(`INSERT INTO compliance_automation_runs(id,organization_id,property_id,run_key,programs_prepared,cases_created,exceptions_created,started_at,completed_at)
    VALUES(?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),scope.context.organizationId,scope.property.id,runKey,COMPLIANCE_BASELINES.length,result.casesCreated,
      result.exceptionsCreated,started,completed).run();await recordSystemAudit({organizationId:scope.context.organizationId,propertyId:scope.property.id,
      eventType:"COMPLIANCE_AUTOMATION_RUN",entityType:"PROPERTY",entityId:scope.property.id,authorType:"USER",authorId:scope.context.email,
      correlationId:runKey,delta:{...result,policy:COMPLIANCE_POLICY_VERSION}});return{...result,duplicate:false}}

export async function complianceCenter(email:string,requestedPropertyId?:string|null){const scope=await scopeFor(email,requestedPropertyId);if(!scope)return null;
  const [programs,items,cases,responses,evidence,reviews,events,assets,exceptions,runs]=await Promise.all([
    database().prepare(`SELECT p.*,t.name,t.description,t.required_evidence FROM compliance_programs p JOIN maintenance_compliance_templates t
      ON t.id=p.template_id AND t.organization_id=p.organization_id AND t.property_id=p.property_id WHERE p.organization_id=? AND p.property_id=? ORDER BY p.program_code`)
      .bind(scope.context.organizationId,scope.property.id).all(),
    database().prepare(`SELECT * FROM compliance_program_items WHERE organization_id=? AND property_id=? ORDER BY program_id,step_number`).bind(scope.context.organizationId,scope.property.id).all(),
    database().prepare(`SELECT c.*,p.program_code,p.source_status,p.source_title,p.source_reference,p.jurisdiction,p.effective_date,p.licensed_signoff_required,
      p.required_evidence_json,p.frequency,t.name program_name,t.description program_description,a.code asset_code,a.name asset_name,a.room_number,
      w.status work_order_status,w.progress work_order_progress FROM compliance_inspection_cases c JOIN compliance_programs p ON p.id=c.program_id
      AND p.organization_id=c.organization_id AND p.property_id=c.property_id JOIN maintenance_compliance_templates t ON t.id=c.template_id
      LEFT JOIN property_assets a ON a.id=c.target_asset_id AND a.organization_id=c.organization_id AND a.property_id=c.property_id
      JOIN operational_work_orders w ON w.id=c.work_order_id AND w.organization_id=c.organization_id AND w.property_id=c.property_id
      WHERE c.organization_id=? AND c.property_id=? ORDER BY CASE c.state WHEN 'FAILED_HOLD' THEN 1 WHEN 'REMEDIATION_REQUIRED' THEN 2
      WHEN 'UNASSIGNED' THEN 3 ELSE 4 END,c.due_at`).bind(scope.context.organizationId,scope.property.id).all(),
    database().prepare(`SELECT r.*,i.item_code,i.instruction FROM compliance_inspection_responses r JOIN compliance_program_items i ON i.id=r.program_item_id
      WHERE r.organization_id=? AND r.property_id=? ORDER BY r.created_at DESC`).bind(scope.context.organizationId,scope.property.id).all(),
    database().prepare(`SELECT l.*,a.file_name,a.content_type,a.size_bytes,r.review_status FROM compliance_evidence_links l
      JOIN work_order_attachments a ON a.id=l.attachment_id JOIN work_evidence_reviews r ON r.attachment_id=l.attachment_id
      WHERE l.organization_id=? AND l.property_id=? ORDER BY l.created_at DESC`).bind(scope.context.organizationId,scope.property.id).all(),
    database().prepare(`SELECT * FROM compliance_case_reviews WHERE organization_id=? AND property_id=? ORDER BY created_at DESC`).bind(scope.context.organizationId,scope.property.id).all(),
    database().prepare(`SELECT * FROM compliance_case_events WHERE organization_id=? AND property_id=? ORDER BY created_at DESC LIMIT 1000`).bind(scope.context.organizationId,scope.property.id).all(),
    database().prepare(`SELECT id,asset_type,code,name,room_number FROM property_assets WHERE organization_id=? AND property_id=? AND status!='INACTIVE' ORDER BY asset_type,code`)
      .bind(scope.context.organizationId,scope.property.id).all(),
    database().prepare(`SELECT id,source_id,exception_state,severity,title,detail,owner_email,status,created_at FROM automation_exceptions
      WHERE organization_id=? AND property_id=? AND source_type='COMPLIANCE_CASE' ORDER BY created_at DESC LIMIT 200`).bind(scope.context.organizationId,scope.property.id).all(),
    database().prepare(`SELECT * FROM compliance_automation_runs WHERE organization_id=? AND property_id=? ORDER BY completed_at DESC LIMIT 20`).bind(scope.context.organizationId,scope.property.id).all(),
  ]);const roster=await inspectorRoster(scope),programRows=(programs.results as Record<string,any>[]).map(program=>({...program,
    items:(items.results as Record<string,any>[]).filter(item=>item.program_id===program.id),
  })),caseRows=(cases.results as Record<string,any>[]).map(row=>({...row,
    items:(items.results as Record<string,any>[]).filter(item=>item.program_id===row.program_id),
    responses:(responses.results as Record<string,any>[]).filter(item=>item.case_id===row.id),
    evidence:(evidence.results as Record<string,any>[]).filter(item=>item.case_id===row.id),
    reviews:(reviews.results as Record<string,any>[]).filter(item=>item.case_id===row.id),
    events:(events.results as Record<string,any>[]).filter(item=>item.case_id===row.id),
    exceptions:(exceptions.results as Record<string,any>[]).filter(item=>item.source_id===row.id),
  }));return{roleMode:scope.canManage?"MANAGER":scope.canInspect?"INSPECTOR":"READ_ONLY",property:scope.property,programs:programRows,
    cases:caseRows,roster,assets:assets.results,exceptions:exceptions.results,runs:runs.results,policyVersion:COMPLIANCE_POLICY_VERSION,
    limitations:{physicalInspectionHuman:true,licensedSignoffHuman:true,publicSubmissionDisabled:true,visionProviderConnected:false}}}

async function loadCase(scope:Scope,id:string){return database().prepare(`SELECT c.*,p.source_status,p.source_reference,p.licensed_signoff_required,p.required_evidence_json,
  p.frequency,p.next_due_at,t.name program_name,a.code asset_code,a.name asset_name,a.room_number,w.status work_order_status,w.progress work_order_progress
  FROM compliance_inspection_cases c JOIN compliance_programs p ON p.id=c.program_id
  JOIN maintenance_compliance_templates t ON t.id=c.template_id
  LEFT JOIN property_assets a ON a.id=c.target_asset_id AND a.organization_id=c.organization_id AND a.property_id=c.property_id
  JOIN operational_work_orders w ON w.id=c.work_order_id AND w.organization_id=c.organization_id AND w.property_id=c.property_id
  WHERE c.id=? AND c.organization_id=? AND c.property_id=?`)
  .bind(id,scope.context.organizationId,scope.property.id).first<Record<string,any>>()}
function operatorAllowed(scope:Scope,item:Record<string,any>){return scope.canManage||(scope.canInspect&&String(item.assigned_to_email||"").toLowerCase()===scope.context.email.toLowerCase())}

async function transition(scope:Scope,item:Record<string,any>,next:ComplianceState,eventType:string,actorType:"USER"|"SYSTEM",actorId:string,detail:Record<string,unknown>){
  assertComplianceTransition(String(item.state),next);const now=new Date().toISOString(),progress=next==="ASSIGNED"?5:next==="ACKNOWLEDGED"?15:next==="INSPECTING"?45:
    next==="AWAITING_EVIDENCE"?70:next==="AWAITING_REVIEW"?90:["COMPLIANT","WAIVED"].includes(next)?100:next==="REWORK_REQUIRED"?60:Number(item.work_order_progress||0),
    workStatus=next==="COMPLIANT"?"VERIFIED":next==="WAIVED"?"COMPLETE":next==="CANCELLED"?"CANCELLED":next==="REWORK_REQUIRED"?"REWORK_REQUIRED":
      ["FAILED_HOLD","REMEDIATION_REQUIRED"].includes(next)?"BLOCKED":next==="ASSIGNED"?"ASSIGNED":"IN_PROGRESS";
  await database().batch([
    database().prepare(`UPDATE compliance_inspection_cases SET state=?,acknowledged_at=CASE WHEN ?='ACKNOWLEDGED' THEN COALESCE(acknowledged_at,?) ELSE acknowledged_at END,
      inspection_started_at=CASE WHEN ?='INSPECTING' THEN COALESCE(inspection_started_at,?) ELSE inspection_started_at END,
      submitted_at=CASE WHEN ?='AWAITING_REVIEW' THEN ? ELSE submitted_at END,closed_at=CASE WHEN ? IN('COMPLIANT','WAIVED','CANCELLED') THEN ? ELSE closed_at END,
      updated_at=? WHERE id=? AND organization_id=? AND property_id=?`).bind(next,next,now,next,now,next,now,next,now,now,item.id,scope.context.organizationId,scope.property.id),
    database().prepare(`UPDATE operational_work_orders SET status=?,progress=?,assigned_to=?,updated_at=?,completed_at=CASE WHEN ? IN('VERIFIED','COMPLETE') THEN ? ELSE completed_at END
      WHERE id=? AND organization_id=? AND property_id=?`).bind(workStatus,progress,item.assigned_to_email,now,workStatus,now,item.work_order_id,scope.context.organizationId,scope.property.id),
  ]);await appendEvent(scope,item.id,eventType,String(item.state),next,actorType,actorId,detail);
  await recordSystemAudit({organizationId:scope.context.organizationId,propertyId:scope.property.id,eventType,entityType:"COMPLIANCE_CASE",entityId:item.id,
    authorType:actorType,authorId:actorId,correlationId:item.id,before:{state:String(item.state)},after:{state:next},delta:JSON.parse(JSON.stringify(detail))});
  await emitReportEvent({organizationId:scope.context.organizationId,propertyId:scope.property.id,sourceModule:"COMPLIANCE",eventType,
    entityType:"compliance_case",entityId:item.id,idempotencyKey:`compliance:${item.id}:${eventType}:${now}`,occurredAt:now,
    payload:{fromState:item.state,toState:next,...detail},facts:[{factType:"compliance-work",entityType:"compliance_case",entityId:item.id,
      sourceTable:"compliance_inspection_cases",sourceRecordId:item.id,department:"COMPLIANCE",employeeEmail:item.assigned_to_email,
      status:next,occurredAt:now,dimensions:{programName:item.program_name,eventType,policy:COMPLIANCE_POLICY_VERSION}}]});return{id:item.id,state:next}}

async function latestResponses(scope:Scope,caseId:string){return database().prepare(`SELECT * FROM (SELECT r.*,i.required,i.critical,i.item_code,
  ROW_NUMBER() OVER(PARTITION BY r.program_item_id ORDER BY r.created_at DESC) rn FROM compliance_inspection_responses r JOIN compliance_program_items i
  ON i.id=r.program_item_id AND i.organization_id=r.organization_id AND i.property_id=r.property_id WHERE r.organization_id=? AND r.property_id=? AND r.case_id=?)
  WHERE rn=1`).bind(scope.context.organizationId,scope.property.id,caseId).all<Record<string,any>>()}

export async function actOnComplianceCase(email:string,id:string,input:Record<string,unknown>,requestedPropertyId?:string|null){const scope=await scopeFor(email,requestedPropertyId);
  if(!scope)return null;const item=await loadCase(scope,id);if(!item)return null;const action=String(input.action||"").toUpperCase(),now=new Date().toISOString();
  if(action==="REASSIGN"){if(!scope.canManage)return null;const emailTo=String(input.assignedToEmail||"").toLowerCase(),roster=await inspectorRoster(scope),assignee=roster.find(row=>row.email===emailTo);
    if(!assignee)throw new Error("Choose an active Compliance inspector assigned to this property.");const next=item.state==="UNASSIGNED"?"ASSIGNED":item.state as ComplianceState;
    if(item.state==="UNASSIGNED")assertComplianceTransition(item.state,next);await database().batch([
      database().prepare(`UPDATE compliance_inspection_cases SET assigned_to_email=?,assignment_reason=?,state=?,updated_at=? WHERE id=? AND organization_id=? AND property_id=?`)
        .bind(assignee.email,`Manager assigned eligible property inspector ${assignee.email}.`,next,now,id,scope.context.organizationId,scope.property.id),
      database().prepare(`UPDATE operational_work_orders SET assigned_to=?,status='ASSIGNED',updated_at=? WHERE id=? AND organization_id=? AND property_id=?`)
        .bind(assignee.email,now,item.work_order_id,scope.context.organizationId,scope.property.id),
    ]);await appendEvent(scope,id,"COMPLIANCE_CASE_ASSIGNED",item.state,next,"USER",scope.context.email,{assignedTo:assignee.email});return{id,state:next,assignedTo:assignee.email}}
  if(!operatorAllowed(scope,item))return null;
  if(action==="ACKNOWLEDGE")return transition(scope,item,"ACKNOWLEDGED","COMPLIANCE_CASE_ACKNOWLEDGED","USER",scope.context.email,{});
  if(action==="START_INSPECTION")return transition(scope,item,"INSPECTING","COMPLIANCE_INSPECTION_STARTED","USER",scope.context.email,{});
  if(action==="START_REWORK")return transition(scope,item,"INSPECTING","COMPLIANCE_REWORK_STARTED","USER",scope.context.email,{});
  if(action==="RECORD_RESPONSE"){
    if(item.state!=="INSPECTING")throw new Error("Checklist results can be recorded only during an active inspection.");const programItemId=String(input.programItemId||"");
    const row=await database().prepare(`SELECT * FROM compliance_program_items WHERE id=? AND organization_id=? AND property_id=? AND program_id=?`)
      .bind(programItemId,scope.context.organizationId,scope.property.id,item.program_id).first<Record<string,any>>();if(!row)return null;
    const definition:ProgramItem={code:String(row.item_code),instruction:String(row.instruction),responseType:row.response_type,required:Boolean(row.required),critical:Boolean(row.critical),
      measurementUnit:row.measurement_unit||undefined,minimum:row.minimum_value??undefined,maximum:row.maximum_value??undefined,evidenceRequiredOnFailure:Boolean(row.evidence_required_on_failure)};
    const evaluated=evaluateResponse(definition,input),responseId=crypto.randomUUID();await database().prepare(`INSERT INTO compliance_inspection_responses
      (id,organization_id,property_id,case_id,program_item_id,result,value_text,measurement_unit,note,range_failure,critical_failure,recorded_by,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(responseId,scope.context.organizationId,scope.property.id,id,programItemId,evaluated.result,evaluated.value,
        row.measurement_unit||null,evaluated.note,evaluated.rangeFailure?1:0,evaluated.criticalFailure?1:0,scope.context.email,now).run();
    await appendEvent(scope,id,"COMPLIANCE_RESPONSE_RECORDED",item.state,item.state,"USER",scope.context.email,{responseId,itemCode:row.item_code,
      result:evaluated.result,rangeFailure:evaluated.rangeFailure,criticalFailure:evaluated.criticalFailure});
    if(evaluated.result==="FAIL"){
      const remediation=await createMaintenanceCase(scope.context.email,{sourceType:"COMPLIANCE",sourceReference:`compliance-case:${id}:item:${row.item_code}`,
        summary:`Compliance deficiency · ${item.program_name} · ${row.item_code}`,description:evaluated.note,assetId:item.target_asset_id||null,
        roomNumber:item.room_number||null,hazardType:"NONE",guestImpact:false,roomOutage:false,activeLeak:false},scope.property.id);
      await database().prepare(`UPDATE compliance_inspection_cases SET failure_count=failure_count+1,remediation_case_id=COALESCE(remediation_case_id,?),updated_at=?
        WHERE id=? AND organization_id=? AND property_id=?`).bind(remediation?.id||null,now,id,scope.context.organizationId,scope.property.id).run();
      const next:ComplianceState=evaluated.criticalFailure?"FAILED_HOLD":"REMEDIATION_REQUIRED";const refreshed={...item,remediation_case_id:remediation?.id||null};
      const result=await transition(scope,refreshed,next,evaluated.criticalFailure?"COMPLIANCE_CRITICAL_FAILURE":"COMPLIANCE_REMEDIATION_REQUIRED","SYSTEM",
        "AAIQ-COMPLIANCE",{itemCode:row.item_code,responseId,remediationCaseId:remediation?.id||null});
      await createException(scope,id,evaluated.criticalFailure?"CRITICAL_FAILURE":"REMEDIATION_REQUIRED",evaluated.criticalFailure?"CRITICAL":"HIGH",
        `${evaluated.criticalFailure?"Compliance hold":"Compliance remediation"} · ${item.program_name}`,evaluated.note);return{...result,responseId,remediationCaseId:remediation?.id||null};
    }return{id,state:item.state,responseId,result:evaluated.result};
  }
  if(action==="SUBMIT_REVIEW"){
    if(!["INSPECTING","AWAITING_EVIDENCE"].includes(item.state))throw new Error("Finish an active inspection before submission.");
    const responseRows=await latestResponses(scope,id),programItems=await database().prepare(`SELECT * FROM compliance_program_items WHERE organization_id=? AND property_id=? AND program_id=? ORDER BY step_number`)
      .bind(scope.context.organizationId,scope.property.id,item.program_id).all<Record<string,any>>(),answered=new Set(responseRows.results.map(row=>row.program_item_id));
    const missing=programItems.results.filter(row=>Number(row.required)===1&&!answered.has(row.id));if(missing.length)throw new Error(`Complete required items: ${missing.map(row=>row.item_code).join(", ")}.`);
    if(responseRows.results.some(row=>row.result==="FAIL"))throw new Error("Failed items must be remediated and reinspected before review.");
    const required=JSON.parse(String(item.required_evidence_json||"[]")) as string[],evidence=await database().prepare(`SELECT evidence_type FROM compliance_evidence_links
      WHERE organization_id=? AND property_id=? AND case_id=?`).bind(scope.context.organizationId,scope.property.id,id).all<{evidence_type:string}>(),covered=new Set(evidence.results.map(row=>row.evidence_type));
    const missingEvidence=required.filter(type=>!covered.has(type));if(missingEvidence.length){if(item.state==="INSPECTING")await transition(scope,item,"AWAITING_EVIDENCE","COMPLIANCE_EVIDENCE_REQUIRED","SYSTEM","AAIQ-COMPLIANCE",{missingEvidence});
      return{id,state:"AWAITING_EVIDENCE",missingEvidence,nextAction:"Upload each required evidence type, then submit again."}}
    return transition(scope,item,"AWAITING_REVIEW","COMPLIANCE_REVIEW_REQUESTED","USER",scope.context.email,{responseCount:responseRows.results.length,evidenceCoverage:required.length});
  }
  if(action==="RESUME_AFTER_REMEDIATION"){
    if(!scope.canManage||!["FAILED_HOLD","REMEDIATION_REQUIRED"].includes(item.state))return null;if(!item.remediation_case_id)throw new Error("No linked remediation case exists.");
    const remediation=await database().prepare(`SELECT state FROM maintenance_cases WHERE id=? AND organization_id=? AND property_id=?`)
      .bind(item.remediation_case_id,scope.context.organizationId,scope.property.id).first<{state:string}>();if(remediation?.state!=="RETURNED_TO_SERVICE")
      throw new Error("The linked Maintenance remediation must receive independent return-to-service approval first.");
    const note=String(input.note||"").trim().slice(0,1500);if(!note)throw new Error("Record the remediation verification note.");
    return transition(scope,item,"REWORK_REQUIRED","COMPLIANCE_REMEDIATION_VERIFIED","USER",scope.context.email,{remediationCaseId:item.remediation_case_id,note});
  }
  if(action==="REVIEW"){
    if(!scope.canManage||item.state!=="AWAITING_REVIEW")return null;if(String(item.assigned_to_email||"").toLowerCase()===scope.context.email.toLowerCase())
      throw new Error("The inspector cannot approve their own compliance result.");const decision=String(input.decision||"").toUpperCase();
    if(!["COMPLIANT","REWORK_REQUIRED","FAILED_HOLD"].includes(decision))throw new Error("Choose compliant, rework, or failed hold.");
    const note=String(input.note||"").trim().slice(0,1500);if(!note)throw new Error("An independent reviewer note is required.");
    const qualifiedPerson=String(input.qualifiedPerson||"").trim().slice(0,160)||null,credentialReference=String(input.credentialReference||"").trim().slice(0,240)||null;
    if(Number(item.licensed_signoff_required)===1&&(!qualifiedPerson||!credentialReference))throw new Error("This program requires a qualified person and credential/certificate reference.");
    const checklist=typeof input.checklist==="object"&&input.checklist?input.checklist as Record<string,unknown>:{};
    if(!["sourceVerified","targetVerified","responsesVerified","evidenceVerified","exceptionsResolved"].every(key=>checklist[key]===true))
      throw new Error("Confirm every independent review checkpoint.");
    const responseActors=await database().prepare(`SELECT DISTINCT lower(recorded_by) recorded_by FROM compliance_inspection_responses
      WHERE organization_id=? AND property_id=? AND case_id=?`).bind(scope.context.organizationId,scope.property.id,id).all<{recorded_by:string}>();
    if(responseActors.results.some(row=>row.recorded_by===scope.context.email.toLowerCase()))
      throw new Error("A person who recorded inspection results cannot independently approve the same case.");
    const reviewId=crypto.randomUUID();await database().prepare(`INSERT INTO compliance_case_reviews
      (id,organization_id,property_id,case_id,decision,checklist_json,reviewer_email,reviewer_note,qualified_person,credential_reference,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(reviewId,scope.context.organizationId,scope.property.id,id,decision,JSON.stringify(checklist),scope.context.email,note,
        qualifiedPerson,credentialReference,now).run();
    if(decision==="COMPLIANT")await database().batch([
      database().prepare(`UPDATE compliance_programs SET next_due_at=?,updated_at=? WHERE id=? AND organization_id=? AND property_id=?`)
        .bind(nextDueAt(item.frequency,new Date()),now,item.program_id,scope.context.organizationId,scope.property.id),
      database().prepare(`UPDATE work_evidence_reviews SET review_status='MANAGER_APPROVED',reviewer_email=?,reviewer_note=?,reviewed_at=?
        WHERE organization_id=? AND property_id=? AND work_order_id=? AND attachment_id IN
        (SELECT attachment_id FROM compliance_evidence_links WHERE organization_id=? AND property_id=? AND case_id=?)`)
        .bind(scope.context.email,note,now,scope.context.organizationId,scope.property.id,item.work_order_id,
          scope.context.organizationId,scope.property.id,id),
    ]);
    return transition(scope,item,decision as ComplianceState,decision==="COMPLIANT"?"COMPLIANCE_CLOSURE_APPROVED":decision==="FAILED_HOLD"?
      "COMPLIANCE_REVIEW_FAILED_HOLD":"COMPLIANCE_REVIEW_REWORK","USER",scope.context.email,{reviewId,decision,qualifiedPerson,credentialReference});
  }
  if(action==="WAIVE"){
    if(!scope.canManage||item.state!=="REMEDIATION_REQUIRED")return null;const note=String(input.note||"").trim().slice(0,1500),expires=String(input.waiverExpiresAt||"");
    if(!note||!/^\d{4}-\d{2}-\d{2}$/.test(expires)||new Date(expires)<=new Date())throw new Error("A future waiver expiration and management reason are required.");
    const reviewId=crypto.randomUUID();await database().prepare(`INSERT INTO compliance_case_reviews(id,organization_id,property_id,case_id,decision,checklist_json,
      reviewer_email,reviewer_note,waiver_expires_at,created_at) VALUES(?,?,?,?,'WAIVED','{}',?,?,?,?)`)
      .bind(reviewId,scope.context.organizationId,scope.property.id,id,scope.context.email,note,expires,now).run();
    return transition(scope,item,"WAIVED","COMPLIANCE_WAIVER_APPROVED","USER",scope.context.email,{reviewId,expires,note});
  }
  if(action==="CANCEL"){if(!scope.canManage)return null;const reason=String(input.reason||"").trim().slice(0,1000);if(!reason)throw new Error("A cancellation reason is required.");
    return transition(scope,item,"CANCELLED","COMPLIANCE_CASE_CANCELLED","USER",scope.context.email,{reason})}
  throw new Error("Unsupported Compliance action.");
}

export async function attachComplianceEvidence(email:string,caseId:string,file:{name:string;type:string;size:number},objectKey:string,digest:string,
  evidenceType:string,programItemId?:string|null,requestedPropertyId?:string|null){const scope=await scopeFor(email,requestedPropertyId);if(!scope)return null;
  const item=await loadCase(scope,caseId);if(!item||!operatorAllowed(scope,item))return null;const allowed=["OVERVIEW","INSTRUMENT_READING","IDENTIFICATION_TAG","CERTIFICATE","DEFICIENCY"];
  if(!allowed.includes(evidenceType))throw new Error("Choose a governed Compliance evidence type.");if(programItemId){const valid=await database().prepare(`SELECT id FROM compliance_program_items
    WHERE id=? AND organization_id=? AND property_id=? AND program_id=?`).bind(programItemId,scope.context.organizationId,scope.property.id,item.program_id).first();if(!valid)return null}
  const duplicate=await database().prepare(`SELECT id FROM compliance_evidence_links WHERE organization_id=? AND property_id=? AND case_id=? AND content_sha256=? AND evidence_type=?`)
    .bind(scope.context.organizationId,scope.property.id,caseId,digest,evidenceType).first<{id:string}>();if(duplicate)return{id:duplicate.id,duplicate:true};
  const attachmentId=crypto.randomUUID(),linkId=crypto.randomUUID(),reviewId=crypto.randomUUID(),now=new Date().toISOString();await database().batch([
    database().prepare(`INSERT INTO work_order_attachments(id,organization_id,property_id,work_order_id,object_key,file_name,content_type,size_bytes,uploaded_by,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(attachmentId,scope.context.organizationId,scope.property.id,item.work_order_id,objectKey,file.name.slice(0,180),file.type,file.size,scope.context.email,now),
    database().prepare(`INSERT INTO work_evidence_reviews(id,organization_id,property_id,work_order_id,attachment_id,evidence_area,evidence_stage,review_status,
      quality_score,deficiencies_json,provider_label,reviewer_email,reviewer_note,reviewed_at,created_at)
      VALUES(?,?,?,?,?,?,?,'PENDING_SUPERVISOR_REVIEW',NULL,'[]','UPLOAD_INTEGRITY_ONLY_V1',NULL,NULL,NULL,?)`)
      .bind(reviewId,scope.context.organizationId,scope.property.id,item.work_order_id,attachmentId,evidenceType,"INSPECTION",now),
    database().prepare(`INSERT INTO compliance_evidence_links(id,organization_id,property_id,case_id,program_item_id,attachment_id,content_sha256,evidence_type,provider_label,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(linkId,scope.context.organizationId,scope.property.id,caseId,programItemId||null,attachmentId,digest,evidenceType,"UPLOAD_INTEGRITY_ONLY_V1",now),
  ]);await appendEvent(scope,caseId,"COMPLIANCE_EVIDENCE_ATTACHED",item.state,item.state,"USER",scope.context.email,{attachmentId,evidenceType,
    programItemId:programItemId||null,providerLabel:"UPLOAD_INTEGRITY_ONLY_V1",visualReviewClaimed:false});return{id:linkId,attachmentId,duplicate:false}}

export async function complianceCaseTrace(email:string,caseId:string,requestedPropertyId?:string|null){const scope=await scopeFor(email,requestedPropertyId);if(!scope)return null;
  const item=await loadCase(scope,caseId);if(!item)return null;const [events,responses,evidence,reviews,audit]=await Promise.all([
    database().prepare(`SELECT * FROM compliance_case_events WHERE organization_id=? AND property_id=? AND case_id=? ORDER BY created_at`).bind(scope.context.organizationId,scope.property.id,caseId).all(),
    database().prepare(`SELECT r.*,i.item_code,i.instruction FROM compliance_inspection_responses r JOIN compliance_program_items i ON i.id=r.program_item_id
      WHERE r.organization_id=? AND r.property_id=? AND r.case_id=? ORDER BY r.created_at`).bind(scope.context.organizationId,scope.property.id,caseId).all(),
    database().prepare(`SELECT l.*,a.file_name,r.review_status FROM compliance_evidence_links l JOIN work_order_attachments a ON a.id=l.attachment_id
      JOIN work_evidence_reviews r ON r.attachment_id=l.attachment_id WHERE l.organization_id=? AND l.property_id=? AND l.case_id=? ORDER BY l.created_at`)
      .bind(scope.context.organizationId,scope.property.id,caseId).all(),
    database().prepare(`SELECT * FROM compliance_case_reviews WHERE organization_id=? AND property_id=? AND case_id=? ORDER BY created_at`).bind(scope.context.organizationId,scope.property.id,caseId).all(),
    database().prepare(`SELECT * FROM system_audit_trail WHERE organization_id=? AND property_id=? AND correlation_id=? ORDER BY occurred_at`).bind(scope.context.organizationId,scope.property.id,caseId).all(),
  ]);await recordSystemAudit({organizationId:scope.context.organizationId,propertyId:scope.property.id,eventType:"COMPLIANCE_CASE_TRACE_ACCESSED",
    entityType:"COMPLIANCE_CASE",entityId:caseId,authorType:"USER",authorId:scope.context.email,correlationId:caseId,delta:{action:"VIEW"}});
  return{case:item,events:events.results,responses:responses.results,evidence:evidence.results,reviews:reviews.results,auditTimeline:audit.results}}

export async function runComplianceEscalations(){if(!env.DB)return{escalated:0};const overdue=await database().prepare(`SELECT c.*,p.name property_name,t.name program_name
  FROM compliance_inspection_cases c JOIN property_contexts p ON p.id=c.property_id AND p.organization_id=c.organization_id
  JOIN maintenance_compliance_templates t ON t.id=c.template_id WHERE c.state NOT IN('COMPLIANT','WAIVED','CANCELLED','FAILED_HOLD') AND c.due_at<=?
  ORDER BY c.due_at LIMIT 200`).bind(new Date().toISOString()).all<Record<string,any>>();let escalated=0;
  for(const row of overdue.results){const existing=await database().prepare(`SELECT id FROM automation_exceptions WHERE organization_id=? AND property_id=? AND source_type='COMPLIANCE_CASE'
    AND source_id=? AND exception_state='OVERDUE' AND status='OPEN' LIMIT 1`).bind(row.organization_id,row.property_id,row.id).first();if(existing)continue;
    const now=new Date().toISOString(),owner=await database().prepare(`SELECT user_email FROM property_assignments WHERE organization_id=? AND property_id=? AND status='ACTIVE'
      AND (upper(role_label) LIKE '%MANAGER%' OR upper(role_label) LIKE '%ADMIN%') ORDER BY is_default DESC LIMIT 1`).bind(row.organization_id,row.property_id).first<{user_email:string}>(),
      recipient=owner?.user_email||row.created_by;await database().batch([
        database().prepare(`INSERT INTO automation_exceptions(id,organization_id,property_id,source_type,source_id,exception_state,severity,title,detail,
          extracted_json,missing_fields_json,recommended_action,owner_email,status,retry_count,next_retry_at,created_at,updated_at)
          VALUES(?,?,?,'COMPLIANCE_CASE',?,'OVERDUE','HIGH',?,?,'{}','[]','Review assignment, source, target, evidence and current inspection state.',?,'OPEN',0,NULL,?,?)`)
          .bind(crypto.randomUUID(),row.organization_id,row.property_id,row.id,`Overdue compliance inspection · ${row.program_name}`,
            `${row.property_name} inspection ${row.id} remains ${row.state} after ${row.due_at}.`,recipient,now,now),
        database().prepare(`INSERT INTO staff_notifications(id,organization_id,event_id,recipient_email,sender_email,title,message,status,created_at,read_at)
          VALUES(?,?,NULL,?,'AAIQ-COMPLIANCE',?,?,'unread',?,NULL)`).bind(crypto.randomUUID(),row.organization_id,recipient,
            `Overdue compliance inspection · ${row.program_name}`,`Open case ${row.id}; state ${row.state}; due ${row.due_at}.`,now),
        database().prepare(`INSERT INTO compliance_case_events(id,organization_id,property_id,case_id,event_type,from_state,to_state,actor_type,actor_id,detail_json,created_at)
          VALUES(?,?,?,?,?,?,?,'SYSTEM','AAIQ-COMPLIANCE-SLA',?,?)`).bind(crypto.randomUUID(),row.organization_id,row.property_id,row.id,
            "COMPLIANCE_CASE_OVERDUE",row.state,row.state,JSON.stringify({dueAt:row.due_at,recipient}),now),
      ]);await recordSystemAudit({organizationId:row.organization_id,propertyId:row.property_id,eventType:"COMPLIANCE_CASE_OVERDUE",
        entityType:"COMPLIANCE_CASE",entityId:row.id,authorType:"SYSTEM",authorId:"AAIQ-COMPLIANCE-SLA",correlationId:row.id,
        delta:{state:row.state,dueAt:row.due_at,recipient}});escalated++}
  return{escalated}}

export async function runScheduledComplianceAutomation(){
  if(!env.DB)return{propertiesEvaluated:0,casesCreated:0,exceptionsCreated:0,skipped:0,failed:0};
  const properties=await database().prepare(`SELECT id,organization_id FROM property_contexts WHERE status='ACTIVE' ORDER BY organization_id,id`).all<{id:string;organization_id:string}>();
  let casesCreated=0,exceptionsCreated=0,skipped=0,failed=0;
  for(const property of properties.results){
    const operator=await database().prepare(`SELECT m.user_email FROM staff_members m LEFT JOIN property_assignments a
      ON a.organization_id=m.organization_id AND a.property_id=? AND lower(a.user_email)=lower(m.user_email) AND a.status='ACTIVE'
      WHERE m.organization_id=? AND m.status='active' AND (m.role='admin' OR upper(a.role_label) LIKE '%MANAGER%' OR upper(a.role_label) LIKE '%ADMIN%')
      ORDER BY CASE WHEN m.role='admin' THEN 0 ELSE 1 END,a.is_default DESC,m.user_email LIMIT 1`)
      .bind(property.id,property.organization_id).first<{user_email:string}>();
    if(!operator){skipped++;continue}
    try{
      const scope=await scopeFor(operator.user_email,property.id);if(!scope||!scope.canManage){skipped++;continue}
      const hour=new Date().toISOString().slice(0,13),runKey=`scheduled:${hour}`;
      const existing=await database().prepare(`SELECT id FROM compliance_automation_runs WHERE organization_id=? AND property_id=? AND run_key=?`)
        .bind(property.organization_id,property.id,runKey).first();if(existing)continue;
      const started=new Date().toISOString(),result=await createDueCases(scope),completed=new Date().toISOString();
      await database().prepare(`INSERT INTO compliance_automation_runs(id,organization_id,property_id,run_key,programs_prepared,cases_created,exceptions_created,started_at,completed_at)
        VALUES(?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),property.organization_id,property.id,runKey,COMPLIANCE_BASELINES.length,
          result.casesCreated,result.exceptionsCreated,started,completed).run();
      await recordSystemAudit({organizationId:property.organization_id,propertyId:property.id,eventType:"COMPLIANCE_AUTOMATION_RUN",
        entityType:"PROPERTY",entityId:property.id,authorType:"SYSTEM",authorId:"AAIQ-COMPLIANCE-SCHEDULER",correlationId:runKey,
        delta:{...result,policy:COMPLIANCE_POLICY_VERSION}});
      casesCreated+=result.casesCreated;exceptionsCreated+=result.exceptionsCreated;
    }catch(error){
      failed++;const hour=new Date().toISOString().slice(0,13),message=error instanceof Error?error.message:"Unknown Compliance automation failure.";
      await recordSystemAudit({organizationId:property.organization_id,propertyId:property.id,eventType:"COMPLIANCE_AUTOMATION_FAILED",
        entityType:"PROPERTY",entityId:property.id,authorType:"SYSTEM",authorId:"AAIQ-COMPLIANCE-SCHEDULER",correlationId:`scheduled:${hour}`,
        delta:{message,policy:COMPLIANCE_POLICY_VERSION}});
    }
  }
  return{propertiesEvaluated:properties.results.length,casesCreated,exceptionsCreated,skipped,failed};
}
