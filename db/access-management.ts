import {env} from "cloudflare:workers";
import {activeStaffContext} from "./staff";
import {AAIQ_CAPABILITIES,AAIQ_CAPABILITY_KEYS} from "../lib/aaiq-capabilities";
export const AAIQ_MODULES=AAIQ_CAPABILITIES.map(item=>[item.key,item.label] as const);
const DEPTS=["FRONT_DESK","HOUSEKEEPING","MAINTENANCE","EXECUTIVE"],TIERS=["ASSOCIATE","SUPERVISOR","MANAGER","CORPORATE"];
function db():D1Database{if(!env.DB)throw new Error("Access storage is unavailable.");return env.DB}
async function ensure(){ db(); }
const defaultModules=(role:string,department:string)=>{
 const base=["AAIQ_HOME","AAIQ_ACTION_CENTER","AAIQ_MEMORY_AGENT","AAIQ_TIME_MANAGEMENT","AAIQ_COMMUNICATION_CENTER"];
 if(department==="FRONT_DESK")base.push("AAIQ_DIGITAL_FRONT_DESK","AAIQ_CASH_CUSTODY");
 if(department==="HOUSEKEEPING")base.push("AAIQ_HOUSEKEEPING");
 if(department==="MAINTENANCE")base.push("AAIQ_MAINTENANCE");
 if(["HOUSEKEEPING","MAINTENANCE","FRONT_DESK"].includes(department))base.push("AAIQ_PROPERTY_OPERATIONS");
 if(role==="admin"||["MANAGER","CORPORATE"].includes(role))base.push("AAIQ_REPORTING","AAIQ_PROPERTY_INTELLIGENCE","AAIQ_PILOT_LAUNCH","AAIQ_COMPLIANCE_CENTER","AAIQ_CUSTOMER_INTELLIGENCE","AAIQ_ONLINE_PRESENCE","AAIQ_CASH_CUSTODY");
 if(role==="admin")base.push("AAIQ_USER_MANAGEMENT");
 if(role==="admin")base.push("AAIQ_ASSET_REGISTRY");
 if(role==="admin")base.push("AAIQ_SETUP_AGENT");
 if(role==="admin")base.push("AAIQ_TAX_PREPARATION");
 if(role==="admin"||["MANAGER","CORPORATE"].includes(role))base.push("AAIQ_REVIEW_INTELLIGENCE","AAIQ_OTA_RECONCILIATION");
 if(role==="admin")base.push("AAIQ_WEBSITE_FACTORY");
 if(role==="admin")base.push(...AAIQ_CAPABILITY_KEYS);
 return [...new Set(base)];
};
async function hydrate(organizationId:string,actor:string){
 const members=await db().prepare(`SELECT m.user_email,m.role,COALESCE(NULLIF(p.department,''),'FRONT_DESK') department
  FROM staff_members m LEFT JOIN employee_profiles p ON p.organization_id=m.organization_id AND lower(p.user_email)=lower(m.user_email)
  WHERE m.organization_id=?`).bind(organizationId).all<any>();const now=new Date().toISOString();
 const statements:D1PreparedStatement[]=[];
 for(const member of members.results){
  const tier=member.role==="admin"?"MANAGER":"ASSOCIATE";
  statements.push(db().prepare(`INSERT OR IGNORE INTO user_access_profiles
   (organization_id,user_email,department,role_tier,mfa_required,mfa_status,mfa_methods_json,recovery_email,recovery_phone,
    access_status,last_access_review_at,updated_by_email,updated_at) VALUES (?,?,?,?,0,'NOT_ENROLLED','[]',?,NULL,'ACTIVE',NULL,?,?)`)
   .bind(organizationId,member.user_email,member.department,tier,member.user_email,actor,now));
  for(const key of defaultModules(member.role,member.department))statements.push(db().prepare(`INSERT OR IGNORE INTO user_module_access
   (organization_id,user_email,module_key,access_level,granted_by_email,granted_at) VALUES (?,?,?,'USE',?,?)`)
   .bind(organizationId,member.user_email,key,actor,now));
 }
 if(statements.length)await db().batch(statements);
}
export async function accessCenter(userEmail:string){
 await ensure();const context=await activeStaffContext(userEmail);if(!context)return null;await hydrate(context.organizationId,context.email);
 const scope=context.role==="admin"?"":" AND lower(m.user_email)=?";
 const args=context.role==="admin"?[context.organizationId]:[context.organizationId,context.email];
 const [users,grants,audit]=await Promise.all([
  db().prepare(`SELECT m.id,m.user_email email,m.display_name displayName,m.role,m.status,p.department,p.role_tier roleTier,
   p.mfa_required mfaRequired,p.mfa_status mfaStatus,p.mfa_methods_json mfaMethodsJson,p.recovery_email recoveryEmail,
   p.recovery_phone recoveryPhone,p.access_status accessStatus,p.last_access_review_at lastAccessReviewAt
   FROM staff_members m JOIN user_access_profiles p ON p.organization_id=m.organization_id AND lower(p.user_email)=lower(m.user_email)
   WHERE m.organization_id=?${scope} ORDER BY p.department,p.role_tier,m.display_name`).bind(...args).all<any>(),
  db().prepare(`SELECT user_email email,module_key moduleKey,access_level accessLevel FROM user_module_access WHERE organization_id=?`)
   .bind(context.organizationId).all<any>(),
  db().prepare(`SELECT actor_email actorEmail,target_email targetEmail,event_type eventType,detail_json detailJson,created_at createdAt
   FROM access_audit_events WHERE organization_id=? ORDER BY created_at DESC LIMIT 100`).bind(context.organizationId).all<any>(),
 ]);
 const findings=users.results.flatMap((u:any)=>{
  const userGrants=grants.results.filter((g:any)=>g.email.toLowerCase()===u.email.toLowerCase()).map((g:any)=>g.moduleKey);
  return [
   ...(u.mfaRequired&&!["VERIFIED","ENROLLED"].includes(u.mfaStatus)?[{severity:"HIGH",email:u.email,title:"Required MFA is not enrolled",recommendation:"Complete enrollment before the next privileged session."}]:[]),
   ...((u.roleTier==="ASSOCIATE"||u.roleTier==="SUPERVISOR")&&userGrants.includes("AAIQ_USER_MANAGEMENT")?[{severity:"CRITICAL",email:u.email,title:"Operational user has identity-administration access",recommendation:"Remove AAIQ User Management unless formally approved."}]:[]),
   ...(!u.recoveryEmail&&!u.recoveryPhone?[{severity:"MEDIUM",email:u.email,title:"No verified recovery destination",recommendation:"Add a recovery email or mobile number."}]:[]),
  ];
 });
 const allowedModules=context.role==="admin"?[...AAIQ_CAPABILITY_KEYS]:grants.results.filter((g:any)=>g.email.toLowerCase()===context.email.toLowerCase()).map((g:any)=>g.moduleKey);
 return{role:context.role,allowedModules,modules:AAIQ_MODULES.map(([key,name])=>({key,name})),users:users.results.map((u:any)=>({...u,mfaMethods:JSON.parse(u.mfaMethodsJson||"[]"),grants:grants.results.filter((g:any)=>g.email.toLowerCase()===u.email.toLowerCase()).map((g:any)=>g.moduleKey)})),audit:audit.results,findings};
}
export async function updateAccessUser(actorEmail:string,targetEmail:string,input:any){
 await ensure();const context=await activeStaffContext(actorEmail);if(!context||context.role!=="admin")return null;
 const department=DEPTS.includes(input.department)?input.department:"FRONT_DESK",tier=TIERS.includes(input.roleTier)?input.roleTier:"ASSOCIATE";
 const modules=(Array.isArray(input.modules)?input.modules:[]).filter((key:string)=>AAIQ_CAPABILITY_KEYS.includes(key as any));
 const now=new Date().toISOString(),target=targetEmail.trim().toLowerCase();
 const statements:D1PreparedStatement[]=[
  db().prepare(`UPDATE user_access_profiles SET department=?,role_tier=?,mfa_required=?,recovery_email=?,recovery_phone=?,
   access_status=?,last_access_review_at=?,updated_by_email=?,updated_at=? WHERE organization_id=? AND lower(user_email)=?`)
   .bind(department,tier,input.mfaRequired?1:0,input.recoveryEmail?.trim()||null,input.recoveryPhone?.trim()||null,
    input.accessStatus==="SUSPENDED"?"SUSPENDED":"ACTIVE",now,context.email,now,context.organizationId,target),
  db().prepare(`DELETE FROM user_module_access WHERE organization_id=? AND lower(user_email)=?`).bind(context.organizationId,target),
  ...modules.map((key:string)=>db().prepare(`INSERT INTO user_module_access
   (organization_id,user_email,module_key,access_level,granted_by_email,granted_at) VALUES (?,?,?,'USE',?,?)`)
   .bind(context.organizationId,target,key,context.email,now)),
  db().prepare(`INSERT INTO access_audit_events(id,organization_id,actor_email,target_email,event_type,detail_json,created_at)
   VALUES (?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),context.organizationId,context.email,target,"ACCESS_PROFILE_UPDATED",JSON.stringify({department,tier,modules,mfaRequired:Boolean(input.mfaRequired)}),now),
 ];await db().batch(statements);return{updated:true};
}
export async function requestRecovery(actorEmail:string,targetEmail:string,type:string,channel:string){
 await ensure();const context=await activeStaffContext(actorEmail);if(!context)return null;
 const target=targetEmail.trim().toLowerCase();if(context.role!=="admin"&&target!==context.email)return null;
 const profile=await db().prepare(`SELECT recovery_email,recovery_phone FROM user_access_profiles WHERE organization_id=? AND lower(user_email)=?`)
  .bind(context.organizationId,target).first<any>();if(!profile)throw new Error("User profile was not found.");
 const destination=channel==="SMS"?profile.recovery_phone:profile.recovery_email;if(!destination)throw new Error(`Add a verified ${channel==="SMS"?"mobile number":"recovery email"} first.`);
 const masked=channel==="SMS"?`•••${String(destination).slice(-4)}`:`${String(destination)[0]}•••@${String(destination).split("@")[1]??"email"}`;
 const now=new Date(),expires=new Date(now.getTime()+15*60_000),id=crypto.randomUUID();
 await db().batch([
  db().prepare(`INSERT INTO identity_recovery_requests(id,organization_id,user_email,recovery_type,delivery_channel,
   destination_masked,status,requested_by_email,requested_at,expires_at,completed_at) VALUES (?,?,?,?,?,?,'DELIVERY_PENDING',?,?,?,NULL)`)
   .bind(id,context.organizationId,target,type==="RETRIEVE_ID"?"RETRIEVE_ID":"RESET_CREDENTIAL",channel==="SMS"?"SMS":"EMAIL",masked,context.email,now.toISOString(),expires.toISOString()),
  db().prepare(`INSERT INTO access_audit_events(id,organization_id,actor_email,target_email,event_type,detail_json,created_at)
   VALUES (?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),context.organizationId,context.email,target,"RECOVERY_REQUESTED",JSON.stringify({type,channel,masked}),now.toISOString()),
 ]);return{id,status:"DELIVERY_PENDING",destination:masked,expiresAt:expires.toISOString(),providerManaged:true};
}
export async function hasModuleAccess(userEmail:string,moduleKey:string){
 await ensure();const context=await activeStaffContext(userEmail);if(!context)return false;if(context.role==="admin")return true;await hydrate(context.organizationId,context.email);
 const row=await db().prepare(`SELECT 1 ok FROM user_module_access g JOIN user_access_profiles p
  ON p.organization_id=g.organization_id AND lower(p.user_email)=lower(g.user_email)
  WHERE g.organization_id=? AND lower(g.user_email)=? AND g.module_key=? AND p.access_status='ACTIVE' LIMIT 1`)
  .bind(context.organizationId,context.email,moduleKey).first();return Boolean(row);
}
