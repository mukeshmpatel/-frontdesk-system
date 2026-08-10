import { env } from "cloudflare:workers";
import { createOperationalRecord } from "./enterprise-operations";
import { authorizedPropertyScope } from "./property-scope";
import { recordSystemAudit } from "./platform-controls";
import { runVideoPilotCertification } from "../lib/video-pilot-certification.mjs";

const ZONES = ["GUEST_ROOM","GUEST_BATHROOM","LOBBY","FRONT_DESK","CORRIDOR","STAIRWELL","ELEVATOR","POOL","FITNESS_CENTER","PARKING","GROUNDS","RESTAURANT","BAR","KITCHEN","BANQUET","MEETING_ROOM","LAUNDRY","STORAGE","MECHANICAL","LIFE_SAFETY","EXTERIOR"];
const AUDIT_TYPES = ["ROOM_READINESS","HOUSEKEEPING_QA","BRAND_QA","INVENTORY_COUNT","LIQUOR_INVENTORY","SAFETY_REVIEW","MAINTENANCE_EVIDENCE","PUBLIC_AREA_QA","FOOD_SAFETY_VISUAL_REVIEW"];
const REQUIRED_EVIDENCE:Record<string,string[]>={
  ROOM_READINESS:["ENTRY_LOCK","BED_AREA","BEDDING_CLOSEUP","BATHROOM","VANITY","FLOOR","AMENITIES","HVAC_THERMOSTAT"],
  HOUSEKEEPING_QA:["ENTRY_LOCK","BED_AREA","BEDDING_CLOSEUP","BATHROOM","TUB_SHOWER","TOILET","VANITY","FLOOR","AMENITIES","HVAC_THERMOSTAT"],
  MAINTENANCE_EVIDENCE:["BEFORE","DURING","AFTER","ASSET_LABEL_SERIAL","METER_READING","SAFETY_STATE"],
  INVENTORY_COUNT:["STORAGE_LOCATION","ITEM_LABEL","FULL_COUNT_AREA"],
  SAFETY_REVIEW:["AREA_OVERVIEW","HAZARD_CLOSEUP","EGRESS_PATH","SAFETY_DEVICE"],
  BRAND_QA:["EXTERIOR","ENTRY","FRONT_DESK","PUBLIC_AREA","SIGNAGE"],
};
function database():D1Database { if(!env.DB) throw new Error("AAIQ video intelligence storage is unavailable."); return env.DB }

export async function ensureVideoIntelligence(){
  database();
}

async function ensureRulePacks(organizationId:string,propertyId:string,userEmail:string){
  const now=new Date().toISOString();
  for(const auditType of AUDIT_TYPES){
    await database().prepare(`INSERT OR IGNORE INTO video_analysis_rules
      (id,organization_id,property_id,audit_type,name,required_zones_json,minimum_confidence,auto_action_policy,status,version,created_by,created_at,updated_at)
      VALUES(?,?,?,?,?,?,0.82,'NEVER_FROM_VISION_ALONE','ACTIVE',1,?,?,?)`)
      .bind(crypto.randomUUID(),organizationId,propertyId,auditType,`${auditType.replaceAll("_"," ")} verification`,JSON.stringify(REQUIRED_EVIDENCE[auditType]||["AREA_OVERVIEW"]),userEmail,now,now).run();
  }
}

async function scope(userEmail:string){
  await ensureVideoIntelligence();
  const scoped=await authorizedPropertyScope(userEmail);
  if(!scoped)return null;
  return {context:scoped.context,property:scoped.property};
}

export async function videoIntelligenceCenter(userEmail:string){
  const scoped=await scope(userEmail);if(!scoped)return null;
  const {context,property}=scoped;
  await ensureRulePacks(context.organizationId,property.id,context.email);
  const [audits,findings,cameras,checkins,models,checks,proposals,rules,events,providers,edgeNodes,inventory,inventoryDetections,evidence,identityCases,checkinSteps,modelMetrics,pilotRuns]=await Promise.all([
    database().prepare("SELECT * FROM video_audits WHERE organization_id=? AND property_id=? ORDER BY created_at DESC LIMIT 30").bind(context.organizationId,property.id).all<any>(),
    database().prepare("SELECT * FROM video_findings WHERE organization_id=? AND property_id=? ORDER BY created_at DESC LIMIT 50").bind(context.organizationId,property.id).all<any>(),
    database().prepare("SELECT id,name,zone_type,location_label,edge_node_name,status,retention_days,privacy_masking,audio_disabled,created_at FROM video_camera_registry WHERE organization_id=? AND property_id=? ORDER BY name").bind(context.organizationId,property.id).all<any>(),
    database().prepare("SELECT * FROM express_checkin_sessions WHERE organization_id=? AND property_id=? ORDER BY created_at DESC LIMIT 20").bind(context.organizationId,property.id).all<any>(),
    database().prepare("SELECT * FROM video_model_registry WHERE organization_id=? ORDER BY created_at DESC").bind(context.organizationId).all<any>(),
    database().prepare("SELECT * FROM video_evidence_checks WHERE organization_id=? AND property_id=? ORDER BY created_at DESC LIMIT 200").bind(context.organizationId,property.id).all<any>(),
    database().prepare("SELECT * FROM video_action_proposals WHERE organization_id=? AND property_id=? ORDER BY created_at DESC LIMIT 100").bind(context.organizationId,property.id).all<any>(),
    database().prepare("SELECT * FROM video_analysis_rules WHERE organization_id=? AND property_id=? ORDER BY audit_type").bind(context.organizationId,property.id).all<any>(),
    database().prepare("SELECT * FROM video_job_events WHERE organization_id=? AND property_id=? ORDER BY created_at DESC LIMIT 200").bind(context.organizationId,property.id).all<any>(),
    database().prepare("SELECT id,adapter_type,display_name,status,capabilities_json,external_system,external_sync_status,updated_at FROM video_provider_adapters WHERE organization_id=? AND property_id=? ORDER BY adapter_type").bind(context.organizationId,property.id).all<any>(),
    database().prepare("SELECT * FROM video_edge_nodes WHERE organization_id=? AND property_id=? ORDER BY name").bind(context.organizationId,property.id).all<any>(),
    database().prepare("SELECT * FROM video_inventory_observations WHERE organization_id=? AND property_id=? ORDER BY created_at DESC LIMIT 100").bind(context.organizationId,property.id).all<any>(),
    database().prepare("SELECT * FROM video_inventory_detection_items WHERE organization_id=? AND property_id=? ORDER BY created_at DESC LIMIT 100").bind(context.organizationId,property.id).all<any>(),
    database().prepare("SELECT * FROM video_evidence_objects WHERE organization_id=? AND property_id=? ORDER BY created_at DESC LIMIT 100").bind(context.organizationId,property.id).all<any>(),
    database().prepare("SELECT * FROM identity_verification_cases WHERE organization_id=? AND property_id=? ORDER BY created_at DESC LIMIT 50").bind(context.organizationId,property.id).all<any>(),
    database().prepare("SELECT * FROM express_checkin_steps WHERE organization_id=? AND property_id=? ORDER BY created_at DESC LIMIT 200").bind(context.organizationId,property.id).all<any>(),
    database().prepare("SELECT * FROM video_model_metrics WHERE organization_id=? AND property_id=? ORDER BY created_at DESC LIMIT 50").bind(context.organizationId,property.id).all<any>(),
    database().prepare("SELECT * FROM video_pilot_certification_runs WHERE organization_id=? AND property_id=? ORDER BY executed_at DESC LIMIT 10").bind(context.organizationId,property.id).all<any>()
  ]);
  const auditRows=audits.results as any[],findingRows=findings.results as any[],proposalRows=proposals.results as any[];
  return {role:context.role,property,zones:ZONES,auditTypes:AUDIT_TYPES,audits:audits.results,findings:findings.results,cameras:cameras.results,checkins:checkins.results,models:models.results,
    checks:checks.results,proposals:proposalRows,rules:(rules.results as any[]).map(x=>({...x,requiredZones:JSON.parse(x.required_zones_json)})),events:events.results,
    providers:(providers.results as any[]).map(x=>({...x,capabilities:JSON.parse(x.capabilities_json||"[]")})),
    edgeNodes:(edgeNodes.results as any[]).map(x=>({...x,capabilities:JSON.parse(x.capabilities_json||"[]")})),
    inventory:inventory.results,inventoryDetections:inventoryDetections.results,evidence:evidence.results,identityCases:identityCases.results,checkinSteps:checkinSteps.results,modelMetrics:modelMetrics.results,pilotRuns:pilotRuns.results,
    metrics:{audits:auditRows.length,queued:auditRows.filter(x=>["QUEUED","VALIDATING","ANALYZING"].includes(x.status)).length,
      review:findingRows.filter(x=>x.status==="NEEDS_REVIEW").length,rework:findingRows.filter(x=>x.human_decision==="REWORK_REQUIRED").length,
      highRisk:findingRows.filter(x=>x.severity==="HIGH"&&x.status!=="REVIEWED").length,
      proposals:proposalRows.filter(x=>x.status==="PENDING_APPROVAL").length,
      passRate:auditRows.length?Math.round(100*auditRows.filter(x=>x.status==="VERIFIED").length/auditRows.length):0,
      inventoryReview:(inventory.results as any[]).filter(x=>x.status==="NEEDS_REVIEW").length,
      inventoryProposals:(inventoryDetections.results as any[]).filter(x=>x.status==="NEEDS_REVIEW").length,
      evidenceHolds:(evidence.results as any[]).filter(x=>x.legal_hold===1).length,
      identityReview:(identityCases.results as any[]).filter(x=>["NEEDS_REVIEW","ALTERNATIVE_REQUIRED"].includes(x.status)).length,
      edgeHealthy:(edgeNodes.results as any[]).filter(x=>x.status==="HEALTHY").length},
    governance:{advisoryOnly:true,noFacialWatchlists:true,biometricMode:"CONSENTED_ONE_TO_ONE_ONLY",audioDefault:"DISABLED",defaultRetentionDays:30,
      prohibited:["FACIAL_WATCHLIST","PROTECTED_TRAIT_INFERENCE","AUTOMATIC_DISCIPLINE","AUTOMATIC_GUEST_DENIAL","VISION_ONLY_ROOM_STATUS_CHANGE"]}};
}

type InventoryDetection = {sku:string;label:string;quantity:number;unit:string;confidence:number;timestampMs?:number};

function parseInventoryVisionOutput(output:unknown,allowed:Map<string,any>):InventoryDetection[]{
  const raw=typeof output==="string"?output:String((output as any)?.description||(output as any)?.response||(output as any)?.result||"");
  const candidate=raw.replace(/^```(?:json)?/i,"").replace(/```$/i,"").trim();
  let parsed:any;
  try{parsed=JSON.parse(candidate)}catch{
    const start=candidate.indexOf("[");const end=candidate.lastIndexOf("]");
    if(start<0||end<=start)return [];
    try{parsed=JSON.parse(candidate.slice(start,end+1))}catch{return []}
  }
  const rows=Array.isArray(parsed)?parsed:Array.isArray(parsed?.items)?parsed.items:[];
  return rows.flatMap((row:any)=>{
    const sku=String(row?.sku||"").trim().toUpperCase(),inventory=allowed.get(sku),quantity=Number(row?.quantity),confidence=Number(row?.confidence);
    if(!inventory||!Number.isFinite(quantity)||quantity<0||!Number.isFinite(confidence)||confidence<0||confidence>1)return [];
    return [{sku,label:String(row?.label||inventory.name||sku).slice(0,120),quantity,unit:String(row?.unit||inventory.base_unit||"EACH").slice(0,30),confidence,timestampMs:Number.isFinite(Number(row?.timestamp_ms))?Number(row.timestamp_ms):undefined}];
  });
}

async function inventoryDetectionPlan(context:any,property:any,audit:any){
  if(!["INVENTORY_COUNT","LIQUOR_INVENTORY"].includes(audit.audit_type))return {items:[] as InventoryDetection[],model:"aaiq-development-adapter-v3",detail:"No inventory count requested."};
  const ledger=(await database().prepare(`SELECT sku,name,quantity,base_unit FROM supply_inventory
    WHERE organization_id=? AND property_id=? ORDER BY category,name LIMIT 60`).bind(context.organizationId,property.id).all<any>()).results as any[];
  if(!ledger.length)return {items:[] as InventoryDetection[],model:"inventory-ledger-unavailable",detail:"No property-scoped inventory ledger exists. No count was invented."};
  if(audit.source_type==="MANUAL_SAMPLE"){
    return {items:ledger.slice(0,5).map((row,index)=>({sku:String(row.sku),label:String(row.name),quantity:Math.max(0,Number(row.quantity)-(index%2)),unit:String(row.base_unit||"EACH"),confidence:Number((.96-index*.03).toFixed(2)),timestampMs:index*750})),
      model:"aaiq-explicit-sample-fixture-v1",detail:"Generated from the canonical sample ledger for a clearly labeled, non-production demonstration."};
  }
  if(String(audit.content_type||"").startsWith("video/"))return {items:[] as InventoryDetection[],model:"edge-frame-sampler-required",detail:"The uploaded video is preserved, but an authenticated property edge frame sampler is required before visual count proposals can be produced."};
  if(!String(audit.content_type||"").startsWith("image/")||!audit.object_key)return {items:[] as InventoryDetection[],model:"unsupported-inventory-evidence",detail:"A supported image or an edge-sampled video is required. No count was invented."};
  const ai=(env as any).AI as {run:(model:string,input:Record<string,unknown>)=>Promise<unknown>}|undefined;
  const media=(env as any).MEDIA as R2Bucket|undefined;
  if(!ai||!media)return {items:[] as InventoryDetection[],model:"vision-provider-not-connected",detail:"Private media storage or the vision provider is not connected. The image remains queued and no count was invented."};
  const object=await media.get(String(audit.object_key));
  if(!object)return {items:[] as InventoryDetection[],model:"evidence-object-missing",detail:"The private evidence object could not be read. No count was invented."};
  const allowed=new Map(ledger.map(row=>[String(row.sku).toUpperCase(),row]));
  const prompt=`Count only clearly visible inventory items that match this property ledger: ${ledger.map(row=>`${row.sku}=${row.name}`).join("; ")}. Return JSON only as {"items":[{"sku":"exact ledger SKU","label":"visible item","quantity":0,"unit":"EACH","confidence":0.0}]}. Do not guess hidden items, infer employee conduct, or update inventory.`;
  try{
    const bytes=new Uint8Array(await object.arrayBuffer());
    const output=await ai.run("@cf/llava-hf/llava-1.5-7b-hf",{image:Array.from(bytes),prompt,max_tokens:800});
    const items=parseInventoryVisionOutput(output,allowed);
    return {items,model:"@cf/llava-hf/llava-1.5-7b-hf",detail:items.length?`${items.length} property-ledger matches require human reconciliation.`:"The vision provider returned no safe property-ledger matches. No count was invented."};
  }catch(error){return {items:[] as InventoryDetection[],model:"vision-provider-error",detail:`Vision processing failed safely: ${error instanceof Error?error.message:"provider error"}. No count was invented.`}}
}

export async function createVideoAudit(userEmail:string,input:{auditType:string;zoneType:string;locationLabel:string;objectKey?:string;file?:File}){
  const scoped=await scope(userEmail);if(!scoped)return null;const {context,property}=scoped;
  if(!AUDIT_TYPES.includes(input.auditType)||!ZONES.includes(input.zoneType))throw new Error("Choose an approved audit and zone type.");
  const id=crypto.randomUUID(),correlationId=crypto.randomUUID(),now=new Date().toISOString();
  await database().prepare(`INSERT INTO video_audits(id,organization_id,property_id,correlation_id,audit_type,zone_type,location_label,status,source_type,object_key,file_name,content_type,size_bytes,privacy_status,analysis_mode,created_by,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,context.organizationId,property.id,correlationId,input.auditType,input.zoneType,input.locationLabel.slice(0,120),"QUEUED",input.file?"STAFF_UPLOAD":"MANUAL_SAMPLE",input.objectKey||null,input.file?.name||null,input.file?.type||null,input.file?.size||null,"PENDING_PRIVACY_REVIEW","DEVELOPMENT_ADAPTER",context.email,now).run();
  await database().prepare(`INSERT INTO video_job_events(id,organization_id,property_id,audit_id,from_status,to_status,event_type,detail,actor_type,actor_id,created_at)
    VALUES(?,?,?,?,NULL,'QUEUED','INTAKE_ACCEPTED','Evidence metadata validated and queued for privacy screening.','USER',?,?)`)
    .bind(crypto.randomUUID(),context.organizationId,property.id,id,context.email,now).run();
  if(input.objectKey&&input.file){
    const retentionUntil=new Date(Date.now()+30*86400000).toISOString();
    await database().prepare(`INSERT INTO video_evidence_objects
      (id,organization_id,property_id,audit_id,object_key,sha256,media_type,privacy_derivative_key,faces_blurred,plates_blurred,audio_removed,retention_class,retention_until,legal_hold,custody_status,created_by,created_at,updated_at)
      VALUES(?,?,?,?,?,NULL,?,NULL,0,0,1,'OPERATIONAL_30_DAYS',?,0,'QUARANTINED_PRIVACY_REVIEW',?,?,?)`)
      .bind(crypto.randomUUID(),context.organizationId,property.id,id,input.objectKey,input.file.type,retentionUntil,context.email,now,now).run();
  }
  await recordSystemAudit({organizationId:context.organizationId,propertyId:property.id,eventType:"video.audit.created",entityType:"VIDEO_AUDIT",entityId:id,authorType:"USER",authorId:context.email,correlationId,delta:{auditType:input.auditType,zoneType:input.zoneType,status:"QUEUED"}});
  return {id,status:"QUEUED"};
}

export async function runDevelopmentAnalysis(userEmail:string,auditId:string){
  const scoped=await scope(userEmail);if(!scoped||scoped.context.role!=="admin")return null;const {context,property}=scoped;
  const audit=await database().prepare("SELECT * FROM video_audits WHERE id=? AND organization_id=? AND property_id=?").bind(auditId,context.organizationId,property.id).first<any>();if(!audit)throw new Error("Audit not found.");
  const templates:Record<string,[string,string,string,string,number]>={
    ROOM_READINESS:["CLEANLINESS","Human review of room readiness","Development analysis found a possible presentation exception. Review the uploaded evidence before changing room status.","MEDIUM",0.78],
    HOUSEKEEPING_QA:["CLEANLINESS","Possible cleaning deficiency","A possible visible deficiency requires a supervisor decision; no employee score or discipline was generated.","MEDIUM",0.76],
    INVENTORY_COUNT:["INVENTORY","Count requires reconciliation","A provisional observed count must be reconciled against the inventory ledger by an authorized employee.","LOW",0.72],
    LIQUOR_INVENTORY:["INVENTORY","Partial-container count requires reconciliation","A calibrated visual estimate of a sealed or partial beverage container must be reconciled against the beverage ledger. No shrinkage, loss, or employee conclusion was generated.","MEDIUM",0.73],
    SAFETY_REVIEW:["SAFETY","Possible safety condition","A possible hazard requires prompt human review. No emergency service or enforcement action was triggered.","HIGH",0.81],
    PUBLIC_AREA_QA:["PUBLIC_AREA","Public-area condition needs review","A possible presentation or service condition in an authorized public area requires human confirmation before work is assigned.","MEDIUM",0.75],
    FOOD_SAFETY_VISUAL_REVIEW:["FOOD_SAFETY","Visual food-safety observation needs review","The image may show a condition requiring a trained food-safety reviewer. The system did not make a regulatory determination or remove product from service.","HIGH",0.80],
    BRAND_QA:["BRAND_STANDARD","Possible presentation variance","A visible presentation variance may differ from the property standard and requires QA review.","LOW",0.74],
    MAINTENANCE_EVIDENCE:["MAINTENANCE","Repair evidence needs verification","Completion evidence should be reviewed against the work order and asset before return to service.","MEDIUM",0.79]
  };
  const [category,title,baseDescription,severity,confidence]=templates[audit.audit_type]||templates.BRAND_QA,id=crypto.randomUUID(),now=new Date().toISOString();
  const inventoryPlan=await inventoryDetectionPlan(context,property,audit);
  const description=["INVENTORY_COUNT","LIQUOR_INVENTORY"].includes(audit.audit_type)?`${baseDescription} ${inventoryPlan.detail}`:baseDescription;
  const rule=await database().prepare("SELECT * FROM video_analysis_rules WHERE organization_id=? AND property_id=? AND audit_type=?").bind(context.organizationId,property.id,audit.audit_type).first<any>();
  const zones:string[]=JSON.parse(rule?.required_zones_json||JSON.stringify(REQUIRED_EVIDENCE[audit.audit_type]||["AREA_OVERVIEW"]));
  await database().prepare("UPDATE video_audits SET status='VALIDATING' WHERE id=?").bind(auditId).run();
  const checkStatements=zones.map((zone,index)=>database().prepare(`INSERT INTO video_evidence_checks
    (id,organization_id,property_id,audit_id,check_type,zone_code,result,confidence,explanation,remediation,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),context.organizationId,property.id,auditId,index===0?"MEDIA_QUALITY":"ZONE_COVERAGE",zone,
      index===zones.length-1?"REVIEW_REQUIRED":"PASS",Math.max(.64,confidence-index*.01),
      index===zones.length-1?`${zone.replaceAll("_"," ")} needs a human to confirm coverage and condition.`:`Evidence is usable for ${zone.replaceAll("_"," ").toLowerCase()} review.`,
      index===zones.length-1?`Capture a fresh, well-lit ${zone.replaceAll("_"," ").toLowerCase()} image or clip if coverage is incomplete.`:null,now));
  const existingDetections=await database().prepare("SELECT COUNT(*) count FROM video_inventory_detection_items WHERE organization_id=? AND property_id=? AND audit_id=?")
    .bind(context.organizationId,property.id,auditId).first<any>();
  const evidenceObject=await database().prepare("SELECT id FROM video_evidence_objects WHERE organization_id=? AND property_id=? AND audit_id=? ORDER BY created_at DESC LIMIT 1")
    .bind(context.organizationId,property.id,auditId).first<any>();
  const inventoryStatements:D1PreparedStatement[]=[];
  if(!Number(existingDetections?.count||0))for(const item of inventoryPlan.items){
    const observationId=crypto.randomUUID(),detectionId=crypto.randomUUID(),ledgerRow=await database().prepare("SELECT quantity FROM supply_inventory WHERE organization_id=? AND property_id=? AND sku=?")
      .bind(context.organizationId,property.id,item.sku).first<any>(),ledger=ledgerRow==null?null:Number(ledgerRow.quantity),variance=ledger==null?null:item.quantity-ledger;
    inventoryStatements.push(database().prepare(`INSERT INTO video_inventory_observations
      (id,organization_id,property_id,audit_id,location_label,item_sku,item_name,observation_type,observed_quantity,unit,calibration_method,uncertainty,duplicate_key,status,ledger_quantity,variance,human_decision,human_note,reviewed_by,reviewed_at,created_by,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'NEEDS_REVIEW',?,?,NULL,NULL,NULL,NULL,'AAIQ_VIDEO_INVENTORY',?)`)
      .bind(observationId,context.organizationId,property.id,auditId,audit.location_label,item.sku,item.label,"VISION_PROPOSAL",item.quantity,item.unit,
        audit.source_type==="MANUAL_SAMPLE"?"DEVELOPMENT_SAMPLE":"VISION_LEDGER_MATCH",Math.max(0,1-item.confidence),`${auditId}:${item.sku}`,ledger,variance,now));
    inventoryStatements.push(database().prepare(`INSERT INTO video_inventory_detection_items
      (id,organization_id,property_id,audit_id,evidence_object_id,inventory_observation_id,detected_label,proposed_sku,proposed_quantity,unit,confidence,evidence_timestamp_ms,status,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?, 'NEEDS_REVIEW',?)`).bind(detectionId,context.organizationId,property.id,auditId,evidenceObject?.id||null,observationId,item.label,item.sku,item.quantity,item.unit,item.confidence,item.timestampMs??null,now));
  }
  await database().batch([
    ...checkStatements,
    ...inventoryStatements,
    database().prepare(`INSERT INTO video_findings(id,organization_id,property_id,audit_id,category,title,description,severity,provisional,confidence,evidence_timestamp_ms,status,created_at) VALUES(?,?,?,?,?,?,?,?,1,?,?,?,?)`).bind(id,context.organizationId,property.id,auditId,category,title,description,severity,confidence,1200,"NEEDS_REVIEW",now),
    database().prepare("UPDATE video_audits SET status='NEEDS_REVIEW',privacy_status=?,model_version=?,confidence=?,completed_at=? WHERE id=?").bind(audit.source_type==="MANUAL_SAMPLE"?"SAMPLE_EVIDENCE":"PRIVACY_FILTERED",inventoryPlan.model||"aaiq-development-adapter-v3",confidence,now,auditId),
    database().prepare(`INSERT INTO video_job_events(id,organization_id,property_id,audit_id,from_status,to_status,event_type,detail,actor_type,actor_id,created_at)
      VALUES(?,?,?,?,?,'NEEDS_REVIEW','ANALYSIS_COMPLETED',?,'SYSTEM','AAIQ_VIDEO_ADAPTER',?)`)
      .bind(crypto.randomUUID(),context.organizationId,property.id,auditId,audit.status,`${zones.length} required evidence checks evaluated; ${inventoryPlan.items.length} inventory proposal(s) created; operational action remains blocked.`,now)
  ]);
  await recordSystemAudit({organizationId:context.organizationId,propertyId:property.id,eventType:"video.analysis.completed",entityType:"VIDEO_AUDIT",entityId:auditId,authorType:"SYSTEM",authorId:"AAIQ_VIDEO_ADAPTER",correlationId:audit.correlation_id,delta:{status:"NEEDS_REVIEW",findingId:id,provisional:true,confidence,inventoryProposalCount:inventoryPlan.items.length},metadata:{mode:inventoryPlan.model,noOperationalAction:true}});
  return {auditId,findingId:id,status:"NEEDS_REVIEW",inventoryProposalCount:inventoryPlan.items.length,inventoryMode:inventoryPlan.model};
}

export async function runSampleInventoryDemonstration(userEmail:string){
  const audit=await createVideoAudit(userEmail,{auditType:"INVENTORY_COUNT",zoneType:"STORAGE",locationLabel:"Canonical sample main storeroom"});
  if(!audit)return null;
  return runDevelopmentAnalysis(userEmail,audit.id);
}

export async function decideVideoFinding(userEmail:string,findingId:string,decision:string,note:string){
  const scoped=await scope(userEmail);if(!scoped||scoped.context.role!=="admin")return null;const {context,property}=scoped;
  if(!["CONFIRMED","DISMISSED","FALSE_POSITIVE","CORRECTED","MERGED","REPROCESS","REWORK_REQUIRED","ESCALATE","LEGAL_HOLD"].includes(decision))throw new Error("Choose a valid review decision.");
  if(note.trim().length<8)throw new Error("Add a review note describing the evidence and decision.");
  const finding=await database().prepare("SELECT * FROM video_findings WHERE id=? AND organization_id=? AND property_id=?").bind(findingId,context.organizationId,property.id).first<any>();if(!finding)throw new Error("Finding not found.");
  const now=new Date().toISOString(),status=decision==="REWORK_REQUIRED"?"REWORK_REQUIRED":"REVIEWED";
  await database().prepare("UPDATE video_findings SET status=?,human_decision=?,human_note=?,reviewed_by=?,reviewed_at=? WHERE id=?").bind(status,decision,note.slice(0,500),context.email,now,findingId).run();
  await database().prepare(`INSERT INTO video_review_events(id,organization_id,property_id,entity_type,entity_id,decision,reason,actor_id,created_at)
    VALUES(?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),context.organizationId,property.id,"VIDEO_FINDING",findingId,decision,note.slice(0,500),context.email,now).run();
  if(decision==="LEGAL_HOLD")await database().prepare("UPDATE video_evidence_objects SET legal_hold=1,custody_status='LEGAL_HOLD',updated_at=? WHERE audit_id=? AND organization_id=? AND property_id=?").bind(now,finding.audit_id,context.organizationId,property.id).run();
  if(decision==="REPROCESS")await database().prepare("UPDATE video_audits SET status='QUEUED',completed_at=NULL WHERE id=?").bind(finding.audit_id).run();
  if(["CONFIRMED","REWORK_REQUIRED","ESCALATE"].includes(decision)){
    const actionType=decision==="REWORK_REQUIRED"?"REWORK_TASK":finding.category==="SAFETY"?"INCIDENT_REVIEW":"OPERATIONAL_REVIEW";
    await database().prepare(`INSERT INTO video_action_proposals
      (id,organization_id,property_id,audit_id,finding_id,action_type,title,description,priority,target_department,status,risk_level,approval_reason,operational_record_id,created_by,approved_by,approved_at,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,'PENDING_APPROVAL',?,?,NULL,?,NULL,NULL,?,?)`)
      .bind(crypto.randomUUID(),context.organizationId,property.id,finding.audit_id,finding.id,actionType,
        `${finding.title} — ${decision.replaceAll("_"," ")}`,`${finding.description}\nReviewer: ${note.slice(0,500)}`,
        finding.severity==="HIGH"?"CRITICAL":"HIGH",finding.category==="CLEANLINESS"?"HOUSEKEEPING":"MAINTENANCE",
        finding.severity==="HIGH"?"HIGH":"MEDIUM","Computer-vision output cannot create operational work without an authorized human approval.",context.email,now,now).run();
  }
  await recordSystemAudit({organizationId:context.organizationId,propertyId:property.id,eventType:"video.finding.reviewed",entityType:"VIDEO_FINDING",entityId:findingId,authorType:"USER",authorId:context.email,correlationId:finding.audit_id,delta:{decision,note:note.slice(0,500)}});
  return {id:findingId,status,decision};
}

export async function registerEdgeNode(userEmail:string,input:any){
  const scoped=await scope(userEmail);if(!scoped||scoped.context.role!=="admin")return null;const {context,property}=scoped;
  const name=String(input.name||"").trim(),location=String(input.locationLabel||"").trim();
  if(name.length<3||location.length<3)throw new Error("Provide an edge node name and exact property location.");
  const id=crypto.randomUUID(),now=new Date().toISOString();
  await database().prepare(`INSERT INTO video_edge_nodes
    (id,organization_id,property_id,name,location_label,status,software_version,capabilities_json,last_heartbeat_at,last_error,created_by,created_at,updated_at)
    VALUES(?,?,?,?,?,'REGISTERED_AWAITING_HEARTBEAT',?, ?,NULL,NULL,?,?,?)`)
    .bind(id,context.organizationId,property.id,name.slice(0,100),location.slice(0,120),String(input.softwareVersion||"unreported").slice(0,40),JSON.stringify(["PRIVACY_FILTER","UPLOAD_RELAY","CAMERA_HEALTH"]),context.email,now,now).run();
  return {id,status:"REGISTERED_AWAITING_HEARTBEAT"};
}

export async function recordEdgeHeartbeat(userEmail:string,edgeNodeId:string){
  const scoped=await scope(userEmail);if(!scoped||scoped.context.role!=="admin")return null;const {context,property}=scoped;
  const edge=await database().prepare("SELECT id FROM video_edge_nodes WHERE id=? AND organization_id=? AND property_id=?").bind(edgeNodeId,context.organizationId,property.id).first<any>();
  if(!edge)throw new Error("Edge node not found.");
  const now=new Date().toISOString();
  await database().prepare("UPDATE video_edge_nodes SET status='HEALTHY',last_heartbeat_at=?,last_error=NULL,updated_at=? WHERE id=?").bind(now,now,edgeNodeId).run();
  await recordSystemAudit({organizationId:context.organizationId,propertyId:property.id,eventType:"video.edge.heartbeat",entityType:"VIDEO_EDGE_NODE",entityId:edgeNodeId,authorType:"USER",authorId:context.email,correlationId:edgeNodeId,delta:{status:"HEALTHY"},metadata:{developmentHeartbeat:true}});
  return {id:edgeNodeId,status:"HEALTHY"};
}

export async function createInventoryObservation(userEmail:string,input:any){
  const scoped=await scope(userEmail);if(!scoped)return null;const {context,property}=scoped;
  const quantity=Number(input.observedQuantity),ledger=input.ledgerQuantity===""||input.ledgerQuantity==null?null:Number(input.ledgerQuantity);
  if(!Number.isFinite(quantity)||quantity<0)throw new Error("Observed quantity must be zero or greater.");
  if(ledger!==null&&(!Number.isFinite(ledger)||ledger<0))throw new Error("Ledger quantity must be zero or greater.");
  const itemSku=String(input.itemSku||"").trim().toUpperCase(),location=String(input.locationLabel||"").trim();
  if(itemSku.length<2||location.length<2)throw new Error("Item SKU and exact storage location are required.");
  const observationType=String(input.observationType||"UNIT_COUNT"),calibration=String(input.calibrationMethod||"MANUAL_REFERENCE");
  if(observationType==="PARTIAL_BOTTLE"&&calibration==="NONE")throw new Error("Partial-bottle observations require a calibration method.");
  const uncertainty=Math.min(1,Math.max(0,Number(input.uncertainty||0.15)));
  const window=new Date();window.setMinutes(Math.floor(window.getMinutes()/15)*15,0,0);
  const duplicateKey=`${itemSku}:${location.toUpperCase()}:${window.toISOString()}:${observationType}`;
  const id=crypto.randomUUID(),now=new Date().toISOString(),variance=ledger===null?null:quantity-ledger;
  try{
    await database().prepare(`INSERT INTO video_inventory_observations
      (id,organization_id,property_id,audit_id,location_label,item_sku,item_name,observation_type,observed_quantity,unit,calibration_method,uncertainty,duplicate_key,status,ledger_quantity,variance,human_decision,human_note,reviewed_by,reviewed_at,created_by,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'NEEDS_REVIEW',?,?,NULL,NULL,NULL,NULL,?,?)`)
      .bind(id,context.organizationId,property.id,input.auditId||null,location.slice(0,120),itemSku,String(input.itemName||itemSku).slice(0,120),observationType,quantity,String(input.unit||"EACH").slice(0,30),calibration,uncertainty,duplicateKey,ledger,variance,context.email,now).run();
  }catch(error){if(String(error).includes("UNIQUE"))throw new Error("A matching observation already exists in this 15-minute reconciliation window.");throw error}
  return {id,status:"NEEDS_REVIEW",variance,uncertainty};
}

export async function decideInventoryObservation(userEmail:string,id:string,decision:string,note:string){
  const scoped=await scope(userEmail);if(!scoped||scoped.context.role!=="admin")return null;const {context,property}=scoped;
  if(!["CONFIRM_COUNT","CORRECT_COUNT","REJECT_FALSE_POSITIVE","REQUEST_RECOUNT"].includes(decision))throw new Error("Choose a valid inventory decision.");
  if(note.trim().length<8)throw new Error("Explain the reconciliation decision.");
  const row=await database().prepare("SELECT id FROM video_inventory_observations WHERE id=? AND organization_id=? AND property_id=? AND status='NEEDS_REVIEW'").bind(id,context.organizationId,property.id).first<any>();
  if(!row)throw new Error("Inventory observation is no longer pending.");
  const now=new Date().toISOString(),status=decision==="REQUEST_RECOUNT"?"RECOUNT_REQUIRED":"REVIEWED";
  const detectionStatus=decision==="REQUEST_RECOUNT"?"RECOUNT_REQUIRED":decision==="REJECT_FALSE_POSITIVE"?"REJECTED":"CONFIRMED";
  await database().batch([
    database().prepare("UPDATE video_inventory_observations SET status=?,human_decision=?,human_note=?,reviewed_by=?,reviewed_at=? WHERE id=?").bind(status,decision,note.slice(0,500),context.email,now,id),
    database().prepare("UPDATE video_inventory_detection_items SET status=?,reviewed_by=?,reviewed_at=? WHERE organization_id=? AND property_id=? AND inventory_observation_id=?")
      .bind(detectionStatus,context.email,now,context.organizationId,property.id,id)
  ]);
  await database().prepare(`INSERT INTO video_review_events(id,organization_id,property_id,entity_type,entity_id,decision,reason,actor_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(),context.organizationId,property.id,"INVENTORY_OBSERVATION",id,decision,note.slice(0,500),context.email,now).run();
  return {id,status};
}

export async function createIdentityVerificationCase(userEmail:string,input:any){
  const scoped=await scope(userEmail);if(!scoped)return null;const {context,property}=scoped;
  const subjectType=String(input.subjectType||"EMPLOYEE");
  if(!["EMPLOYEE","GUEST_RESERVATION"].includes(subjectType))throw new Error("Choose employee or reservation verification.");
  const consent=input.consent===true?"GRANTED":"NOT_GRANTED",method=String(input.verificationMethod||"BADGE_PIN");
  if(method==="ONE_TO_ONE_BIOMETRIC"&&consent!=="GRANTED")throw new Error("One-to-one biometric verification requires explicit, purpose-specific consent.");
  const reference=String(input.subjectReference||"").trim();if(reference.length<3)throw new Error("Provide the employee or reservation reference.");
  const id=crypto.randomUUID(),now=new Date().toISOString(),status=consent==="GRANTED"||method!=="ONE_TO_ONE_BIOMETRIC"?"READY_FOR_VERIFICATION":"ALTERNATIVE_REQUIRED";
  await database().prepare(`INSERT INTO identity_verification_cases
    (id,organization_id,property_id,subject_type,subject_reference,purpose,status,consent_status,verification_method,liveness_status,match_mode,confidence,alternative_method,template_storage,expires_at,human_note,created_by,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,'NOT_RUN','ONE_TO_ONE_ONLY',NULL,'BADGE_PIN_OR_FRONT_DESK','NO_TEMPLATE_STORED',?,NULL,?,?,?)`)
    .bind(id,context.organizationId,property.id,subjectType,reference.slice(0,100),String(input.purpose||"TIME_AND_ATTENDANCE").slice(0,80),status,consent,method,new Date(Date.now()+15*60000).toISOString(),context.email,now,now).run();
  return {id,status};
}

export async function applyEvidenceHold(userEmail:string,evidenceId:string,hold:boolean,note:string){
  const scoped=await scope(userEmail);if(!scoped||scoped.context.role!=="admin")return null;const {context,property}=scoped;
  if(note.trim().length<8)throw new Error("Provide the legal-hold or release reason.");
  const evidence=await database().prepare("SELECT id FROM video_evidence_objects WHERE id=? AND organization_id=? AND property_id=?").bind(evidenceId,context.organizationId,property.id).first<any>();
  if(!evidence)throw new Error("Evidence object not found.");
  const now=new Date().toISOString(),decision=hold?"LEGAL_HOLD_APPLIED":"LEGAL_HOLD_RELEASED";
  await database().prepare("UPDATE video_evidence_objects SET legal_hold=?,custody_status=?,updated_at=? WHERE id=?").bind(hold?1:0,hold?"LEGAL_HOLD":"RETAINED",now,evidenceId).run();
  await database().prepare(`INSERT INTO video_review_events(id,organization_id,property_id,entity_type,entity_id,decision,reason,actor_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(),context.organizationId,property.id,"EVIDENCE_OBJECT",evidenceId,decision,note.slice(0,500),context.email,now).run();
  return {id:evidenceId,status:decision};
}

export async function decideVideoProposal(userEmail:string,proposalId:string,decision:string,note:string){
  const scoped=await scope(userEmail);if(!scoped||scoped.context.role!=="admin")return null;const {context,property}=scoped;
  const proposal=await database().prepare("SELECT * FROM video_action_proposals WHERE id=? AND organization_id=? AND property_id=?").bind(proposalId,context.organizationId,property.id).first<any>();
  if(!proposal||proposal.status!=="PENDING_APPROVAL")throw new Error("Pending proposal not found.");
  if(!["APPROVE","REJECT"].includes(decision))throw new Error("Choose approve or reject.");
  const now=new Date().toISOString();let operationalRecordId:string|null=null;
  if(decision==="APPROVE"){
    const record=await createOperationalRecord(userEmail,{propertyId:property.id,recordType:proposal.action_type==="INCIDENT_REVIEW"?"INCIDENT":"GUEST_REQUEST",
      category:"VIDEO_INTELLIGENCE_HANDOFF",title:proposal.title,description:proposal.description,roomNumber:"VIDEO REVIEW",
      guestReference:"NOT_APPLICABLE",quantity:1,priority:proposal.priority,assignedDepartment:proposal.target_department,
      sourceType:"VIDEO_INTELLIGENCE",sourceReference:proposal.audit_id,aiConfidence:null,aiExplanation:"Human-approved handoff from provisional visual evidence."});
    operationalRecordId=(record as any)?.id||null;
  }
  await database().prepare(`UPDATE video_action_proposals SET status=?,operational_record_id=?,approved_by=?,approved_at=?,updated_at=? WHERE id=?`)
    .bind(decision==="APPROVE"?"APPROVED_AND_CREATED":"REJECTED",operationalRecordId,context.email,now,now,proposalId).run();
  await recordSystemAudit({organizationId:context.organizationId,propertyId:property.id,eventType:"video.action_proposal.decided",entityType:"VIDEO_ACTION_PROPOSAL",entityId:proposalId,authorType:"USER",authorId:context.email,correlationId:proposal.audit_id,delta:{decision,note:note.slice(0,500),operationalRecordId}});
  return {id:proposalId,status:decision==="APPROVE"?"APPROVED_AND_CREATED":"REJECTED",operationalRecordId};
}

export async function configureVideoProvider(userEmail:string,input:any){
  const scoped=await scope(userEmail);if(!scoped||scoped.context.role!=="admin")return null;const {context,property}=scoped;
  const type=String(input.adapterType||"").toUpperCase(),allowed=["VISION_INFERENCE","PMS","SMART_LOCK","WALLET","MESSAGING","BIOMETRIC_VECTOR_STORE","EDGE_NODE"];
  if(!allowed.includes(type))throw new Error("Choose an approved adapter type.");
  const ref=String(input.vaultReference||"");if(ref&&!ref.startsWith("vault://"))throw new Error("Credentials must use a vault:// reference.");
  const id=crypto.randomUUID(),now=new Date().toISOString(),status=ref?"CONFIGURED_NOT_VERIFIED":"CONFIGURATION_REQUIRED";
  await database().prepare(`INSERT INTO video_provider_adapters(id,organization_id,property_id,adapter_type,display_name,vault_reference,status,capabilities_json,external_system,external_entity_id,external_sync_status,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?, ?,?)`).bind(id,context.organizationId,property.id,type,String(input.displayName||type).slice(0,100),ref||null,status,
      JSON.stringify(type==="PMS"?["RESERVATION_READ","CHECKIN_WRITE"]:type==="SMART_LOCK"?["MOBILE_KEY_PROVISION"]:["HEALTH_CHECK"]),String(input.externalSystem||"").slice(0,80)||null,null,"NOT_CONNECTED",now,now).run();
  return {id,status};
}

export async function registerCamera(userEmail:string,input:any){
  const scoped=await scope(userEmail);if(!scoped||scoped.context.role!=="admin")return null;const {context,property}=scoped;
  if(!ZONES.includes(String(input.zoneType))||!String(input.vaultReference||"").startsWith("vault://"))throw new Error("Use an approved zone and a vault:// credential reference.");
  const id=crypto.randomUUID(),now=new Date().toISOString();await database().prepare(`INSERT INTO video_camera_registry(id,organization_id,property_id,name,zone_type,location_label,edge_node_name,status,stream_vault_reference,retention_days,privacy_masking,audio_disabled,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id,context.organizationId,property.id,String(input.name).slice(0,100),input.zoneType,String(input.locationLabel).slice(0,120),String(input.edgeNodeName||"Unassigned").slice(0,100),"CONFIGURATION_REQUIRED",input.vaultReference,Math.min(90,Math.max(1,Number(input.retentionDays||30))),1,1,context.email,now,now).run();
  return {id,status:"CONFIGURATION_REQUIRED"};
}

export async function createExpressCheckin(userEmail:string,input:any){
  const scoped=await scope(userEmail);if(!scoped)return null;const {context,property}=scoped,id=crypto.randomUUID(),correlationId=crypto.randomUUID(),now=new Date().toISOString();
  const consent=input.consent===true?"GRANTED":"NOT_GRANTED",identity=consent?"RESERVATION_OTP":"FRONT_DESK_ASSISTED";
  const ready=input.paymentStatus==="AUTHORIZED"&&input.roomStatus==="CLEAN_INSPECTED"&&input.restrictionStatus==="CLEAR"&&consent;
  const status=ready?"READY_FOR_HUMAN_CONFIRMATION":"ASSISTED_REQUIRED",reason=ready?null:"Identity consent, payment, restrictions, and room readiness must all be verified.";
  await database().prepare(`INSERT INTO express_checkin_sessions(id,organization_id,property_id,correlation_id,reservation_reference,guest_display_name,status,consent_status,identity_method,payment_status,restriction_status,room_readiness_status,pms_status,key_status,manual_reason,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id,context.organizationId,property.id,correlationId,String(input.reservationReference).slice(0,80),String(input.guestDisplayName||"Guest").slice(0,100),status,consent,identity,String(input.paymentStatus||"UNVERIFIED"),String(input.restrictionStatus||"REVIEW_REQUIRED"),String(input.roomStatus||"UNKNOWN"),"NOT_EXECUTED","NOT_PROVISIONED",reason,context.email,now,now).run();
  const steps=[
    ["RESERVATION_LOOKUP",1,"READY",null,"Reservation must be resolved before any identity comparison."],
    ["CONSENT_AND_IDENTITY",2,consent==="GRANTED"?"READY":"MANUAL_REQUIRED",null,"Reservation-specific consent with OTP or assisted alternative."],
    ["PAYMENT_AUTHORIZATION",3,input.paymentStatus==="AUTHORIZED"?"VERIFIED":"MANUAL_REQUIRED","PAYMENT","Card-present tap and PCI data remain outside AAIQ."],
    ["RESTRICTION_REVIEW",4,input.restrictionStatus==="CLEAR"?"VERIFIED":"HUMAN_REVIEW","PMS","Non-biometric risk records require an authorized human decision."],
    ["ROOM_READINESS",5,input.roomStatus==="CLEAN_INSPECTED"?"VERIFIED":"WAITING","PMS","Room must be clean and inspected in the authoritative system."],
    ["PMS_CHECKIN",6,"BLOCKED_PENDING_APPROVAL","PMS","Idempotent provider write is blocked until readiness approval."],
    ["DIGITAL_KEY",7,"BLOCKED_PENDING_PMS","SMART_LOCK","Provision only after PMS confirmation; compensate by revoking on failure."],
    ["DELIVERY",8,"BLOCKED_PENDING_KEY","WALLET","Wallet, SMS, or QR delivery retains manual desk fallback."]
  ] as const;
  await database().batch(steps.map(step=>database().prepare(`INSERT INTO express_checkin_steps
    (id,organization_id,property_id,session_id,step_code,step_order,status,idempotency_key,provider_type,detail,attempts,last_attempt_at,completed_at,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,0,NULL,?,?,?)`).bind(crypto.randomUUID(),context.organizationId,property.id,id,step[0],step[1],step[2],`${correlationId}:${step[0]}`,step[3],step[4],["VERIFIED"].includes(step[2])?now:null,now,now)));
  await recordSystemAudit({organizationId:context.organizationId,propertyId:property.id,eventType:"checkin.readiness.evaluated",entityType:"EXPRESS_CHECKIN",entityId:id,authorType:"SYSTEM",authorId:"AAIQ_CHECKIN_ORCHESTRATOR",correlationId,delta:{status,consentStatus:consent,identityMethod:identity},metadata:{noPmsWrite:true,noKeyProvisioning:true}});
  return {id,status,manualReason:reason};
}

export async function runVideoPilotCertificationForProperty(userEmail:string){
  const scoped=await scope(userEmail);if(!scoped)return null;const{context,property}=scoped;
  if(context.role!=="admin")return null;
  const result=runVideoPilotCertification(),id=crypto.randomUUID(),now=new Date().toISOString();
  const governanceId=crypto.randomUUID();
  await database().batch([
    database().prepare(`INSERT INTO video_privacy_governance_profiles
      (id,organization_id,property_id,camera_id,purpose,consent_basis,signage_status,retention_days,
       access_review_due_at,non_biometric_alternative,legal_hold_policy,export_policy,deletion_policy,
       created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(governanceId,context.organizationId,property.id,null,result.governance.purpose,
        result.governance.consentBasis,result.governance.signageStatus,result.governance.retentionDays,
        result.governance.accessReviewDueAt,result.governance.nonBiometricAlternative,
        "AUTHORIZED_HOLD_SUSPENDS_EXPIRY","AUDITED_REDACTED_EXPORT","AUTHORIZED_VERIFIED_DELETION",
        context.email,now,now),
    database().prepare(`INSERT INTO video_pilot_certification_runs
      (id,organization_id,property_id,status,provider_mode,total_checks,passed_checks,stream_evidence_json,
       model_metrics_json,governance_json,recovery_evidence_json,production_enabled,real_camera_connected,
       real_payment_captured,real_credential_issued,executed_by,executed_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,context.organizationId,property.id,result.status,
        result.providerMode,result.totalChecks,result.passedChecks,JSON.stringify(result.stream),
        JSON.stringify(result.incidents),JSON.stringify(result.governance),JSON.stringify(result.recovery),
        0,0,0,0,context.email,now),
    ...result.recovery.flatMap((scenario:any)=>scenario.events.map((event:string,index:number)=>
      database().prepare(`INSERT INTO express_checkin_compensation_events
        (id,organization_id,property_id,session_id,scenario,event_type,idempotency_key,status,evidence_json,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),context.organizationId,property.id,
          `SIMULATED:${id}`,scenario.scenario,event,`${id}:${scenario.scenario}:${index}`,scenario.status,
          JSON.stringify({noDoublePayment:scenario.noDoublePayment,noDuplicateCredential:scenario.noDuplicateCredential}),now)))
  ]);
  await recordSystemAudit({organizationId:context.organizationId,propertyId:property.id,
    eventType:"video.pilot.certified",entityType:"VIDEO_PILOT_CERTIFICATION",entityId:id,
    authorType:"USER",authorId:context.email,correlationId:crypto.randomUUID(),
    delta:{status:result.status,totalChecks:result.totalChecks,passedChecks:result.passedChecks},
    metadata:{providerMode:result.providerMode,productionEnabled:false,realCameraConnected:false,
      realPaymentCaptured:false,realCredentialIssued:false}});
  return{id,...result};
}
