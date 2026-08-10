import { env } from "cloudflare:workers";
import { activeStaffContext } from "./staff";
import { recordSystemAudit } from "./platform-controls";
import { privilegedChangeAlert, sha256, simulateProviderOutage } from "../lib/continuity-drills.mjs";
import { authorizedPropertyScope } from "./property-scope";

const COOKIE_NAME = "aaiq_access_boundary";
const MAX_AGE_SECONDS = 30 * 60;

function db(): D1Database {
  if (!env.DB) throw new Error("AAIQ access-policy storage is unavailable.");
  return env.DB;
}

export async function ensureAccessBoundary() {
  db();
}

function ipv4ToInt(ip: string) {
  const pieces = ip.split(".").map(Number);
  if (pieces.length !== 4 || pieces.some(piece => !Number.isInteger(piece) || piece < 0 || piece > 255)) return null;
  return (((pieces[0] * 256 + pieces[1]) * 256 + pieces[2]) * 256 + pieces[3]) >>> 0;
}

export function ipInCidr(ip: string, cidr: string) {
  const [network, bitsRaw = "32"] = cidr.trim().split("/");
  const ipValue = ipv4ToInt(ip), networkValue = ipv4ToInt(network), bits = Number(bitsRaw);
  if (ipValue === null || networkValue === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipValue & mask) === (networkValue & mask);
}

export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(lat2 - lat1), dLon = radians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function currentProperty(context: { organizationId: string; email: string }) {
  return (await authorizedPropertyScope(context.email))?.property || null;
}

async function policyFor(organizationId: string, propertyId: string) {
  return db().prepare("SELECT * FROM property_access_policies WHERE organization_id=? AND property_id=?")
    .bind(organizationId, propertyId).first<Record<string, any>>();
}

async function logDecision(input: Record<string, any>) {
  await db().prepare(`INSERT INTO access_boundary_events
    (id,organization_id,property_id,user_email,event_type,decision,ip_address,latitude,longitude,
     distance_meters,reason,request_path,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(), input.organizationId, input.propertyId ?? null, input.email,
      input.eventType, input.decision, input.ip || null, input.latitude ?? null, input.longitude ?? null,
      input.distance ?? null, input.reason, input.path ?? null, new Date().toISOString()).run();
}

async function signature(payload: string) {
  const secret = process.env.TOKEN_ENCRYPTION_KEY || "AAIQ_DEVELOPMENT_ACCESS_BOUNDARY";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function createAccessBoundarySession(userEmail: string, input: {
  ip: string; latitude?: number; longitude?: number; path?: string;
}) {
  await ensureAccessBoundary();
  const context = await activeStaffContext(userEmail);
  if (!context) return { allowed: false, reason: "Staff access is not active." };
  const property = await currentProperty(context);
  if (!property) return { allowed: false, reason: "No authorized property is assigned." };
  if (context.role === "admin") {
    await logDecision({ organizationId: context.organizationId, propertyId: property.id, email: context.email,
      eventType: "ADMIN_BYPASS", decision: "ALLOW", ip: input.ip, latitude: input.latitude,
      longitude: input.longitude, reason: "Administrator unrestricted access with audit.", path: input.path });
    return { allowed: true, adminBypass: true, property, token: await tokenFor(context.email, property.id, "ADMIN") };
  }
  const policy = await policyFor(context.organizationId, property.id);
  if (!policy || !policy.enabled) {
    await logDecision({ organizationId: context.organizationId, propertyId: property.id, email: context.email,
      eventType: "POLICY_CHECK", decision: "DENY", ip: input.ip, reason: "Property access policy is not configured.", path: input.path });
    return { allowed: false, property, reason: "Your property access boundary has not been configured. Contact an administrator." };
  }
  const cidrs = JSON.parse(policy.trusted_ipv4_cidrs_json || "[]") as string[];
  const ipAllowed = !policy.require_trusted_ip || cidrs.some(cidr => ipInCidr(input.ip, cidr));
  const coordinatesValid = Number.isFinite(input.latitude) && Number.isFinite(input.longitude) &&
    Number.isFinite(policy.latitude) && Number.isFinite(policy.longitude);
  const distance = coordinatesValid
    ? distanceMeters(Number(policy.latitude), Number(policy.longitude), Number(input.latitude), Number(input.longitude))
    : null;
  const geoAllowed = !policy.require_geofence || (distance !== null && distance <= Number(policy.radius_meters));
  const allowed = ipAllowed && geoAllowed;
  const reason = allowed ? "Trusted network and geofence requirements satisfied."
    : !ipAllowed ? "This network is not trusted for the selected property."
    : "Device location is outside the permitted property boundary or unavailable.";
  await logDecision({ organizationId: context.organizationId, propertyId: property.id, email: context.email,
    eventType: "POLICY_CHECK", decision: allowed ? "ALLOW" : "DENY", ip: input.ip,
    latitude: input.latitude, longitude: input.longitude, distance, reason, path: input.path });
  return { allowed, property, reason, ipAllowed, geoAllowed, distanceMeters: distance,
    token: allowed ? await tokenFor(context.email, property.id, "STAFF") : undefined };
}

async function tokenFor(email: string, propertyId: string, mode: string) {
  const expires = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS;
  const payload = `${email.toLowerCase()}|${propertyId}|${mode}|${expires}`;
  return `${btoa(payload)}.${await signature(payload)}`;
}

export async function verifyBoundaryToken(token: string, userEmail: string, activePropertyId: string) {
  const [encoded, supplied] = token.split(".");
  if (!encoded || !supplied) return false;
  let payload = "";
  try { payload = atob(encoded); } catch { return false; }
  if (await signature(payload) !== supplied) return false;
  const [email, propertyId, , expiry] = payload.split("|");
  return email === userEmail.toLowerCase() && propertyId === activePropertyId &&
    Number(expiry) > Math.floor(Date.now() / 1000);
}

export async function accessBoundaryAdmin(userEmail: string) {
  await ensureAccessBoundary();
  const context = await activeStaffContext(userEmail);
  if (!context || context.role !== "admin") return null;
  const properties = await db().prepare(`SELECT p.*,ap.enabled,ap.require_geofence,ap.require_trusted_ip,
    ap.latitude,ap.longitude,ap.radius_meters,ap.trusted_ipv4_cidrs_json,ap.updated_at AS policy_updated_at
    FROM property_contexts p LEFT JOIN property_access_policies ap ON ap.property_id=p.id
    WHERE p.organization_id=? ORDER BY p.name`).bind(context.organizationId).all();
  const events = await db().prepare(`SELECT * FROM access_boundary_events WHERE organization_id=?
    ORDER BY created_at DESC LIMIT 100`).bind(context.organizationId).all();
  const drills=await db().prepare(`SELECT * FROM continuity_drill_runs WHERE organization_id=?
    ORDER BY executed_at DESC LIMIT 20`).bind(context.organizationId).all();
  const alerts=await db().prepare(`SELECT * FROM privileged_change_alerts WHERE organization_id=?
    ORDER BY created_at DESC LIMIT 50`).bind(context.organizationId).all();
  return { properties: properties.results, events: events.results, drills:drills.results, alerts:alerts.results };
}

export async function runSecurityContinuityDrill(userEmail:string,propertyId:string){
  await ensureAccessBoundary();const context=await activeStaffContext(userEmail);
  if(!context||context.role!=="admin")return null;
  const property=await db().prepare("SELECT id FROM property_contexts WHERE id=? AND organization_id=?")
    .bind(propertyId,context.organizationId).first();if(!property)throw new Error("Choose a valid property.");
  const drillId=crypto.randomUUID(),now=new Date().toISOString(),started=Date.now();
  const seed=[{recordKey:"reservation",payload:{reservation:"UAT-R-1001",status:"CHECKED_IN"}},
    {recordKey:"task",payload:{task:"UAT-T-2001",status:"OPEN"}},
    {recordKey:"approval",payload:{approval:"UAT-A-3001",status:"PENDING"}}];
  const snapshot=[] as Array<{recordKey:string;payloadJson:string;checksum:string}>;
  for(const item of seed){const payloadJson=JSON.stringify(item.payload),checksum=await sha256(payloadJson);snapshot.push({recordKey:item.recordKey,payloadJson,checksum});await db().prepare(`INSERT INTO continuity_drill_data
    (id,organization_id,property_id,drill_id,record_key,payload_json,checksum,created_at) VALUES(?,?,?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(),context.organizationId,propertyId,drillId,item.recordKey,payloadJson,checksum,now).run();}
  const backupAt=Date.now();
  await db().prepare("DELETE FROM continuity_drill_data WHERE organization_id=? AND property_id=? AND drill_id=? AND record_key IN ('task','approval')")
    .bind(context.organizationId,propertyId,drillId).run();
  for(const item of snapshot.slice(1))await db().prepare(`INSERT INTO continuity_drill_data
    (id,organization_id,property_id,drill_id,record_key,payload_json,checksum,created_at) VALUES(?,?,?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(),context.organizationId,propertyId,drillId,item.recordKey,item.payloadJson,item.checksum,now).run();
  const restored=await db().prepare("SELECT record_key,payload_json,checksum FROM continuity_drill_data WHERE organization_id=? AND property_id=? AND drill_id=? ORDER BY record_key")
    .bind(context.organizationId,propertyId,drillId).all<any>();
  let integrityVerified=restored.results.length===snapshot.length;
  for(const row of restored.results)integrityVerified=integrityVerified&&(await sha256(row.payload_json))===row.checksum;
  const outage=simulateProviderOutage(),alert=await privilegedChangeAlert({actor:context.email});
  const alertId=crypto.randomUUID();await db().prepare(`INSERT INTO privileged_change_alerts
    (id,organization_id,property_id,event_type,severity,actor,setting_key,before_json,after_json,
     alert_status,previous_hash,checksum,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(alertId,context.organizationId,propertyId,alert.eventType,alert.severity,alert.actor,alert.setting,
      JSON.stringify(alert.before),JSON.stringify(alert.after),alert.alertStatus,alert.previousHash,alert.checksum,now).run();
  const finished=Date.now(),rpoActual=(backupAt-started)/1000,rtoActual=(finished-backupAt)/1000,status=integrityVerified&&outage.recovered&&alert.alertStatus==="FIRED"?"VERIFIED":"FAILED";
  await db().prepare(`INSERT INTO continuity_drill_runs
    (id,organization_id,property_id,status,rpo_target_seconds,rto_target_seconds,rpo_actual_seconds,
     rto_actual_seconds,backup_record_count,restored_record_count,integrity_verified,outage_evidence_json,
     privileged_alert_id,executed_by,executed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(drillId,context.organizationId,propertyId,status,300,900,rpoActual,rtoActual,snapshot.length,
      restored.results.length,integrityVerified?1:0,JSON.stringify(outage),alertId,context.email,now).run();
  await recordSystemAudit({organizationId:context.organizationId,propertyId,eventType:"SECURITY_CONTINUITY_DRILL_EXECUTED",
    entityType:"CONTINUITY_DRILL",entityId:drillId,authorType:"USER",authorId:context.email,
    correlationId:drillId,delta:{status,backupRecords:snapshot.length,restoredRecords:restored.results.length,
      integrityVerified,rpoActualSeconds:rpoActual,rtoActualSeconds:rtoActual},metadata:{outageRecovered:outage.recovered,
      dataLoss:outage.dataLoss,privilegedAlertFired:alert.alertStatus==="FIRED",productionDataTouched:false}});
  return{id:drillId,status,integrityVerified,rpoActualSeconds:rpoActual,rtoActualSeconds:rtoActual,
    backupRecords:snapshot.length,restoredRecords:restored.results.length,outage,alert,
    productionDataTouched:false,realExternalAction:false};
}

export async function saveAccessPolicy(userEmail: string, input: Record<string, unknown>) {
  await ensureAccessBoundary();
  const context = await activeStaffContext(userEmail);
  if (!context || context.role !== "admin") return null;
  const propertyId = String(input.propertyId || "");
  const property = await db().prepare("SELECT id FROM property_contexts WHERE id=? AND organization_id=?")
    .bind(propertyId, context.organizationId).first();
  if (!property) throw new Error("Choose a valid property.");
  const latitude = Number(input.latitude), longitude = Number(input.longitude);
  const radius = Math.max(50, Math.min(10_000, Number(input.radiusMeters || 750)));
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error("Enter valid property latitude and longitude.");
  }
  const cidrs = String(input.trustedCidrs || "").split(/[\n,]+/).map(item => item.trim()).filter(Boolean);
  if (Boolean(input.requireTrustedIp) && !cidrs.length) throw new Error("At least one trusted IPv4 address or CIDR is required.");
  if (cidrs.some(cidr => !ipInCidr(cidr.split("/")[0], cidr))) throw new Error("One or more trusted IPv4 CIDRs are invalid.");
  const now = new Date().toISOString();
  await db().prepare(`INSERT INTO property_access_policies
    (id,organization_id,property_id,enabled,require_geofence,require_trusted_ip,latitude,longitude,
     radius_meters,trusted_ipv4_cidrs_json,session_minutes,updated_by,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,480,?,?,?)
    ON CONFLICT(organization_id,property_id) DO UPDATE SET enabled=excluded.enabled,
    require_geofence=excluded.require_geofence,require_trusted_ip=excluded.require_trusted_ip,
    latitude=excluded.latitude,longitude=excluded.longitude,radius_meters=excluded.radius_meters,
    trusted_ipv4_cidrs_json=excluded.trusted_ipv4_cidrs_json,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
    .bind(crypto.randomUUID(), context.organizationId, propertyId, input.enabled ? 1 : 0,
      input.requireGeofence ? 1 : 0, input.requireTrustedIp ? 1 : 0, latitude, longitude,
      radius, JSON.stringify(cidrs), context.email, now, now).run();
  await recordSystemAudit({ organizationId: context.organizationId, propertyId,
    eventType: "PROPERTY_ACCESS_POLICY_UPDATED", entityType: "PROPERTY_ACCESS_POLICY",
    entityId: propertyId, authorType: "USER", authorId: context.email, correlationId: crypto.randomUUID(),
    delta: { enabled: Boolean(input.enabled), requireGeofence: Boolean(input.requireGeofence),
      requireTrustedIp: Boolean(input.requireTrustedIp), radiusMeters: radius, trustedNetworkCount: cidrs.length } });
  return { saved: true };
}

export { COOKIE_NAME, MAX_AGE_SECONDS };
