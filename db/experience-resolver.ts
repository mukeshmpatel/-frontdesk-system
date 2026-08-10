/**
 * Experience and Access Resolver.
 *
 * Computes which of the three AAIQ experiences (Platform Administration,
 * Management Command, My Work) a signed-in user belongs in, and returns a
 * signed manifest listing their authorized capabilities, default landing
 * route, and property scope. This is additive: every existing per-route and
 * per-API authorization check (hasModuleAccess, authorizedPropertyScope,
 * role==="admin" guards throughout the module services) remains the actual
 * authority, unchanged. The manifest only classifies and summarizes grants
 * that already exist elsewhere so navigation and dashboards can present them
 * coherently — it never grants anything by itself, and its token proves the
 * manifest was issued by the server rather than assembled by the client, but
 * carries no authorization weight of its own: a client presenting a valid
 * token still gets a normal per-request access_management/property_scope
 * check on every API call, exactly as before this file existed.
 */
import { env } from "cloudflare:workers";
import { activeStaffContext } from "./staff";
import { authorizedPropertyList, authorizedPropertyScope } from "./property-scope";
import { authorizedCapabilityKeys } from "./access-management";
import { AAIQ_CAPABILITIES, type AaiqCapability } from "../lib/aaiq-capabilities";

function db(): D1Database {
  if (!env.DB) throw new Error("Experience resolver storage is unavailable.");
  return env.DB;
}

export type ExperiencePersona = "PLATFORM_ADMINISTRATION" | "MANAGEMENT_COMMAND" | "MY_WORK";

export type ExperienceManifest = {
  email: string;
  persona: ExperiencePersona;
  role: "admin" | "staff";
  roleTier: string;
  department: string;
  propertyId: string | null;
  propertyName: string | null;
  authorizedProperties: { id: string; name: string }[];
  capabilities: AaiqCapability[];
  defaultRoute: string;
  issuedAt: string;
  expiresAt: string;
  token: string;
};

const MANIFEST_MAX_AGE_SECONDS = 15 * 60;

const DEFAULT_ROUTE: Record<ExperiencePersona, string> = {
  PLATFORM_ADMINISTRATION: "/aaiq-user-management",
  MANAGEMENT_COMMAND: "/reports",
  MY_WORK: "/",
};

/**
 * Derived entirely from data that already exists (the binary admin/staff role
 * and the role_tier/department columns db/access-management.ts already
 * populates) — this does not introduce a new authority concept. A CORPORATE-
 * tier administrator is the closest existing analog to an enterprise
 * platform administrator; a property-level admin or a MANAGER/SUPERVISOR
 * tier is Management Command; everyone else is My Work.
 */
export function resolvePersona(role: string, roleTier: string): ExperiencePersona {
  if (role === "admin" && roleTier === "CORPORATE") return "PLATFORM_ADMINISTRATION";
  if (role === "admin" || roleTier === "MANAGER" || roleTier === "SUPERVISOR") return "MANAGEMENT_COMMAND";
  return "MY_WORK";
}

async function signature(payload: string) {
  const secret = process.env.TOKEN_ENCRYPTION_KEY || "AAIQ_DEVELOPMENT_ACCESS_BOUNDARY";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function manifestToken(email: string, persona: ExperiencePersona, propertyId: string | null) {
  const expires = Math.floor(Date.now() / 1000) + MANIFEST_MAX_AGE_SECONDS;
  // Prefixed and pipe-delimited by purpose so this can never be replayed as a
  // different signed token type (e.g. the access-boundary session token),
  // even though both currently derive from the same base secret.
  const payload = `EXPERIENCE_MANIFEST|${email.toLowerCase()}|${persona}|${propertyId ?? ""}|${expires}`;
  return `${btoa(payload)}.${await signature(payload)}`;
}

export async function verifyExperienceManifestToken(token: string, userEmail: string):
  Promise<{ ok: true; persona: ExperiencePersona; propertyId: string | null } | { ok: false }> {
  const [encoded, supplied] = token.split(".");
  if (!encoded || !supplied) return { ok: false };
  let payload = "";
  try { payload = atob(encoded); } catch { return { ok: false }; }
  if (await signature(payload) !== supplied) return { ok: false };
  const [tag, email, persona, propertyId, expiry] = payload.split("|");
  if (tag !== "EXPERIENCE_MANIFEST") return { ok: false };
  if (email !== userEmail.toLowerCase()) return { ok: false };
  if (Number(expiry) <= Math.floor(Date.now() / 1000)) return { ok: false };
  return { ok: true, persona: persona as ExperiencePersona, propertyId: propertyId || null };
}

export async function resolveExperienceManifest(
  email: string, requestedPropertyId?: string | null,
): Promise<ExperienceManifest | null> {
  const context = await activeStaffContext(email);
  if (!context) return null;

  const [profile, scope, propertyList, capabilityKeys] = await Promise.all([
    db().prepare(`SELECT department,role_tier FROM user_access_profiles WHERE organization_id=? AND lower(user_email)=?`)
      .bind(context.organizationId, context.email).first<{ department: string; role_tier: string }>(),
    authorizedPropertyScope(email, requestedPropertyId),
    authorizedPropertyList(email),
    authorizedCapabilityKeys(email),
  ]);

  const roleTier = profile?.role_tier || "ASSOCIATE";
  const department = profile?.department || "FRONT_DESK";
  const persona = resolvePersona(context.role, roleTier);
  const capabilitySet = new Set(capabilityKeys);
  const capabilities = AAIQ_CAPABILITIES.filter(item => capabilitySet.has(item.key));
  const propertyId = scope?.property.id ?? null;

  const now = Date.now();
  return {
    email: context.email,
    persona,
    role: context.role as "admin" | "staff",
    roleTier,
    department,
    propertyId,
    propertyName: scope?.property.name ?? null,
    authorizedProperties: (propertyList?.properties ?? []).map((p: any) => ({ id: p.id, name: p.name })),
    capabilities,
    defaultRoute: DEFAULT_ROUTE[persona],
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + MANIFEST_MAX_AGE_SECONDS * 1000).toISOString(),
    token: await manifestToken(context.email, persona, propertyId),
  };
}
