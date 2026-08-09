import { env } from "cloudflare:workers";
import { activeStaffContext } from "./staff";
import { recordSystemAudit } from "./platform-controls";
import { authorizedPropertyScope } from "./property-scope";

const DEFINITIONS = [
  ["AAIQ_NATIVE_COMMS", "AAIQ Native Communications", "COMMUNICATION_ORCHESTRATION", "Embedded AAIQ runtime", "AAIQ-NATIVE", "ACTIVE"],
  ["OPENAI_AGENTS", "OpenAI Agents SDK", "AGENT_RUNTIME", "Embedded TypeScript runtime", "MIT", "ACTIVE"],
  ["LANGGRAPH", "LangGraph.js", "DURABLE_ORCHESTRATION", "Embedded TypeScript runtime", "MIT", "ACTIVE"],
  ["QDRANT", "Qdrant", "ORGANIZATIONAL_MEMORY", "QDRANT_URL", "Apache-2.0", "CONFIGURATION_REQUIRED"],
  ["POSTIZ", "Postiz", "SOCIAL_PUBLISHING", "POSTIZ_BASE_URL", "AGPL-3.0", "CONFIGURATION_REQUIRED"],
  ["META_CAPI", "Meta Conversions API", "SERVER_SIDE_CONVERSION_EVENTS", "META_GRAPH_API", "PROPRIETARY-API", "CONFIGURATION_REQUIRED"],
  ["HOTEL_COMMAND_CENTER", "Hotel Presence Command Center", "ONLINE_PRESENCE_TECHNOLOGY_FEDERATION", "AAIQ_FEDERATION", "AAIQ-OWNED", "FEDERATION_PENDING"],
  ["UNIFI", "UniFi Network", "NETWORK_MONITORING_AND_RECOVERY", "COMMAND_CENTER_FEDERATION", "PROPRIETARY-API", "FEDERATION_PENDING"],
  ["GDMS", "Grandstream GDMS", "PHONE_FLEET_MANAGEMENT", "COMMAND_CENTER_FEDERATION", "PROPRIETARY-API", "FEDERATION_PENDING"],
  ["LOREX", "Lorex Pro", "CAMERA_INVENTORY_AND_HEALTH", "COMMAND_CENTER_FEDERATION", "PROPRIETARY-APP", "FEDERATION_PENDING"],
  ["SUPERSET", "Apache Superset", "ANALYTICS_VISUALIZATION", "SUPERSET_BASE_URL", "Apache-2.0", "CONFIGURATION_REQUIRED"],
  ["CHATWOOT", "Chatwoot (optional fallback)", "OPTIONAL_COMMUNICATION_ADAPTER", "CHATWOOT_BASE_URL", "MIT", "CONFIGURATION_REQUIRED"],
] as const;

function db(): D1Database {
  if (!env.DB) throw new Error("AAIQ integration storage is unavailable.");
  return env.DB;
}

export async function ensureIntegrationPlatform() {
  db();
}

const CREDENTIAL_FIELDS: Record<string, string[]> = {
  QDRANT: ["QDRANT_API_KEY", "OPENAI_API_KEY"],
  POSTIZ: ["POSTIZ_API_KEY"],
  SUPERSET: ["SUPERSET_API_TOKEN", "SUPERSET_API_SECRET", "SUPERSET_ACCESS_TOKEN"],
  CHATWOOT: ["CHATWOOT_API_ACCESS_TOKEN", "CHATWOOT_ACCOUNT_ID"],
  OPENAI_AGENTS: ["OPENAI_API_KEY"],
  META_CAPI: ["META_CAPI_ACCESS_TOKEN", "META_CAPI_DATASET_ID", "META_CAPI_TEST_EVENT_CODE"],
};

const CHANNEL_CATALOG = [
  ["FACEBOOK", "Facebook Pages", "ORGANIC_SOCIAL", "POSTIZ", "Posts, media, scheduling and approvals"],
  ["INSTAGRAM", "Instagram Business", "ORGANIC_SOCIAL", "POSTIZ", "Posts, reels, media and scheduling"],
  ["THREADS", "Threads", "ORGANIC_SOCIAL", "POSTIZ", "Channel-specific posts and scheduling"],
  ["LINKEDIN", "LinkedIn Pages", "ORGANIC_SOCIAL", "POSTIZ", "Company-page publishing and analytics"],
  ["X", "X", "ORGANIC_SOCIAL", "POSTIZ", "Posts, threads and scheduling"],
  ["TIKTOK", "TikTok", "ORGANIC_SOCIAL", "POSTIZ", "Short-form video publishing"],
  ["YOUTUBE", "YouTube", "ORGANIC_SOCIAL", "POSTIZ", "Video publishing and scheduling"],
  ["PINTEREST", "Pinterest", "ORGANIC_SOCIAL", "POSTIZ", "Pins and campaign content"],
  ["REDDIT", "Reddit", "ORGANIC_SOCIAL", "POSTIZ", "Approved community publishing"],
  ["BLUESKY", "Bluesky", "ORGANIC_SOCIAL", "POSTIZ", "Posts and scheduling"],
  ["MASTODON", "Mastodon", "ORGANIC_SOCIAL", "POSTIZ", "Instance-scoped publishing"],
  ["GOOGLE_BUSINESS", "Google Business Profile", "PROFILE_AND_REVIEWS", "DIRECT_OAUTH", "Profile, posts, reviews and local presence"],
  ["TRIPADVISOR", "Tripadvisor", "PROFILE_AND_REVIEWS", "DIRECT_OR_MANUAL", "Reviews, responses and profile updates"],
  ["BOOKING_COM", "Booking.com", "OTA_AND_REVIEWS", "DIRECT_OR_PARTNER", "Property content, reviews and OTA status"],
  ["EXPEDIA", "Expedia Group", "OTA_AND_REVIEWS", "DIRECT_OR_PARTNER", "Property content, reviews and OTA status"],
  ["WYNDHAM", "Wyndham Brand Channels", "BRAND_CHANNEL", "DIRECT_OR_MANUAL", "Brand content and property profile"],
  ["META_CAPI", "Meta Conversions API", "ADVERTISING", "META_CAPI", "Consent-controlled server-side conversion events"],
  ["META_ADS", "Meta Ads", "ADVERTISING", "DIRECT_OAUTH", "Campaigns, audiences, spend and performance"],
  ["GOOGLE_ADS", "Google Ads & Customer Match", "ADVERTISING", "DIRECT_OAUTH", "Audiences, conversions, campaigns and spend"],
  ["MICROSOFT_ADS", "Microsoft Advertising", "ADVERTISING", "DIRECT_OAUTH", "Campaigns, audiences and conversion reporting"],
  ["WHATSAPP", "WhatsApp Business", "MESSAGING", "DIRECT_OAUTH", "Approved guest messaging and templates"],
  ["MESSENGER", "Facebook Messenger", "MESSAGING", "DIRECT_OAUTH", "Property-scoped guest conversations"],
] as const;

function encryptionSecret() {
  const secret = String((env as unknown as Record<string, unknown>).TOKEN_ENCRYPTION_KEY || "");
  if (secret.length < 32) throw new Error("AAIQ vault encryption is not configured.");
  return secret;
}

async function vaultKey() {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(encryptionSecret()));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function base64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), char => char.charCodeAt(0));
}

async function encryptCredential(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await vaultKey(),
    new TextEncoder().encode(value));
  return { ciphertext: base64(new Uint8Array(encrypted)), iv: base64(iv) };
}

async function decryptCredential(ciphertext: string, iv: string) {
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(iv) },
    await vaultKey(), fromBase64(ciphertext));
  return new TextDecoder().decode(decrypted);
}

async function seedIntegrations(organizationId: string) {
  const now = new Date().toISOString();
  for (const [key, name, capability, endpointReference, license, status] of DEFINITIONS) {
    await db().prepare(`INSERT OR IGNORE INTO governed_integrations
      (id,organization_id,provider_key,display_name,capability,license,endpoint,credential_reference,
       status,enabled,approval_mode,last_health_status,last_health_message,last_health_at,created_at,updated_at)
      VALUES (?,?,?,?,?,?,NULL,?,?,1,'GOVERNED',NULL,NULL,NULL,?,?)`)
      .bind(crypto.randomUUID(), organizationId, key, name, capability, license, endpointReference, status, now, now).run();
  }
  await db().prepare(`UPDATE governed_integrations
    SET display_name='Chatwoot (optional fallback)',
        capability='OPTIONAL_COMMUNICATION_ADAPTER',
        enabled=CASE WHEN status='CONFIGURATION_REQUIRED' THEN 0 ELSE enabled END,
        updated_at=?
    WHERE organization_id=? AND provider_key='CHATWOOT'`)
    .bind(now, organizationId).run();
}

async function activeProperty(context: any) {
  return (await authorizedPropertyScope(context.email))?.property || null;
}

export async function integrationCenter(userEmail: string) {
  const context = await activeStaffContext(userEmail);
  if (!context) return null;
  await ensureIntegrationPlatform();
  await seedIntegrations(context.organizationId);
  const property = await activeProperty(context);
  if (!property) return null;
  const [integrations, runs, memories, publications, credentialStatus] = await Promise.all([
    db().prepare("SELECT * FROM governed_integrations WHERE organization_id=? ORDER BY display_name")
      .bind(context.organizationId).all(),
    db().prepare("SELECT * FROM integration_runs WHERE organization_id=? AND property_id=? ORDER BY created_at DESC LIMIT 50")
      .bind(context.organizationId, property.id).all(),
    db().prepare("SELECT * FROM organizational_memory_records WHERE organization_id=? AND property_id=? ORDER BY source_timestamp DESC LIMIT 50")
      .bind(context.organizationId, property.id).all(),
    db().prepare("SELECT * FROM social_publication_requests WHERE organization_id=? AND property_id=? ORDER BY created_at DESC LIMIT 30")
      .bind(context.organizationId, property.id).all(),
    db().prepare(`SELECT provider_key,field_key,last_four,updated_at FROM integration_credentials
      WHERE organization_id=? ORDER BY provider_key,field_key`).bind(context.organizationId).all(),
  ]);
  const runtime = env as unknown as Record<string, string | undefined>;
  const integrationRows = integrations.results.map((item: any) =>
    item.provider_key === "SUPERSET" && !item.endpoint && runtime.SUPERSET_BASE_URL
      ? { ...item, endpoint: runtime.SUPERSET_BASE_URL, credential_reference: "SITES_SECRET_VAULT" }
      : item);
  const integrationByKey = new Map(integrationRows.map((item: any) => [item.provider_key, item]));
  const channels = CHANNEL_CATALOG.map(([key, name, category, adapter, capability]) => {
    const backing = integrationByKey.get(adapter) as any;
    const status = adapter === "POSTIZ"
      ? (backing?.status === "CONNECTED" ? "AVAILABLE_VIA_POSTIZ" : "POSTIZ_CONFIGURATION_REQUIRED")
      : adapter === "META_CAPI"
        ? (backing?.status === "CONNECTED" ? "CONNECTED" : "CONFIGURATION_REQUIRED")
        : "CONFIGURATION_REQUIRED";
    return { key, name, category, adapter, capability, status,
      approvalMode: ["ADVERTISING", "PROFILE_AND_REVIEWS", "OTA_AND_REVIEWS", "BRAND_CHANNEL"].includes(category)
        ? "APPROVAL_REQUIRED" : "GOVERNED" };
  });
  const credentialRows = [...credentialStatus.results] as Array<Record<string, unknown>>;
  for (const fieldKey of ["SUPERSET_API_TOKEN", "SUPERSET_API_SECRET"]) {
    const value = runtime[fieldKey];
    if (value && !credentialRows.some(item => item.provider_key === "SUPERSET" && item.field_key === fieldKey)) {
      credentialRows.push({ provider_key: "SUPERSET", field_key: fieldKey,
        last_four: value.slice(-4), updated_at: "MANAGED_RUNTIME_SECRET" });
    }
  }
  return { role: context.role, property, integrations: integrationRows, channels, runs: runs.results,
    memories: memories.results, publications: publications.results, credentialStatus: credentialRows };
}

export async function saveIntegrationCredentials(userEmail: string, input: Record<string, unknown>) {
  const context = await activeStaffContext(userEmail);
  if (!context || context.role !== "admin") return null;
  await ensureIntegrationPlatform();
  const providerKey = String(input.providerKey || "").toUpperCase();
  const allowed = CREDENTIAL_FIELDS[providerKey] || [];
  if (!allowed.length) throw new Error("This integration does not accept vault credentials.");
  const values = (input.credentials || {}) as Record<string, unknown>;
  const now = new Date().toISOString();
  const stored: string[] = [];
  for (const fieldKey of allowed) {
    const value = String(values[fieldKey] || "").trim();
    if (!value) continue;
    if (value.length > 8000) throw new Error(`${fieldKey} is too long.`);
    const encrypted = await encryptCredential(value);
    await db().prepare(`INSERT INTO integration_credentials
      (id,organization_id,provider_key,field_key,ciphertext,iv,last_four,updated_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(organization_id,provider_key,field_key) DO UPDATE SET
      ciphertext=excluded.ciphertext,iv=excluded.iv,last_four=excluded.last_four,
      updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
      .bind(crypto.randomUUID(), context.organizationId, providerKey, fieldKey,
        encrypted.ciphertext, encrypted.iv, value.slice(-4), context.email, now, now).run();
    stored.push(fieldKey);
  }
  if (!stored.length) throw new Error("Enter at least one credential before saving.");
  await recordSystemAudit({ organizationId: context.organizationId, eventType: "INTEGRATION_CREDENTIAL_ROTATED",
    entityType: "GOVERNED_INTEGRATION", entityId: providerKey, authorType: "USER",
    authorId: context.email, correlationId: crypto.randomUUID(),
    delta: { credentialFields: stored, secretValuesLogged: false } });
  return { saved: true, providerKey, fields: stored };
}

export async function getIntegrationCredential(organizationId: string, providerKey: string, fieldKey: string) {
  await ensureIntegrationPlatform();
  const row = await db().prepare(`SELECT ciphertext,iv FROM integration_credentials
    WHERE organization_id=? AND provider_key=? AND field_key=?`)
    .bind(organizationId, providerKey, fieldKey).first<{ ciphertext: string; iv: string }>();
  return row ? decryptCredential(row.ciphertext, row.iv) : null;
}

export async function updateIntegration(userEmail: string, input: Record<string, unknown>) {
  const context = await activeStaffContext(userEmail);
  if (!context || context.role !== "admin") return null;
  await ensureIntegrationPlatform(); await seedIntegrations(context.organizationId);
  const key = String(input.providerKey || "").toUpperCase();
  const endpoint = String(input.endpoint || "").trim();
  if (endpoint) {
    let parsed: URL;
    try { parsed = new URL(endpoint); } catch { throw new Error("Enter a valid integration endpoint."); }
    const host = parsed.hostname.toLowerCase();
    const isIpLiteral = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(":");
    if (parsed.protocol !== "https:" || host === "localhost" || host.endsWith(".local") || isIpLiteral) {
      throw new Error("Production integration endpoints must use HTTPS and a public DNS hostname.");
    }
  }
  await db().prepare(`UPDATE governed_integrations SET endpoint=?,enabled=?,status=?,updated_at=?
    WHERE organization_id=? AND provider_key=?`).bind(endpoint || null, input.enabled ? 1 : 0,
      endpoint ? "READY_TO_TEST" : key === "OPENAI_AGENTS" || key === "LANGGRAPH" ? "ACTIVE" : "CONFIGURATION_REQUIRED",
      new Date().toISOString(), context.organizationId, key).run();
  await recordSystemAudit({ organizationId: context.organizationId, eventType: "GOVERNED_INTEGRATION_UPDATED",
    entityType: "GOVERNED_INTEGRATION", entityId: key, authorType: "USER", authorId: context.email,
    correlationId: crypto.randomUUID(), delta: { endpointConfigured: Boolean(endpoint), enabled: Boolean(input.enabled) } });
  return { saved: true };
}

export async function updateHealth(organizationId: string, providerKey: string, status: string, message: string) {
  const now = new Date().toISOString();
  await db().prepare(`UPDATE governed_integrations SET last_health_status=?,last_health_message=?,
    last_health_at=?,status=?,updated_at=? WHERE organization_id=? AND provider_key=?`)
    .bind(status, message.slice(0, 800), now, status === "HEALTHY" ? "CONNECTED" : status, now, organizationId, providerKey).run();
}

export async function recordIntegrationRun(context: any, propertyId: string, providerKey: string,
  runType: string, status: string, input: unknown, output: unknown, latencyMs: number, error?: string) {
  const id = crypto.randomUUID(), now = new Date().toISOString();
  await db().prepare(`INSERT INTO integration_runs
    (id,organization_id,property_id,provider_key,run_type,status,initiated_by,input_json,output_json,
     approval_status,latency_ms,error_message,created_at,completed_at) VALUES (?,?,?,?,?,?,?,?,?,'NOT_REQUIRED',?,?,?,?)`)
    .bind(id, context.organizationId, propertyId, providerKey, runType, status, context.email,
      JSON.stringify(input), JSON.stringify(output), latencyMs, error || null, now, now).run();
  return id;
}

export async function integrationExecutionContext(userEmail: string) {
  const context = await activeStaffContext(userEmail);
  if (!context) return null;
  await ensureIntegrationPlatform(); await seedIntegrations(context.organizationId);
  const property = await activeProperty(context);
  if (!property) return null;
  const integrations = await db().prepare("SELECT * FROM governed_integrations WHERE organization_id=? AND enabled=1")
    .bind(context.organizationId).all<Record<string, any>>();
  return { context, property, integrations: integrations.results };
}

export async function saveMemory(userEmail: string, input: Record<string, unknown>) {
  const execution = await integrationExecutionContext(userEmail);
  if (!execution) return null;
  const sourceType = String(input.sourceType || "USER_NOTE").slice(0, 40);
  const sourceId = String(input.sourceId || crypto.randomUUID()).slice(0, 120);
  const summary = String(input.summary || "").trim().slice(0, 5000);
  if (!summary) throw new Error("A memory summary is required.");
  const id = crypto.randomUUID(), now = new Date().toISOString();
  await db().prepare(`INSERT INTO organizational_memory_records
    (id,organization_id,property_id,department,source_type,source_id,source_link,source_timestamp,
     summary,facts_json,confidence,sensitivity,retention_until,legal_hold,superseded_by,
     contradictions_json,qdrant_point_id,index_status,created_by,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,? ,?,'INTERNAL',?,0,NULL,'[]',NULL,'PENDING',?,?,?)
     ON CONFLICT(organization_id,property_id,source_type,source_id) DO UPDATE SET summary=excluded.summary,
     facts_json=excluded.facts_json,confidence=excluded.confidence,index_status='PENDING',
     updated_at=excluded.updated_at`)
    .bind(id, execution.context.organizationId, execution.property.id, String(input.department || "") || null,
      sourceType, sourceId, String(input.sourceLink || "") || null, String(input.sourceTimestamp || now),
      summary, JSON.stringify(input.facts || {}), Number(input.confidence || 1),
      String(input.retentionUntil || new Date(Date.now() + 3 * 365 * 86_400_000).toISOString()),
      execution.context.email, now, now).run();
  return { id, propertyId: execution.property.id, summary, sourceType, sourceId };
}

export async function markMemoryIndexed(organizationId: string, propertyId: string, sourceType: string,
  sourceId: string, pointId: string | null, status: string) {
  await db().prepare(`UPDATE organizational_memory_records SET qdrant_point_id=?,index_status=?,updated_at=?
    WHERE organization_id=? AND property_id=? AND source_type=? AND source_id=?`)
    .bind(pointId, status, new Date().toISOString(), organizationId, propertyId, sourceType, sourceId).run();
}

export async function searchLocalMemories(userEmail: string, query: string, limit = 10) {
  const execution = await integrationExecutionContext(userEmail);
  if (!execution) return null;
  const words = query.trim().split(/\s+/).filter(Boolean).slice(0, 8);
  if (!words.length) return [];
  const clauses = words.map(() => "lower(summary) LIKE ?").join(" OR ");
  const result = await db().prepare(`SELECT id,department,source_type,source_id,source_link,
      source_timestamp,summary,confidence,index_status
    FROM organizational_memory_records
    WHERE organization_id=? AND property_id=? AND (${clauses})
    ORDER BY source_timestamp DESC LIMIT ?`)
    .bind(execution.context.organizationId, execution.property.id,
      ...words.map(word => `%${word.toLowerCase()}%`), Math.min(Math.max(limit, 1), 20)).all();
  return result.results;
}

export async function createSocialDraft(userEmail: string, input: Record<string, unknown>) {
  const execution = await integrationExecutionContext(userEmail);
  if (!execution) return null;
  const title = String(input.title || "").trim().slice(0, 180);
  const content = String(input.content || "").trim().slice(0, 5000);
  const channels = Array.isArray(input.channels) ? input.channels.slice(0, 20).map(item => {
    const record = item as Record<string, unknown>;
    return { id: String(record.id || "").trim(), type: String(record.type || "").trim() };
  }).filter(item => item.id && item.type) : [];
  if (!title || !content || !channels.length) throw new Error("Title, content, and at least one Postiz integration ID are required.");
  const id = crypto.randomUUID(), now = new Date().toISOString();
  await db().prepare(`INSERT INTO social_publication_requests
    (id,organization_id,property_id,title,content_json,channels_json,status,approval_required,
     approved_by,external_publication_json,created_by,created_at,updated_at)
    VALUES (?,?,?,?,?,?,'AWAITING_APPROVAL',1,NULL,NULL,?,?,?)`)
    .bind(id, execution.context.organizationId, execution.property.id, title,
      JSON.stringify({ content, scheduledAt: input.scheduledAt || null, mode: input.mode || "draft" }),
      JSON.stringify(channels), execution.context.email, now, now).run();
  await recordSystemAudit({ organizationId: execution.context.organizationId, propertyId: execution.property.id,
    eventType: "SOCIAL_PUBLICATION_DRAFT_CREATED", entityType: "SOCIAL_PUBLICATION_REQUEST",
    entityId: id, authorType: "USER", authorId: execution.context.email, correlationId: id,
    delta: { status: "AWAITING_APPROVAL", channelCount: channels.length } });
  return { id, status: "AWAITING_APPROVAL" };
}

export async function socialDraftForApproval(userEmail: string, id: string) {
  const execution = await integrationExecutionContext(userEmail);
  if (!execution || execution.context.role !== "admin") return null;
  const item = await db().prepare(`SELECT * FROM social_publication_requests
    WHERE id=? AND organization_id=? AND property_id=? AND status='AWAITING_APPROVAL'`)
    .bind(id, execution.context.organizationId, execution.property.id).first<Record<string, any>>();
  return item ? { execution, item } : null;
}

export async function finishSocialPublication(userEmail: string, id: string, output: unknown, status: string) {
  const execution = await integrationExecutionContext(userEmail);
  if (!execution || execution.context.role !== "admin") return null;
  const now = new Date().toISOString();
  await db().prepare(`UPDATE social_publication_requests SET status=?,approved_by=?,
    external_publication_json=?,updated_at=? WHERE id=? AND organization_id=? AND property_id=?`)
    .bind(status, execution.context.email, JSON.stringify(output), now, id,
      execution.context.organizationId, execution.property.id).run();
  await recordSystemAudit({ organizationId: execution.context.organizationId, propertyId: execution.property.id,
    eventType: `SOCIAL_PUBLICATION_${status}`, entityType: "SOCIAL_PUBLICATION_REQUEST",
    entityId: id, authorType: "USER", authorId: execution.context.email, correlationId: id,
    delta: { status }, metadata: { provider: "POSTIZ" } });
  return { id, status };
}

export function integrationDatabase(){ return db(); }
