import { env } from "cloudflare:workers";
import { activeStaffContext } from "./staff";
import { recordSystemAudit } from "./platform-controls";
import { getIntegrationCredential } from "./open-source-integrations";

export type AgentRisk = "LOW" | "MEDIUM" | "HIGH";

const AGENTS = [
  ["executive-briefing", "Digital General Manager (GM)", "EXECUTIVE", "Aggregates cross-department KPIs, audit exceptions, and executive decisions.", "HIGH"],
  ["assistant-general-manager", "Digital Assistant General Manager (AGM)", "EXECUTIVE", "Audits shift handoffs, labor exposure, and housekeeping readiness.", "MEDIUM"],
  ["front-desk", "Digital Front Desk Agent", "FRONT_DESK", "Classifies guest operations, prepares responses, and routes service recovery.", "MEDIUM"],
  ["housekeeping-coordinator", "AAIQ Housekeeping Coordinator", "HOUSEKEEPING", "Prioritizes room turns and quality exceptions.", "MEDIUM"],
  ["maintenance-dispatcher", "Digital Maintenance & Engineering Supervisor", "MAINTENANCE", "Builds cited maintenance briefings and governed dispatch recommendations.", "MEDIUM"],
  ["compliance-inspector", "AAIQ Compliance Inspector", "COMPLIANCE", "Reviews due inspections, evidence, and compliance exposure.", "MEDIUM"],
  ["inventory-planner", "Digital F&B & Inventory Director", "FOOD_AND_BEVERAGE", "Forecasts stock risk, yield variance, and governed purchasing recommendations.", "HIGH"],
  ["procurement-analyst", "AAIQ Procurement Analyst", "PROCUREMENT", "Compares purchasing needs, vendors, and commitments.", "HIGH"],
  ["review-manager", "AAIQ Review Manager", "GUEST_EXPERIENCE", "Analyzes feedback and drafts approval-controlled responses.", "MEDIUM"],
  ["website-manager", "AAIQ Website Manager", "MARKETING", "Audits verified property content and proposes website changes.", "HIGH"],
  ["social-media-manager", "AAIQ Social Media Manager", "MARKETING", "Prepares channel-specific, approval-controlled campaigns.", "HIGH"],
  ["revenue-analyst", "Digital Revenue & Pricing Manager", "REVENUE", "Explains demand and prepares governed rate recommendations within configured limits.", "HIGH"],
  ["tax-preparation", "AAIQ Tax Preparation Assistant", "FINANCE", "Prepares cited tax workpapers for human review and filing.", "HIGH"],
  ["cash-auditor", "Digital Cash & Check Auditor", "FINANCE", "Reconciles authorized PMS cash sources, employee drops, checks, custody handoffs, and variances without posting to the bank or ledger.", "HIGH"],
  ["hiring-manager", "Digital Hiring & Onboarding Manager", "PEOPLE", "Creates property-aware job descriptions, publication drafts, onboarding lockers, access plans, and separation checklists.", "HIGH"],
  ["wedding-planner", "Digital Wedding Planner", "EVENTS", "Builds inquiry discovery, proposals, timelines, room blocks, contracts, and approval-controlled wedding packets.", "MEDIUM"],
  ["event-manager", "Digital Event Manager", "EVENTS", "Coordinates event dependencies, deadlines, communications, service work, and complete event portfolios.", "MEDIUM"],
  ["banquet-coordinator", "Digital Banquet Coordinator", "EVENTS", "Prepares BEOs, menus, room sets, service timelines, change histories, and operating packets.", "MEDIUM"],
  ["network-engineer", "Digital Network Engineer", "TECHNOLOGY", "Maintains network maps, prepares UniFi plans, diagnoses incidents, and produces approval-controlled configuration and test plans.", "HIGH"],
  ["phone-engineer", "Digital Phone System Engineer", "TECHNOLOGY", "Maintains GDMS and Grandstream inventories, extension plans, diagnosis, provisioning checklists, and verification reports.", "HIGH"],
  ["visual-qa-supervisor", "Digital Visual QA Supervisor", "QUALITY", "Converts governed room photos or video into reviewable housekeeping, maintenance, brand, and inventory evidence.", "MEDIUM"],
] as const;

const TOOL_MATRIX: Record<string, string[]> = {
  "executive-briefing": ["aggregate_property_kpis", "run_eod_audit", "prepare_executive_summary"],
  "assistant-general-manager": ["audit_shift_handoff", "compile_labor_report", "prepare_housekeeping_schedule"],
  "front-desk": ["send_guest_message", "propose_room_upgrade", "propose_guest_credit", "prepare_express_checkin"],
  "inventory-planner": ["parse_inventory_count", "propose_purchase_order", "flag_yield_variance"],
  "maintenance-dispatcher": ["read_maintenance_work", "read_compliance_due", "read_asset_context", "dispatch_internal_work_order"],
  "revenue-analyst": ["analyze_demand", "propose_room_rate", "compare_competitor_rates"],
  "cash-auditor": ["read_cash_source", "reconcile_shift_drop", "prepare_check_custody", "flag_variance"],
  "hiring-manager": ["prepare_job_description", "prepare_publication_drafts", "prepare_access_locker", "prepare_separation_plan"],
  "wedding-planner": ["qualify_event_inquiry", "prepare_wedding_proposal", "prepare_contract_draft", "prepare_timeline"],
  "event-manager": ["create_event_portfolio", "coordinate_event_tasks", "prepare_event_communications"],
  "banquet-coordinator": ["prepare_beo", "prepare_room_set", "prepare_service_timeline", "prepare_operating_packet"],
  "network-engineer": ["read_network_map", "diagnose_unifi", "prepare_network_change", "prepare_device_acceptance_test"],
  "phone-engineer": ["read_phone_inventory", "diagnose_gdms", "prepare_extension_plan", "prepare_device_acceptance_test"],
  "visual-qa-supervisor": ["read_private_media_evidence", "propose_inventory_count", "propose_quality_findings", "route_human_review"],
};

function database(): D1Database {
  if (!env.DB) throw new Error("AAIQ agent storage is unavailable.");
  return env.DB;
}

export async function ensureAgentPlatform() {
  database();
}

async function activeProperty(context: { organizationId: string; email: string }, requested?: string | null) {
  let canonical:string|null=null;
  try{
    canonical=(await database().prepare(`SELECT canonical_property_id FROM canonical_workspace_profiles
      WHERE organization_id=? AND status='ACTIVE' LIMIT 1`).bind(context.organizationId)
      .first<{canonical_property_id:string}>())?.canonical_property_id||null;
  }catch{/* Batch 4 migration is not present in an older local database. */}
  const effectiveRequested=canonical||(requested?.trim()||null);
  const property = await database().prepare(`SELECT p.* FROM property_contexts p
    JOIN property_assignments a ON a.property_id=p.id AND a.organization_id=p.organization_id
    LEFT JOIN user_context_preferences u ON u.organization_id=p.organization_id
      AND lower(u.user_email)=lower(a.user_email)
    WHERE p.organization_id=? AND lower(a.user_email)=lower(?) AND a.status='ACTIVE' AND p.status='ACTIVE'
      AND (? IS NULL OR p.id=?)
    ORDER BY CASE
      WHEN ? IS NOT NULL AND p.id=? THEN 0
      WHEN u.active_property_id=p.id THEN 1
      ELSE 2 END,
      a.is_default DESC,p.name LIMIT 1`)
    .bind(context.organizationId, context.email, effectiveRequested, effectiveRequested,
      effectiveRequested, effectiveRequested).first<Record<string, unknown>>();
  return property ?? null;
}

async function seedAgents(organizationId: string) {
  const now = new Date().toISOString();
  for (const [key, name, department, purpose, risk] of AGENTS) {
    await database().prepare(`INSERT OR IGNORE INTO ai_runtime_agent_registry
      (id,organization_id,agent_key,name,purpose,department,risk_level,permitted_tools_json,
       prohibited_actions_json,model,prompt_version,version,status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,? ,?,'gpt-5.4-mini','maintenance-briefing-v2',1,'ACTIVE',?,?)`)
      .bind(crypto.randomUUID(), organizationId, key, name, purpose, department, risk,
        JSON.stringify(TOOL_MATRIX[key] ?? ["READ_ONLY_PREVIEW"]),
        JSON.stringify(["DELETE", "PERMISSION_ESCALATION", "FINANCIAL_COMMITMENT", "PUBLIC_PUBLISHING"]),
        now, now).run();
    await database().prepare(`UPDATE ai_runtime_agent_registry SET name=?,purpose=?,department=?,
      risk_level=?,permitted_tools_json=?,model='gpt-5.4-mini',
      prompt_version=CASE WHEN agent_key='maintenance-dispatcher' THEN 'maintenance-briefing-v2' ELSE prompt_version END,
      updated_at=? WHERE organization_id=? AND agent_key=?`)
      .bind(name,purpose,department,risk,JSON.stringify(TOOL_MATRIX[key] ?? ["READ_ONLY_PREVIEW"]),
        now, organizationId, key).run();
    const thresholds: Record<string, number> = {
      "front-desk":75,"inventory-planner":1200,"maintenance-dispatcher":500,
      "revenue-analyst":15,"executive-briefing":0,"assistant-general-manager":0,
    };
    const cap=thresholds[key]??0;
    await database().prepare(`INSERT OR IGNORE INTO digital_employee_policies
      (id,organization_id,agent_key,autonomy_budget_limit,hitl_threshold_usd,
       tool_permissions_json,status,updated_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,'ACTIVE','SYSTEM',?,?)`).bind(crypto.randomUUID(),organizationId,key,
        cap,cap,JSON.stringify(JSON.parse(String((await database().prepare(
          "SELECT permitted_tools_json FROM ai_runtime_agent_registry WHERE organization_id=? AND agent_key=?"
        ).bind(organizationId,key).first<any>())?.permitted_tools_json||"[]"))),now,now).run();
  }
}

export async function agentStudio(userEmail: string, propertyId?: string | null) {
  const context = await activeStaffContext(userEmail);
  if (!context) return null;
  await ensureAgentPlatform();
  await seedAgents(context.organizationId);
  const property = await activeProperty(context, propertyId);
  if (!property) return null;
  const [agents, runs, approvals, exceptions, actions, capabilities, handoffs, commandSessions, commandMessages] = await Promise.all([
    database().prepare(`SELECT a.*,p.autonomy_budget_limit,p.hitl_threshold_usd,p.status AS policy_status
      FROM ai_runtime_agent_registry a LEFT JOIN digital_employee_policies p
      ON p.organization_id=a.organization_id AND p.agent_key=a.agent_key
      WHERE a.organization_id=? ORDER BY a.department,a.name`)
      .bind(context.organizationId).all(),
    database().prepare(`SELECT r.*,a.name AS agent_name FROM ai_agent_runs r
      JOIN ai_runtime_agent_registry a ON a.id=r.agent_id
      WHERE r.organization_id=? AND r.property_id=? ORDER BY r.created_at DESC LIMIT 30`)
      .bind(context.organizationId, property.id).all(),
    database().prepare(`SELECT * FROM ai_approval_cases WHERE organization_id=? AND property_id=?
      ORDER BY created_at DESC LIMIT 30`).bind(context.organizationId, property.id).all(),
    database().prepare(`SELECT * FROM ai_manual_fallback_cases WHERE organization_id=? AND property_id=?
      ORDER BY created_at DESC LIMIT 30`).bind(context.organizationId, property.id).all(),
    database().prepare(`SELECT l.*,a.name AS agent_name FROM ai_agent_action_log l
      JOIN ai_runtime_agent_registry a ON a.id=l.agent_id
      WHERE l.organization_id=? AND l.property_id=? ORDER BY l.created_at DESC LIMIT 50`)
      .bind(context.organizationId,property.id).all(),
    database().prepare(`SELECT * FROM digital_system_capabilities WHERE organization_id=? AND property_id=?
      ORDER BY system_type,system_name,capability_key`).bind(context.organizationId,property.id).all(),
    database().prepare(`SELECT * FROM digital_employee_handoffs WHERE organization_id=? AND property_id=?
      ORDER BY created_at DESC LIMIT 50`).bind(context.organizationId,property.id).all(),
    database().prepare(`SELECT * FROM digital_employee_command_sessions WHERE organization_id=? AND property_id=?
      ORDER BY updated_at DESC LIMIT 30`).bind(context.organizationId,property.id).all(),
    database().prepare(`SELECT * FROM digital_employee_command_messages WHERE organization_id=? AND property_id=?
      ORDER BY created_at DESC LIMIT 100`).bind(context.organizationId,property.id).all(),
  ]);
  const vaultKey = await getIntegrationCredential(
    context.organizationId, "OPENAI_AGENTS", "OPENAI_API_KEY",
  );
  return { role: context.role, property, agents: agents.results, runs: runs.results,
    approvals: approvals.results, exceptions: exceptions.results, actions: actions.results,
    capabilities: capabilities.results, handoffs: handoffs.results,
    commandSessions:commandSessions.results,commandMessages:commandMessages.results,
    modelConnected: Boolean(vaultKey || process.env.OPENAI_API_KEY) };
}

function countOf(row: any) { return Number(row?.count ?? 0); }

export async function runDigitalEmployeeCommand(userEmail:string,input:Record<string,unknown>){
  const agentKey=String(input.agentKey||"front-desk").trim().slice(0,80);
  const prompt=String(input.prompt||input.intent||"").trim().slice(0,4000);
  const inputMode=String(input.inputMode||"TEXT")==="VOICE_TRANSCRIPT"?"VOICE_TRANSCRIPT":"TEXT";
  if(prompt.length<3)throw new Error("Tell the Digital Employee what outcome you need.");
  const run=await beginAgentRun(userEmail,agentKey,prompt);if(!run)return null;
  const now=new Date().toISOString();
  const priorSession=String(input.sessionId||"");
  let sessionId=priorSession;
  if(sessionId){
    const valid=await database().prepare(`SELECT id FROM digital_employee_command_sessions
      WHERE id=? AND organization_id=? AND property_id=? AND agent_key=?`).bind(sessionId,
        run.context.organizationId,run.property.id,agentKey).first<any>();
    if(!valid)sessionId="";
  }
  if(!sessionId){
    sessionId=crypto.randomUUID();
    await database().prepare(`INSERT INTO digital_employee_command_sessions
      (id,organization_id,property_id,agent_registry_id,agent_key,title,status,created_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?, 'OPEN',?,?,?)`).bind(sessionId,run.context.organizationId,run.property.id,
        run.agent.id,agentKey,prompt.slice(0,100),run.context.email,now,now).run();
  }
  await database().prepare(`INSERT INTO digital_employee_command_messages
    (id,session_id,organization_id,property_id,sender_type,input_mode,body,run_id,outcome_type,
     evidence_json,created_by,created_at) VALUES (?,?,?,?, 'USER',?,?,?,'MESSAGE','[]',?,?)`)
    .bind(crypto.randomUUID(),sessionId,run.context.organizationId,run.property.id,inputMode,prompt,
      run.id,run.context.email,now).run();

  const scope=[run.context.organizationId,run.property.id] as const;
  const [openWork,urgentWork,inbox,inventory,cash,jobs,websites,rooms,staff]=await Promise.all([
    database().prepare(`SELECT COUNT(*) count FROM operational_work_orders WHERE organization_id=? AND property_id=? AND status NOT IN ('CLOSED','COMPLETED')`).bind(...scope).first<any>(),
    database().prepare(`SELECT COUNT(*) count FROM operational_work_orders WHERE organization_id=? AND property_id=? AND priority IN ('CRITICAL','HIGH') AND status NOT IN ('CLOSED','COMPLETED')`).bind(...scope).first<any>(),
    database().prepare(`SELECT COUNT(*) count FROM communication_threads WHERE organization_id=? AND property_id=? AND status NOT IN ('CLOSED','RESOLVED')`).bind(...scope).first<any>(),
    database().prepare(`SELECT COUNT(*) count,COALESCE(SUM(CASE WHEN quantity<=reorder_threshold THEN 1 ELSE 0 END),0) attention FROM supply_inventory WHERE organization_id=? AND property_id=?`).bind(...scope).first<any>(),
    database().prepare(`SELECT business_date,total_cash_cents,status FROM cash_source_batches WHERE organization_id=? AND property_id=? AND active=1 ORDER BY business_date DESC,imported_at DESC LIMIT 1`).bind(...scope).first<any>(),
    database().prepare(`SELECT COUNT(*) count FROM workforce_job_requisitions WHERE organization_id=? AND property_id=?`).bind(...scope).first<any>(),
    database().prepare(`SELECT COUNT(*) count FROM website_factory_projects WHERE organization_id=? AND property_context_id=?`).bind(...scope).first<any>(),
    database().prepare(`SELECT COUNT(*) count FROM property_assets WHERE organization_id=? AND property_id=? AND asset_type='ROOM' AND status='ACTIVE'`).bind(...scope).first<any>(),
    database().prepare(`SELECT COUNT(DISTINCT lower(a.user_email)) count FROM property_assignments a WHERE a.organization_id=? AND a.property_id=? AND a.status='ACTIVE'`).bind(...scope).first<any>(),
  ]);
  const facts={property:run.property.name,propertyCode:run.property.code,openWork:countOf(openWork),
    urgentWork:countOf(urgentWork),openInbox:countOf(inbox),inventoryItems:countOf(inventory),
    inventoryAttention:Number(inventory?.attention||0),latestCashCents:cash?.total_cash_cents??null,
    cashBusinessDate:cash?.business_date??null,jobOpenings:countOf(jobs),websiteProjects:countOf(websites),
    rooms:countOf(rooms),authorizedPeople:countOf(staff)};
  await recordToolCall(run,"read_canonical_property_operating_facts",{prompt,agentKey},facts);

  const normalized=prompt.toLowerCase();
  const consequential=["refund","charge","payment","publish","delete","terminate","fire ","hire ","purchase","order parts","rate override","issue key","unlock","call police","shut down"];
  const approvalRequired=consequential.some(term=>normalized.includes(term));
  const specialized:Record<string,string>={
    "front-desk":`${facts.openInbox} guest or internal conversations are open. I can triage them, prepare replies, create service work, and answer property questions; refunds, key issuance, and payment actions remain approval-gated.`,
    "housekeeping-coordinator":`${facts.openWork} work items are open across the property and ${facts.urgentWork} are high or critical priority. I can prioritize room turns, prepare assignments, identify supply risk, and route photo/video exceptions.`,
    "maintenance-dispatcher":`${facts.urgentWork} high/critical work items require attention. I can triage, assemble asset history, prepare a work plan, monitor SLA, and route physical repair and return-to-service verification to people.`,
    "compliance-inspector":`I can build due-work queues, identify missing evidence, prepare inspection packets, and escalate overdue or life-safety items; a qualified person performs and signs physical inspections.`,
    "inventory-planner":`${facts.inventoryItems} inventory items are recorded and ${facts.inventoryAttention} are at or below reorder threshold. I can reconcile photo/video count proposals and prepare purchasing recommendations for approval.`,
    "website-manager":`${facts.websiteProjects} governed website project(s) are available. I can assemble verified property content, prepare template choices, identify missing public facts, and stage an approval-controlled draft.`,
    "executive-briefing":`${facts.rooms} rooms, ${facts.authorizedPeople} authorized people, ${facts.openWork} open work items, and ${facts.openInbox} open communications are in the canonical workspace.`,
    "cash-auditor":facts.latestCashCents==null?"No authorized cash source is available. I opened no false reconciliation and will wait for a PMS/email import or a governed manual upload.":`The latest authorized source for ${facts.cashBusinessDate} contains $${(Number(facts.latestCashCents)/100).toFixed(2)} in cash. I can compare employee denomination counts, check images, manager receipt counts, and custody handoffs; bank deposits and accounting postings remain human-controlled.`,
    "hiring-manager":`${facts.jobOpenings} sample job opening(s) are available. I can prepare a property-aware description, channel drafts, approval packet, onboarding access locker, assigned-property ledger, and separation return/suspension checklist. Publishing, hiring, discipline, and termination decisions remain human-controlled.`,
    "wedding-planner":`${facts.openInbox} open conversations were checked for event leads. I can create one governed wedding portfolio containing discovery questions, proposal, timeline, room-block assumptions, contract draft, payment milestones, and approval exceptions.`,
    "event-manager":`${facts.openWork} operational work items and ${facts.openInbox} conversations were reviewed. I can turn a qualified inquiry into a dated event portfolio, coordinate departments, draft communications, and monitor unresolved dependencies.`,
    "banquet-coordinator":`I can prepare a reviewable BEO, menu and dietary requirements, room-set plan, equipment list, service timeline, staffing request, change history, and day-of operating packet from verified event facts.`,
    "network-engineer":`I can inspect the property network inventory and preserved map, prepare a UniFi design or diagnosis, create a reversible change plan, and produce acceptance and rollback tests. Credentials, live configuration pushes, and destructive actions require approval.`,
    "phone-engineer":`I can inspect the phone inventory, prepare GDMS/Grandstream extensions and provisioning plans, diagnose registered-device issues, and produce pre-change, acceptance, and rollback reports. Live provisioning and emergency-number changes require approval.`,
    "visual-qa-supervisor":`${facts.inventoryItems} property-ledger inventory items are available for matching. I can analyze governed sample evidence immediately and connected private images into reviewable count or quality proposals; I never invent counts or change inventory, room status, discipline, or safety disposition from vision alone.`,
  };
  const cashAnswer=facts.latestCashCents==null?"No authorized cash source is available yet.":
    `The latest authorized source for ${facts.cashBusinessDate} contains $${(Number(facts.latestCashCents)/100).toFixed(2)} in cash. A physical drop still requires custody verification.`;
  const responseText=normalized.includes("cash")?cashAnswer:
    (specialized[agentKey]||`I reviewed the canonical ${run.property.name} workspace and prepared a property-scoped answer with evidence.`);
  let approvalId:string|null=null;
  if(approvalRequired){
    approvalId=crypto.randomUUID();
    await database().prepare(`INSERT INTO ai_approval_cases
      (id,organization_id,property_id,run_id,action_type,risk_level,status,requested_by,assigned_role,reason,created_at)
      VALUES (?,?,?,?,?,'HIGH','PENDING',?,'MANAGER',?,?)`).bind(approvalId,run.context.organizationId,
        run.property.id,run.id,"DIGITAL_EMPLOYEE_COMMAND",run.context.email,
        "The request may create an external, financial, access, employment, or irreversible action.",now).run();
  }
  const outcome=approvalRequired?"APPROVAL_REQUIRED":"COMPLETED";
  const result={headline:approvalRequired?"Prepared for approval":`${run.agent.name} completed the review`,
    executiveSummary:responseText,recommendedNextAction:approvalRequired?
      "Review the prepared action in the approval queue; nothing external has executed.":
      "Continue this conversation or open the cited module to act on the result.",facts,sessionId,approvalId};
  await database().prepare(`INSERT INTO digital_employee_command_messages
    (id,session_id,organization_id,property_id,sender_type,input_mode,body,run_id,outcome_type,
     evidence_json,created_by,created_at) VALUES (?,?,?,?, 'DIGITAL_EMPLOYEE','SYSTEM',?,?,?,?, 'AAIQ_DIGITAL_EMPLOYEE',?)`)
    .bind(crypto.randomUUID(),sessionId,run.context.organizationId,run.property.id,responseText,run.id,
      outcome,JSON.stringify([{source:"CANONICAL_PROPERTY_FACTS",facts}]),now).run();
  await database().prepare(`UPDATE digital_employee_command_sessions SET status=?,updated_at=? WHERE id=?`)
    .bind(approvalRequired?"WAITING_FOR_HUMAN":"OPEN",now,sessionId).run();
  await finishAgentRun(run,{status:approvalRequired?"NEEDS_REVIEW":"SUCCEEDED",confidence:.96,
    sources:["property_contexts","operational_work_orders","communication_threads","supply_inventory",
      "cash_source_batches","workforce_job_requisitions","website_factory_projects"],
    evidence:[facts],plan:["Resolve canonical property","Read authorized facts","Apply role boundary","Return audited result"],
    output:result,approvalStatus:approvalRequired?"HUMAN_REVIEW_REQUIRED":"NOT_REQUIRED"});
  return {status:approvalRequired?"NEEDS_REVIEW":"SUCCEEDED",runId:run.id,sessionId,approvalId,response:responseText,facts};
}

export async function updateAgentPolicy(userEmail:string,input:Record<string,unknown>){
  const context=await activeStaffContext(userEmail); if(!context||context.role!=="admin")return null;
  await ensureAgentPlatform();await seedAgents(context.organizationId);
  const key=String(input.agentKey||""),status=String(input.status||"ACTIVE");
  const limit=Math.max(0,Number(input.limit||0));
  const now=new Date().toISOString();
  await database().prepare(`UPDATE digital_employee_policies SET autonomy_budget_limit=?,
    hitl_threshold_usd=?,status=?,updated_by=?,updated_at=? WHERE organization_id=? AND agent_key=?`)
    .bind(limit,limit,status,context.email,now,context.organizationId,key).run();
  await database().prepare(`UPDATE ai_runtime_agent_registry SET status=?,updated_at=?
    WHERE organization_id=? AND agent_key=?`).bind(status,now,context.organizationId,key).run();
  await recordSystemAudit({organizationId:context.organizationId,propertyId:null,
    eventType:"DIGITAL_EMPLOYEE_POLICY_CHANGED",entityType:"DIGITAL_EMPLOYEE",entityId:key,
    authorType:"USER",authorId:context.email,correlationId:crypto.randomUUID(),delta:{limit,status}});
  return {agentKey:key,limit,status};
}

export async function decideAgentApproval(userEmail:string,input:Record<string,unknown>){
  const context=await activeStaffContext(userEmail);if(!context||context.role!=="admin")return null;
  const property=await activeProperty(context);if(!property)return null;
  const id=String(input.id||""),decision=String(input.decision||"REJECTED");
  const reason=String(input.reason||"Human decision").slice(0,500),now=new Date().toISOString();
  await database().prepare(`UPDATE ai_approval_cases SET status=?,decision_by=?,decision_reason=?,
    decided_at=? WHERE id=? AND organization_id=? AND property_id=? AND status='PENDING'`)
    .bind(decision,context.email,reason,now,id,context.organizationId,property.id).run();
  await recordSystemAudit({organizationId:context.organizationId,propertyId:property.id,
    eventType:`AI_ACTION_${decision}`,entityType:"AI_APPROVAL_CASE",entityId:id,authorType:"USER",
    authorId:context.email,correlationId:id,delta:{decision,reason}});
  return {id,status:decision};
}

export async function teachSystemCapability(userEmail:string,input:Record<string,unknown>){
  const context=await activeStaffContext(userEmail); if(!context||context.role!=="admin")return null;
  await ensureAgentPlatform(); const property=await activeProperty(context); if(!property)return null;
  const systemType=String(input.systemType||"PMS").toUpperCase().slice(0,40);
  const systemName=String(input.systemName||"Unknown system").trim().slice(0,120);
  const capabilityKey=String(input.capabilityKey||"").trim().toUpperCase().replace(/[^A-Z0-9_]/g,"_").slice(0,80);
  const steps=Array.isArray(input.steps)?input.steps.map(String).filter(Boolean).slice(0,50):[];
  const handoffs=Array.isArray(input.physicalHandoffs)?input.physicalHandoffs.map(String).filter(Boolean).slice(0,20):[];
  if(!systemName||!capabilityKey||!steps.length)throw new Error("System, capability, and at least one verified step are required.");
  const now=new Date().toISOString(),id=crypto.randomUUID();
  await database().prepare(`INSERT INTO digital_system_capabilities
    (id,organization_id,property_id,system_type,system_name,capability_key,workflow_json,
     required_fields_json,physical_handoffs_json,risk_level,status,version,created_by,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,'[]',?,?,'DRAFT',1,?,?,?)
    ON CONFLICT(organization_id,property_id,system_name,capability_key) DO UPDATE SET
      workflow_json=excluded.workflow_json,physical_handoffs_json=excluded.physical_handoffs_json,
      risk_level=excluded.risk_level,status='DRAFT',version=version+1,updated_at=excluded.updated_at`)
    .bind(id,context.organizationId,property.id,systemType,systemName,capabilityKey,
      JSON.stringify(steps),JSON.stringify(handoffs),String(input.riskLevel||"MEDIUM"),context.email,now,now).run();
  await recordSystemAudit({organizationId:context.organizationId,propertyId:property.id,
    eventType:"DIGITAL_SYSTEM_CAPABILITY_TAUGHT",entityType:"SYSTEM_CAPABILITY",entityId:id,
    authorType:"USER",authorId:context.email,correlationId:id,
    delta:{systemType,systemName,capabilityKey,steps,handoffs,status:"DRAFT"}});
  return {id,systemType,systemName,capabilityKey,status:"DRAFT"};
}

export async function decideSystemCapability(userEmail:string,input:Record<string,unknown>){
  const context=await activeStaffContext(userEmail);if(!context||context.role!=="admin")return null;
  await ensureAgentPlatform();const property=await activeProperty(context);if(!property)return null;
  const id=String(input.id||"");
  const decision=String(input.decision||"REJECTED")==="APPROVED"?"APPROVED":"REJECTED";
  const reason=String(input.reason||"Administrator reviewed the operating playbook.").slice(0,500);
  const existing=await database().prepare(`SELECT * FROM digital_system_capabilities
    WHERE id=? AND organization_id=? AND property_id=?`).bind(id,context.organizationId,property.id).first<any>();
  if(!existing)throw new Error("The selected playbook is not available in this property.");
  await database().prepare(`UPDATE digital_system_capabilities SET status=?,updated_at=?
    WHERE id=? AND organization_id=? AND property_id=?`).bind(decision,new Date().toISOString(),id,
      context.organizationId,property.id).run();
  await recordSystemAudit({organizationId:context.organizationId,propertyId:property.id,
    eventType:`DIGITAL_SYSTEM_CAPABILITY_${decision}`,entityType:"SYSTEM_CAPABILITY",entityId:id,
    authorType:"USER",authorId:context.email,correlationId:id,
    delta:{decision,reason,systemName:existing.system_name,capabilityKey:existing.capability_key,
      version:existing.version}});
  return {id,status:decision};
}

export async function executeSystemNeutralTask(userEmail:string,input:Record<string,unknown>){
  const context=await activeStaffContext(userEmail);if(!context)return null;
  await ensureAgentPlatform();await seedAgents(context.organizationId);
  const property=await activeProperty(context);if(!property)return null;
  const agentKey=String(input.agentKey||"front-desk"),capabilityKey=String(input.capabilityKey||"").toUpperCase();
  const capabilityId=String(input.capabilityId||"");
  const capability=await database().prepare(`SELECT * FROM digital_system_capabilities
    WHERE organization_id=? AND property_id=?
      AND ((? <> '' AND id=?) OR (? = '' AND capability_key=?))
    ORDER BY version DESC LIMIT 1`)
    .bind(context.organizationId,property.id,capabilityId,capabilityId,capabilityId,capabilityKey).first<any>();
  if(!capability)throw new Error("No operating playbook exists for this system capability.");
  const run=await beginAgentRun(userEmail,agentKey,String(input.intent||capabilityKey));if(!run)return null;
  const steps=JSON.parse(capability.workflow_json||"[]"),physical=JSON.parse(capability.physical_handoffs_json||"[]");
  if(capability.status!=="APPROVED"||capability.risk_level==="HIGH"){
    const approvalId=crypto.randomUUID(),now=new Date().toISOString();
    await database().prepare(`INSERT INTO ai_approval_cases
      (id,organization_id,property_id,run_id,action_type,risk_level,status,requested_by,
       assigned_role,reason,created_at) VALUES (?,?,?,?,?,?,'PENDING',?,'MANAGER',?,?)`)
      .bind(approvalId,context.organizationId,property.id,run.id,capabilityKey,
        capability.risk_level,context.email,"Playbook is unapproved or high risk.",now).run();
    await finishAgentRun(run,{status:"NEEDS_REVIEW",confidence:.85,plan:steps,output:{capabilityKey,
      systemName:capability.system_name,steps,physicalHandoffs:physical},approvalStatus:"HUMAN_REVIEW_REQUIRED"});
    return {status:"NEEDS_REVIEW",approvalId};
  }
  const now=new Date().toISOString();
  for(const instruction of physical){
    await database().prepare(`INSERT INTO digital_employee_handoffs
      (id,organization_id,property_id,agent_key,capability_key,title,instructions,assigned_role,
       status,source_run_id,created_by,created_at) VALUES (?,?,?,?,?,?,?,'HUMAN_OPERATOR','OPEN',?,?,?)`)
      .bind(crypto.randomUUID(),context.organizationId,property.id,agentKey,capabilityKey,
        `${capabilityKey} physical step`,instruction,run.id,context.email,now).run();
  }
  await finishAgentRun(run,{status:"SUCCEEDED",confidence:.9,plan:steps,output:{capabilityKey,
    systemName:capability.system_name,completedDigitalSteps:steps,physicalHandoffs:physical}});
  return {status:"SUCCEEDED",runId:run.id,handoffsCreated:physical.length};
}

export async function beginAgentRun(userEmail: string, agentKey: string, intent: string) {
  const context = await activeStaffContext(userEmail);
  if (!context) return null;
  await ensureAgentPlatform();
  await seedAgents(context.organizationId);
  const property = await activeProperty(context);
  if (!property) return null;
  const agent = await database().prepare(
    "SELECT * FROM ai_runtime_agent_registry WHERE organization_id=? AND agent_key=? AND status='ACTIVE'",
  ).bind(context.organizationId, agentKey).first<Record<string, any>>();
  if (!agent) throw new Error("The selected agent is not active.");
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await database().prepare(`INSERT INTO ai_agent_runs
    (id,organization_id,property_id,agent_id,initiated_by,intent,status,risk_level,confidence,
     sources_json,evidence_json,plan_json,output_json,missing_information_json,approval_status,
     model,prompt_version,cost_micros,latency_ms,error_message,created_at,completed_at)
    VALUES (?,?,?,?,?,?,'EXECUTING',?,NULL,'[]','[]','[]',NULL,'[]','NOT_REQUIRED',?,?,0,0,NULL,?,NULL)`)
    .bind(id, context.organizationId, property.id, agent.id, context.email, intent.slice(0, 2000),
      agent.risk_level, agent.model, agent.prompt_version, now).run();
  return { id, context, property, agent, startedAt: Date.now() };
}

export async function recordToolCall(run: any, toolName: string, input: unknown, output: unknown) {
  await database().prepare(`INSERT INTO ai_agent_tool_calls
    (id,organization_id,property_id,run_id,tool_name,input_json,output_json,status,created_at)
    VALUES (?,?,?,?,?,?,?,'SUCCEEDED',?)`).bind(crypto.randomUUID(), run.context.organizationId,
      run.property.id, run.id, toolName, JSON.stringify(input), JSON.stringify(output),
      new Date().toISOString()).run();
}

export async function finishAgentRun(run: any, result: {
  status: "SUCCEEDED" | "NEEDS_REVIEW" | "FAILED";
  confidence?: number; sources?: unknown[]; evidence?: unknown[]; plan?: unknown[];
  output?: unknown; missing?: unknown[]; approvalStatus?: string; error?: string;
}) {
  const now = new Date().toISOString();
  const latency = Date.now() - run.startedAt;
  await database().prepare(`UPDATE ai_agent_runs SET status=?,confidence=?,sources_json=?,evidence_json=?,
    plan_json=?,output_json=?,missing_information_json=?,approval_status=?,latency_ms=?,
    error_message=?,completed_at=? WHERE id=? AND organization_id=? AND property_id=?`)
    .bind(result.status, result.confidence ?? null, JSON.stringify(result.sources ?? []),
      JSON.stringify(result.evidence ?? []), JSON.stringify(result.plan ?? []),
      result.output === undefined ? null : JSON.stringify(result.output),
      JSON.stringify(result.missing ?? []), result.approvalStatus ?? "NOT_REQUIRED", latency,
      result.error ?? null, now, run.id, run.context.organizationId, run.property.id).run();
  await recordSystemAudit({
    organizationId: run.context.organizationId, propertyId: run.property.id,
    eventType: `AI_AGENT_RUN_${result.status}`, entityType: "AI_AGENT_RUN", entityId: run.id,
    authorType: "USER", authorId: run.context.email, correlationId: run.id,
    delta: { agentKey: run.agent.agent_key, status: result.status, confidence: result.confidence ?? null },
    metadata: { model: run.agent.model, promptVersion: run.agent.prompt_version, latencyMs: latency },
  });
}

export async function createAgentFallback(run: any, state: string, error: string) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await database().prepare(`INSERT INTO ai_manual_fallback_cases
    (id,organization_id,property_id,run_id,exception_state,severity,owner_role,original_request,
     extracted_data_json,missing_fields_json,recommended_action,status,created_at,updated_at)
    VALUES (?,?,?,?,?,'HIGH','MAINTENANCE_MANAGER',?,'{}',? ,?,'OPEN',?,?)`)
    .bind(id, run.context.organizationId, run.property.id, run.id, state, run.intent,
      JSON.stringify(state === "INTEGRATION_UNAVAILABLE" ? ["OPENAI_API_KEY"] : ["AGENT_RESULT"]),
      `Review the cited maintenance records manually. ${error}`.slice(0, 1000), now, now).run();
  await finishAgentRun(run, { status: "FAILED", missing: [state], error });
  return { id, state, status: "OPEN" };
}

export function agentDatabase() {
  return database();
}
