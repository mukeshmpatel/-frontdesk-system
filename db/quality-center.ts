import {env} from "cloudflare:workers";
import {activeStaffContext} from "./staff";
import {enterpriseOperations} from "./enterprise-operations";
import {integrationCenter} from "./open-source-integrations";

type Probe={suite:string;name:string;status:"PASS"|"WARN"|"FAIL";route?:string;evidence:string;recommendation?:string;latencyMs?:number};
function db():D1Database{if(!env.DB)throw new Error("AAIQ QA storage is unavailable.");return env.DB}
async function ensure(){db()}
export async function qualityCenter(userEmail:string){
 await ensure();const context=await activeStaffContext(userEmail);if(!context)return null;
 const operations=await enterpriseOperations(userEmail);if(!operations?.activeProperty)return null;
 const runs=await db().prepare("SELECT * FROM autonomous_qa_runs WHERE organization_id=? AND property_id=? ORDER BY completed_at DESC LIMIT 20").bind(context.organizationId,operations.activeProperty.id).all<any>();
 let checks:any[]=[];if(runs.results[0])checks=(await db().prepare("SELECT * FROM autonomous_qa_checks WHERE run_id=? ORDER BY CASE status WHEN 'FAIL' THEN 1 WHEN 'WARN' THEN 2 ELSE 3 END,suite,name").bind(runs.results[0].id).all<any>()).results;
 return{role:context.role,property:operations.activeProperty,runs:runs.results,checks};
}
export async function runAutonomousQa(userEmail:string,browserProbes:Probe[]){
 await ensure();const context=await activeStaffContext(userEmail);if(!context||context.role!=="admin")return null;
 const operations=await enterpriseOperations(userEmail);if(!operations?.activeProperty)throw new Error("Select an authorized property before running QA.");
 const integrations=await integrationCenter(userEmail),property=operations.activeProperty,checks:Probe[]=[...browserProbes];
 checks.push({suite:"PROPERTY_SCOPE",name:"Canonical active property",status:property.id&&property.code?"PASS":"FAIL",evidence:property.id?`${property.name} (${property.code}) is selected by stable ID.`:"No canonical property ID is active.",recommendation:"Run Autonomous Configuration and approve a canonical property."});
 const assetColumns=await db().prepare("PRAGMA table_info(property_assets)").all<{name:string}>();
 if(assetColumns.results.some(item=>item.name==="property_id")){
  const count=await db().prepare("SELECT COUNT(*) total,SUM(CASE WHEN property_id=? THEN 1 ELSE 0 END) scoped FROM property_assets WHERE organization_id=?").bind(property.id,context.organizationId).first<any>();
  checks.push({suite:"DATA",name:"Asset property scope",status:Number(count?.total||0)===Number(count?.scoped||0)?"PASS":"WARN",evidence:`${count?.scoped||0} of ${count?.total||0} assets are explicitly scoped to the active property.`,recommendation:"Review and map legacy unscoped assets before portfolio reporting."});
 }else checks.push({suite:"DATA",name:"Asset property scope",status:"FAIL",evidence:"property_assets has no property_id column.",recommendation:"Apply the property-scope migration."});
 for(const item of integrations?.integrations||[]){
  const connected=item.status==="CONNECTED",healthy=item.last_health_status==="HEALTHY";
  checks.push({suite:"INTEGRATIONS",name:item.display_name,status:connected&&!healthy?"FAIL":connected?"PASS":"WARN",evidence:connected?(healthy?"Connected and last governed health check passed.":`Connected but health is ${item.last_health_status||"unknown"}.`):"Configuration is still required.",recommendation:connected?"Run its governed health check and resolve the returned evidence.":"Open Governed Integrations; AAIQ will request only the missing credential."});
 }
 const technologyKeys=["UNIFI","GDMS","LOREX"];
 for(const providerKey of technologyKeys){
  const item=(integrations?.integrations||[]).find((row:any)=>row.provider_key===providerKey);
  const healthy=item?.status==="CONNECTED"&&item?.last_health_status==="HEALTHY";
  checks.push({suite:"TECHNOLOGY_WORKFLOW",name:`${item?.display_name||providerKey} inventory → health → governed action`,status:healthy?"PASS":"WARN",route:"/aaiq-integration-center#governed-connectors",evidence:healthy?"Property-scoped connector identity and latest health evidence are verified.":`${item?.status||"MISSING"}; live inventory and health evidence have not both passed. No control action is treated as ready.`,recommendation:"Connect or defer the provider explicitly, run a read-only health check, verify the returned property identity, then test one reversible workflow with approval and rollback evidence."});
 }
 const auditProof=await db().prepare(`SELECT COUNT(*) total FROM system_audit_trail WHERE organization_id=?`).bind(context.organizationId).first<any>();
 checks.push({suite:"SECURITY",name:"Central audit evidence",status:Number(auditProof?.total||0)>0?"PASS":"WARN",route:"/aaiq-security",evidence:`${Number(auditProof?.total||0).toLocaleString()} central audit event(s) are available for this organization.`,recommendation:"Run one approved test workflow and confirm its actor, property, before/after state and correlation ID in Security & Audit."});
 const failures=checks.filter(item=>item.status==="FAIL").length,warnings=checks.filter(item=>item.status==="WARN").length;
 const score=Math.max(0,Math.round(100-(failures*18)-(warnings*5))),status=failures?"FAILED":warnings?"PARTIAL":"PASSED",now=new Date().toISOString(),runId=crypto.randomUUID();
 const statements:D1PreparedStatement[]=[db().prepare(`INSERT INTO autonomous_qa_runs(id,organization_id,property_id,actor_email,status,score,summary_json,started_at,completed_at) VALUES(?,?,?,?,?,?,?,?,?)`).bind(runId,context.organizationId,property.id,context.email,status,score,JSON.stringify({total:checks.length,failures,warnings}),now,now)];
 for(const check of checks)statements.push(db().prepare(`INSERT INTO autonomous_qa_checks(id,run_id,suite,name,status,severity,evidence,recommendation,route,latency_ms,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),runId,check.suite,check.name,check.status,check.status==="FAIL"?"HIGH":check.status==="WARN"?"MEDIUM":"INFO",check.evidence,check.recommendation||null,check.route||null,check.latencyMs??null,now));
 await db().batch(statements);return{runId,status,score,total:checks.length,failures,warnings};
}
