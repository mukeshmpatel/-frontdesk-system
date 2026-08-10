import { env } from "cloudflare:workers";
export const UAT_ROLES=["FRONT_DESK","SUPERVISOR","GM","ADMINISTRATOR","AUDITOR"] as const;
type UatRole=typeof UAT_ROLES[number];
const ORG="phase10-uat-organization",PROPERTY="phase10-uat-property";
function db(){if(!env.DB)throw new Error("AAIQ UAT identity storage is unavailable.");return env.DB;}
async function digest(value:string){const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,"0")).join("");}
function roleEmail(role:UatRole){return `phase10-${role.toLowerCase()}@uat.aaiq.internal`;}
export async function issueUatRoleSession(value:string){
 if(!UAT_ROLES.includes(value as UatRole))throw new Error("Unknown Phase 10 UAT role.");
 const role=value as UatRole,now=new Date(),expires=new Date(now.getTime()+3600000),email=roleEmail(role),token=crypto.randomUUID()+crypto.randomUUID();
 await db().batch([
  db().prepare(`INSERT INTO staff_organizations(id,name,owner_email,created_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name`).bind(ORG,"AAIQ Phase 10 Authenticated UAT",roleEmail("ADMINISTRATOR"),now.toISOString()),
  db().prepare(`INSERT INTO property_contexts(id,organization_id,code,name,address,timezone,database_mode,database_binding,status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at`).bind(PROPERTY,ORG,"P10-UAT","AAIQ Phase 10 Test Property","Isolated non-production tenant","America/Chicago","SHARED_SCOPED",null,"ACTIVE",roleEmail("ADMINISTRATOR"),now.toISOString(),now.toISOString()),
  db().prepare(`INSERT INTO staff_members(id,organization_id,user_email,display_name,role,status,invited_by,created_at,updated_at) VALUES(?,?,?,?,?,'active',?,?,?) ON CONFLICT(organization_id,user_email) DO UPDATE SET display_name=excluded.display_name,role=excluded.role,status='active',updated_at=excluded.updated_at`).bind(crypto.randomUUID(),ORG,email,`Phase 10 ${role.replaceAll("_"," ")}`,role==="ADMINISTRATOR"?"admin":"staff",roleEmail("ADMINISTRATOR"),now.toISOString(),now.toISOString()),
  db().prepare(`INSERT INTO property_assignments(id,organization_id,property_id,user_email,department,role_label,is_default,status,created_at) VALUES(?,?,?,?,?,?,1,'ACTIVE',?) ON CONFLICT(organization_id,property_id,user_email) DO UPDATE SET department=excluded.department,role_label=excluded.role_label,status='ACTIVE'`).bind(crypto.randomUUID(),ORG,PROPERTY,email,role,role,now.toISOString()),
  db().prepare(`INSERT INTO uat_role_sessions(id,organization_id,property_id,user_email,role_key,token_hash,issued_at,expires_at) VALUES(?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),ORG,PROPERTY,email,role,await digest(token),now.toISOString(),expires.toISOString()),
 ]);
 return{token,role,email,expiresAt:expires.toISOString()};
}
export async function userFromUatSession(token:string){const row=await db().prepare(`SELECT user_email,role_key,expires_at,revoked_at FROM uat_role_sessions WHERE token_hash=? LIMIT 1`).bind(await digest(token)).first<Record<string,string|null>>();if(!row||row.revoked_at||Date.parse(String(row.expires_at))<=Date.now())return null;const name=`Phase 10 ${String(row.role_key).replaceAll("_"," ")}`;return{email:String(row.user_email),displayName:name,fullName:name,uatRole:String(row.role_key)};}
export async function recordUatAccessEvidence(input:{email:string;role:string;capability:string;action:string;allowed:boolean;reason:string;requestedPropertyId?:string|null}){const now=new Date().toISOString();await db().prepare(`INSERT INTO uat_access_evidence(id,organization_id,property_id,user_email,role_key,capability,action,decision,reason,requested_property_id,occurred_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),ORG,PROPERTY,input.email,input.role,input.capability,input.action,input.allowed?"ALLOW":"DENY",input.reason,input.requestedPropertyId??null,now).run();return{...input,occurredAt:now};}
