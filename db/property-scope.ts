import {env} from "cloudflare:workers";
import {activeStaffContext} from "./staff";

function db():D1Database{if(!env.DB)throw new Error("Property scope storage is unavailable.");return env.DB}

async function canonicalPropertyId(organizationId:string){
 try{
  const row=await db().prepare(`SELECT canonical_property_id FROM canonical_workspace_profiles
    WHERE organization_id=? AND status='ACTIVE' LIMIT 1`).bind(organizationId).first<{canonical_property_id:string}>();
  return row?.canonical_property_id||null;
 }catch{
  // Forward-compatible fallback for local databases that have not applied Batch 4 yet.
  return null;
 }
}

/** Resolves one canonical property and proves that the signed-in staff member may use it. */
export async function authorizedPropertyScope(userEmail:string,requestedPropertyId?:string|null){
 const context=await activeStaffContext(userEmail);if(!context)return null;
 const requested=requestedPropertyId?.trim()||null;
 const canonical=await canonicalPropertyId(context.organizationId);
 // Once a canonical workspace is active it is the only permissible operating
 // scope. This prevents stale cookies, saved links, or module-specific defaults
 // from silently reopening an archived pilot property.
 const effectiveRequested=canonical||requested;
 const row=context.role==="admin"
  ?await db().prepare(`SELECT p.id,p.code,p.name,p.address,p.timezone FROM property_contexts p
    LEFT JOIN user_context_preferences u ON u.organization_id=p.organization_id AND lower(u.user_email)=lower(?)
    WHERE p.organization_id=? AND p.status='ACTIVE' AND (? IS NULL OR p.id=?)
    ORDER BY CASE WHEN p.id=? THEN 0 WHEN u.active_property_id=p.id THEN 1 ELSE 2 END,p.created_at LIMIT 1`)
    .bind(context.email,context.organizationId,effectiveRequested,effectiveRequested,canonical).first<any>()
  :await db().prepare(`SELECT p.id,p.code,p.name,p.address,p.timezone FROM property_contexts p
    JOIN property_assignments a ON a.organization_id=p.organization_id AND a.property_id=p.id
    LEFT JOIN user_context_preferences u ON u.organization_id=p.organization_id AND lower(u.user_email)=lower(a.user_email)
    WHERE p.organization_id=? AND p.status='ACTIVE' AND lower(a.user_email)=lower(?) AND a.status='ACTIVE' AND (? IS NULL OR p.id=?)
    ORDER BY CASE WHEN p.id=? THEN 0 WHEN u.active_property_id=p.id THEN 1 ELSE 2 END,a.is_default DESC,p.created_at LIMIT 1`)
    .bind(context.organizationId,context.email,effectiveRequested,effectiveRequested,canonical).first<any>();
 return row?{context,property:row}:null;
}

/** Lists only properties that are both active and authorized for the signed-in staff member. */
export async function authorizedPropertyList(userEmail:string){
 const context=await activeStaffContext(userEmail);if(!context)return null;
 const canonical=await canonicalPropertyId(context.organizationId);
 const rows=context.role==="admin"
  ?await db().prepare(`SELECT p.id,p.code,p.name,p.address,p.timezone FROM property_contexts p
    WHERE p.organization_id=? AND p.status='ACTIVE' AND (? IS NULL OR p.id=?)
    ORDER BY CASE WHEN p.id=? THEN 0 ELSE 1 END,p.name`)
    .bind(context.organizationId,canonical,canonical,canonical).all<any>()
  :await db().prepare(`SELECT p.id,p.code,p.name,p.address,p.timezone FROM property_contexts p
    JOIN property_assignments a ON a.organization_id=p.organization_id AND a.property_id=p.id
    WHERE p.organization_id=? AND p.status='ACTIVE' AND lower(a.user_email)=lower(?) AND a.status='ACTIVE'
      AND (? IS NULL OR p.id=?)
    ORDER BY CASE WHEN p.id=? THEN 0 ELSE 1 END,a.is_default DESC,p.name`)
    .bind(context.organizationId,context.email,canonical,canonical,canonical).all<any>();
 return {context,properties:rows.results,canonicalPropertyId:canonical};
}
