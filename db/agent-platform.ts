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

export async function activeProperty(context: { organizationId: string; email: string }, requested?: string | null) {
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

export async function seedAgents(organizationId: string) {
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

/**
 * Reusable, canonical approval-routing write for a GroundedActionTool whose
 * module has no domain-specific draft table of its own (unlike, say,
 * communication reply drafts or workforce requisitions). Inserting into
 * ai_approval_cases — already the system's shared approval queue, already
 * rendered with working Approve/Reject controls in Agent Studio's Action
 * Required panel — means a new proposal is immediately visible and
 * actionable without any new UI. Approving a case here does not itself
 * dispatch anything; a human reviews the proposal and performs the real
 * action (create the work order, reassign the room, open the variance case)
 * exactly as the human-in-the-loop pattern already works for every other
 * approval case in this table.
 */
export async function proposeApprovalCase(run: any, input: {
  actionType: string; riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; reason: string;
}) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await database().prepare(`INSERT INTO ai_approval_cases
    (id,organization_id,property_id,run_id,action_type,risk_level,status,requested_by,assigned_role,reason,created_at)
    VALUES (?,?,?,?,?,?,'PENDING',?,'MANAGER',?,?)`)
    .bind(id, run.context.organizationId, run.property.id, run.id, input.actionType,
      input.riskLevel, run.context.email, input.reason.slice(0, 2000), now).run();
  return { approvalId: id, status: "PENDING_APPROVAL" };
}

export function agentDatabase() {
  return database();
}
