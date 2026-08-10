import { env } from "cloudflare:workers";
import { activeStaffContext } from "./staff";
import { authorizedPropertyList, authorizedPropertyScope } from "./property-scope";
import { getIntegrationCredential } from "./open-source-integrations";

function db(): D1Database {
  if (!env.DB) throw new Error("Website Factory storage is unavailable.");
  return env.DB;
}

async function ensure() {
  db();
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70)
    || `hotel-${crypto.randomUUID().slice(0, 8)}`;
}

function safeJson(value: unknown, fallback: any) {
  try { return JSON.parse(String(value || "")); } catch { return fallback; }
}

export const WEBSITE_TEMPLATES=[
  {id:"MODERN_DIRECT",name:"Modern Direct",style:"MINIMAL_DIRECT_BOOKING",brand:"#17395f",accent:"#c58a32",tone:"clear and conversion focused"},{id:"EDITORIAL_STAY",name:"Editorial Stay",style:"EDITORIAL_HOSPITALITY",brand:"#23395b",accent:"#d4a64a",tone:"warm and editorial"},{id:"CONFERENCE_PREMIER",name:"Conference Premier",style:"CONFERENCE_PREMIUM",brand:"#132f4c",accent:"#b68b40",tone:"professional and event focused"},{id:"LOCAL_EXPLORER",name:"Local Explorer",style:"LOCAL_EXPERIENCE",brand:"#285943",accent:"#d8893b",tone:"local and discovery focused"},{id:"FAMILY_WELCOME",name:"Family Welcome",style:"FAMILY_FRIENDLY",brand:"#245b78",accent:"#f0a44b",tone:"friendly and reassuring"},{id:"BUSINESS_SMART",name:"Business Smart",style:"BUSINESS_TRAVEL",brand:"#1f3556",accent:"#57a6b5",tone:"efficient and polished"},{id:"SUITE_SERENITY",name:"Suite Serenity",style:"SUITE_LUXURY",brand:"#33304f",accent:"#c6a15b",tone:"quiet and refined"},{id:"ROADSIDE_EASY",name:"Roadside Easy",style:"ROADSIDE_CONVENIENCE",brand:"#174d68",accent:"#e09b3d",tone:"practical and welcoming"},{id:"HERITAGE_CLASSIC",name:"Heritage Classic",style:"HERITAGE_CLASSIC",brand:"#4b302b",accent:"#bd8b4b",tone:"classic and established"},{id:"URBAN_NAVY",name:"Urban Navy",style:"URBAN_MODERN",brand:"#111d36",accent:"#64b5c7",tone:"modern and confident"},{id:"SPA_CALM",name:"Spa Calm",style:"WELLNESS_CALM",brand:"#365b55",accent:"#c8ad7f",tone:"calm and restorative"},{id:"RESTAURANT_SOCIAL",name:"Restaurant Social",style:"RESTAURANT_FORWARD",brand:"#412b2d",accent:"#d29b55",tone:"social and food focused"},{id:"WEDDING_ELEGANCE",name:"Wedding Elegance",style:"WEDDING_EVENTS",brand:"#4b4058",accent:"#d5b78f",tone:"elegant and celebratory"},{id:"BOLD_BOOKING",name:"Bold Booking",style:"BOLD_CONVERSION",brand:"#12325c",accent:"#ffb638",tone:"bold and action oriented"},{id:"AIRY_MINIMAL",name:"Airy Minimal",style:"AIRY_MINIMAL",brand:"#344b5e",accent:"#85a8a1",tone:"light and uncluttered"},{id:"NATURE_RETREAT",name:"Nature Retreat",style:"NATURE_RETREAT",brand:"#304c3a",accent:"#c69a54",tone:"natural and relaxing"},{id:"GROUP_READY",name:"Group Ready",style:"GROUP_SALES",brand:"#233f66",accent:"#d2a44c",tone:"group and sales focused"},{id:"VALUE_CONFIDENCE",name:"Value Confidence",style:"VALUE_TRAVEL",brand:"#205477",accent:"#e4a444",tone:"straightforward and value focused"},{id:"DARK_LUXE",name:"Dark Luxe",style:"DARK_LUXURY",brand:"#171a24",accent:"#c9a562",tone:"dramatic and premium"},{id:"BRIGHT_SOCIAL",name:"Bright Social",style:"BRIGHT_SOCIAL",brand:"#205b78",accent:"#ef8354",tone:"bright and energetic"},
] as const;

async function allowedProperties(_organizationId: string, email: string, _role: string) {
  const scoped=await authorizedPropertyList(email);
  return {results:scoped?.properties||[],canonicalPropertyId:scoped?.canonicalPropertyId||null};
}

type PropertyProfile = {
  property: (Record<string, any> & { assetRootId: string | null }) | null;
  assets: Record<string, any>[];
  rooms: Record<string, any>[];
  spaces: Record<string, any>[];
  roomTypes: string[];
};

async function propertyProfile(organizationId: string, propertyContextId?: string): Promise<PropertyProfile> {
  let canonical = propertyContextId
    ? await db().prepare("SELECT * FROM property_contexts WHERE id=? AND organization_id=?")
      .bind(propertyContextId, organizationId).first<Record<string, any>>()
    : null;
  if (canonical?.status !== "ACTIVE") canonical = null;
  canonical ||= await db().prepare("SELECT * FROM property_contexts WHERE organization_id=? AND status='ACTIVE' ORDER BY created_at,id LIMIT 1")
    .bind(organizationId).first<Record<string, any>>();
  if (!canonical) return { property: null, assets: [], rooms: [], spaces: [], roomTypes: [] };
  const root = await db().prepare(`SELECT * FROM property_assets
    WHERE organization_id=? AND asset_type='PROPERTY' AND (property_id=? OR code=? OR lower(name)=lower(?))
    ORDER BY CASE WHEN property_id=? THEN 0 ELSE 1 END,created_at LIMIT 1`)
    .bind(organizationId, canonical.id, canonical.code, canonical.name, canonical.id).first<Record<string, any>>();
  const assets = root
    ? await db().prepare(`WITH RECURSIVE tree(id) AS (
        SELECT id FROM property_assets WHERE id=? AND organization_id=?
        UNION ALL SELECT p.id FROM property_assets p JOIN tree t ON p.parent_id=t.id
      ) SELECT * FROM property_assets WHERE id IN (SELECT id FROM tree) AND status='ACTIVE'
      ORDER BY asset_type,code`).bind(root.id, organizationId).all<Record<string, any>>()
    : { results: [] as Record<string, any>[] };
  const rooms = assets.results.filter(asset => asset.asset_type === "ROOM");
  const spaces = assets.results.filter(asset => asset.asset_type === "SPACE");
  return {
    property: { ...canonical, assetRootId: root?.id ?? null },
    assets: assets.results,
    rooms,
    spaces,
    roomTypes: [...new Set(rooms.map(room => room.room_type).filter(Boolean))],
  };
}

async function reconciliationCandidates(organizationId: string) {
  const roots = await db().prepare(`SELECT * FROM property_assets
    WHERE organization_id=? AND asset_type='PROPERTY' AND property_id IS NULL ORDER BY created_at`)
    .bind(organizationId).all<Record<string, any>>();
  const candidates = [];
  for (const root of roots.results) {
    const canonical = await db().prepare(`SELECT id,code,name FROM property_contexts
      WHERE organization_id=? AND (lower(name)=lower(?) OR code=?) LIMIT 1`)
      .bind(organizationId, root.name, root.code).first<Record<string, any>>();
    if (canonical) {
      await db().prepare(`UPDATE property_assets SET property_id=? WHERE id=? AND organization_id=?`)
        .bind(canonical.id, root.id, organizationId).run();
      continue;
    }
    const project = await db().prepare(`SELECT * FROM website_factory_projects
      WHERE organization_id=? AND (property_asset_id=? OR lower(name)=lower(?)) ORDER BY updated_at DESC LIMIT 1`)
      .bind(organizationId, root.id, root.name).first<Record<string, any>>();
    const count = await db().prepare(`WITH RECURSIVE tree(id) AS (
      SELECT id FROM property_assets WHERE id=? AND organization_id=?
      UNION ALL SELECT p.id FROM property_assets p JOIN tree t ON p.parent_id=t.id
    ) SELECT COUNT(*) count FROM tree`).bind(root.id, organizationId).first<{ count: number }>();
    const existingPlan = await db().prepare(`SELECT * FROM property_reconciliation_plans
      WHERE organization_id=? AND source_asset_id=? AND status IN ('DRAFT_REVIEW','APPROVED','SUCCEEDED')
      ORDER BY created_at DESC LIMIT 1`).bind(organizationId, root.id).first<Record<string, any>>();
    candidates.push({
      root,
      project,
      descendantCount: Math.max(0, Number(count?.count || 1) - 1),
      plan: existingPlan,
      proposedCode: /days inn/i.test(root.name) ? "DI-SALINA-SOUTH" : slugify(root.code || root.name).toUpperCase().slice(0, 20),
      proposedAddress: /days inn/i.test(root.name)
        ? "632 Westport Boulevard, Salina, KS 67401"
        : safeJson(project?.content_json, {}).address || "",
    });
  }
  return candidates;
}

export async function websiteFactory(email: string, propertyContextId?: string) {
  const context = await activeStaffContext(email); if (!context) return null;
  await ensure();
  const properties = await allowedProperties(context.organizationId, email, context.role);
  const scoped=await authorizedPropertyScope(email,propertyContextId);
  const activeId = scoped?.property.id||properties.results[0]?.id;
  const profile = await propertyProfile(context.organizationId, activeId);
  const projects = activeId
    ? await db().prepare(`SELECT * FROM website_factory_projects WHERE organization_id=? AND property_context_id=? AND status!='ARCHIVED'
      ORDER BY updated_at DESC`).bind(context.organizationId,activeId).all<Record<string, any>>()
    : {results:[] as Record<string,any>[]};
  const reconciliations = context.role === "admin" && !properties.canonicalPropertyId
    ? await reconciliationCandidates(context.organizationId) : [];
  const normalizedProjects = projects.results.map(project => ({
    ...project,
    content: safeJson(project.content_json, {}),
    seo: safeJson(project.seo_json, {}),
    missingFields: safeJson(project.missing_fields_json, []),
  }));
  return {
    role: context.role,
    properties: properties.results,
    activePropertyId: activeId,
    profile: {
      property: profile.property,
      roomCount: profile.rooms.length,
      roomTypes: profile.roomTypes,
      amenities: profile.spaces.map(space => space.name),
    },
    projects: normalizedProjects,
    reconciliations,
    templates: WEBSITE_TEMPLATES,
    metrics: {
      total: normalizedProjects.length,
      published: normalizedProjects.filter(project => project.status === "PUBLISHED").length,
      needsAttention: normalizedProjects.filter(project => project.missingFields.length > 0).length,
      ready: normalizedProjects.filter(project => project.missingFields.length === 0 && project.status !== "PUBLISHED").length,
    },
  };
}

export async function createReconciliationPlan(email: string, input: Record<string, unknown>) {
  const context = await activeStaffContext(email); if (!context || context.role !== "admin") return null;
  await ensure();
  const assetId = String(input.assetId || "");
  const root = await db().prepare(`SELECT * FROM property_assets
    WHERE id=? AND organization_id=? AND asset_type='PROPERTY' AND property_id IS NULL`)
    .bind(assetId, context.organizationId).first<Record<string, any>>();
  if (!root) throw new Error("This asset root is already linked or no longer available.");
  const existing = await db().prepare(`SELECT id FROM property_contexts WHERE organization_id=?
    AND (lower(name)=lower(?) OR code=?) LIMIT 1`).bind(context.organizationId, root.name, String(input.code || "")).first();
  if (existing) throw new Error("A canonical property with this name or code already exists. Link it instead of creating a duplicate.");
  const project = await db().prepare(`SELECT * FROM website_factory_projects WHERE organization_id=?
    AND (property_asset_id=? OR lower(name)=lower(?)) ORDER BY updated_at DESC LIMIT 1`)
    .bind(context.organizationId, root.id, root.name).first<Record<string, any>>();
  const descendants = await db().prepare(`WITH RECURSIVE tree(id) AS (
    SELECT id FROM property_assets WHERE id=? AND organization_id=?
    UNION ALL SELECT p.id FROM property_assets p JOIN tree t ON p.parent_id=t.id
  ) SELECT COUNT(*) count FROM tree`).bind(root.id, context.organizationId).first<{ count: number }>();
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const propertyId = crypto.randomUUID();
  const code = String(input.code || (/days inn/i.test(root.name) ? "DI-SALINA-SOUTH" : root.code)).toUpperCase().slice(0, 20);
  const address = String(/days inn/i.test(root.name)
    ? "632 Westport Boulevard, Salina, KS 67401"
    : input.address || safeJson(project?.content_json, {}).address || "").trim();
  const rollback = { sourceAssetId: root.id, previousPropertyId: null, projectId: project?.id || null, previousProjectPropertyId: project?.property_context_id || null };
  await db().batch([
    db().prepare(`INSERT INTO property_reconciliation_plans
      (id,organization_id,source_asset_id,source_website_project_id,proposed_property_id,proposed_code,
       proposed_name,proposed_address,status,descendant_count,conflicts_json,rollback_json,created_by,
       approved_by,created_at,updated_at,completed_at)
      VALUES (?,?,?,?,?,?,?,?, 'DRAFT_REVIEW',?,'[]',?,?,NULL,?,?,NULL)`)
      .bind(id, context.organizationId, root.id, project?.id || null, propertyId, code, root.name, address,
        Math.max(0, Number(descendants?.count || 1) - 1), JSON.stringify(rollback), context.email, now, now),
    db().prepare(`INSERT INTO property_reconciliation_audit
      (id,organization_id,plan_id,event_type,actor_email,detail_json,created_at)
      VALUES (?,?,?,'PREVIEW_CREATED',?,?,?)`)
      .bind(crypto.randomUUID(), context.organizationId, id, context.email,
        JSON.stringify({ code, name: root.name, address, descendants: descendants?.count || 1 }), now),
  ]);
  return { id, status: "DRAFT_REVIEW" };
}

export async function applyReconciliationPlan(email: string, planId: string) {
  const context = await activeStaffContext(email); if (!context || context.role !== "admin") return null;
  await ensure();
  const plan = await db().prepare(`SELECT * FROM property_reconciliation_plans
    WHERE id=? AND organization_id=? AND status='DRAFT_REVIEW'`).bind(planId, context.organizationId).first<Record<string, any>>();
  if (!plan) throw new Error("Reconciliation preview is unavailable or already completed.");
  const duplicate = await db().prepare(`SELECT id FROM property_contexts WHERE organization_id=?
    AND (lower(name)=lower(?) OR code=?) LIMIT 1`).bind(context.organizationId, plan.proposed_name, plan.proposed_code).first();
  if (duplicate) throw new Error("A matching canonical property now exists. Refresh and reconcile by linkage.");
  const now = new Date().toISOString();
  await db().batch([
    db().prepare(`INSERT INTO property_contexts
      (id,organization_id,code,name,address,timezone,database_mode,database_binding,status,created_by,created_at,updated_at)
      VALUES (?,?,?,?,?,'America/Chicago','SHARED_DATABASE',NULL,'ACTIVE',?,?,?)`)
      .bind(plan.proposed_property_id, context.organizationId, plan.proposed_code, plan.proposed_name,
        plan.proposed_address, context.email, now, now),
    db().prepare(`INSERT OR IGNORE INTO property_assignments
      (id,organization_id,property_id,user_email,department,role_label,is_default,status,created_at)
      VALUES (?,?,?,?, 'EXECUTIVE','Administrator',0,'ACTIVE',?)`)
      .bind(crypto.randomUUID(), context.organizationId, plan.proposed_property_id, context.email, now),
    db().prepare(`UPDATE property_assets SET property_id=? WHERE id IN (
      WITH RECURSIVE tree(id) AS (
        SELECT id FROM property_assets WHERE id=? AND organization_id=?
        UNION ALL SELECT p.id FROM property_assets p JOIN tree t ON p.parent_id=t.id
      ) SELECT id FROM tree)`).bind(plan.proposed_property_id, plan.source_asset_id, context.organizationId),
    db().prepare(`UPDATE website_factory_projects SET property_context_id=?,updated_at=?
      WHERE id=? AND organization_id=?`).bind(plan.proposed_property_id, now, plan.source_website_project_id, context.organizationId),
    db().prepare(`UPDATE property_reconciliation_plans SET status='SUCCEEDED',approved_by=?,updated_at=?,completed_at=?
      WHERE id=? AND organization_id=?`).bind(context.email, now, now, plan.id, context.organizationId),
    db().prepare(`INSERT INTO property_reconciliation_audit
      (id,organization_id,plan_id,event_type,actor_email,detail_json,created_at)
      VALUES (?,?,?,'CANONICAL_PROPERTY_RECONCILED',?,?,?)`)
      .bind(crypto.randomUUID(), context.organizationId, plan.id, context.email,
        JSON.stringify({ propertyId: plan.proposed_property_id, assetRootId: plan.source_asset_id, projectId: plan.source_website_project_id }), now),
  ]);
  return { propertyId: plan.proposed_property_id, propertyCode: plan.proposed_code, status: "SUCCEEDED" };
}

export async function createWebsiteProject(email: string, input: Record<string, unknown>, propertyContextId?: string) {
  const context = await activeStaffContext(email); if (!context || context.role !== "admin") return null;
  await ensure();
  const scoped=await authorizedPropertyScope(email,propertyContextId);
  const profile = await propertyProfile(context.organizationId,scoped?.property.id);
  if (!profile.property) throw new Error("Select a canonical property before building a website.");
  const existing = await db().prepare(`SELECT id FROM website_factory_projects
    WHERE organization_id=? AND property_context_id=? AND status!='ARCHIVED' LIMIT 1`)
    .bind(context.organizationId, profile.property.id).first();
  if (existing) throw new Error("This property already has an active website project. Open it from the portfolio.");
  const name = String(input.name || profile.property.name).trim();
  const slug = slugify(String(input.slug || name));
  const phone = String(input.phone || "").trim();
  const address = String(input.address || profile.property.address || "").trim();
  const bookingUrl = String(input.bookingUrl || "").trim();
  const selectedTemplate=WEBSITE_TEMPLATES.find(item=>item.id===String(input.templateId||""))??WEBSITE_TEMPLATES[0];
  const locality=String(profile.property.address||"").split(",")[1]?.trim()||"the local area";
  const generatedDescription=`${name} offers a ${selectedTemplate.tone} stay in ${locality}, with convenient access to local businesses, dining and area destinations. Guests can explore verified room choices, property amenities and direct-booking information in one place.`;
  const description = String(input.description || profile.property.description || generatedDescription).trim();
  const amenities = profile.spaces.map(space => space.name);
  const missing = [
    !address && "Property street address", !phone && "Public hotel phone", !bookingUrl && "Direct booking URL",
    !profile.roomTypes.length && "Room types",
  ].filter(Boolean);
  const content = {
    brandName: name, eyebrow: "Official property website", heroTitle: `Stay comfortably at ${name}`,
    heroDescription: description, address, phone, bookingUrl, roomCount: profile.rooms.length,
    roomTypes: profile.roomTypes, amenities, brandColor: selectedTemplate.brand, accentColor: selectedTemplate.accent,
    templateId:selectedTemplate.id,templateName:selectedTemplate.name,themeStyle:selectedTemplate.style, pages: ["Home", "Rooms", "Amenities", "Meetings & Events", "Offers", "Local Guide", "Contact"],
    sections: { rooms: true, amenities: true, restaurant: amenities.some(name => /restaurant|bar/i.test(name)),
      meetings: amenities.some(name => /meeting|conference|ballroom|banquet/i.test(name)), gallery: true,
      reviews: true, blog: true, events: true, chatbot: true, voice: true },
  };
  const seo = { title: `${name} | Official Hotel Website`, description: description.slice(0, 155),
    locality: "Salina", region: "Kansas", schemaType: "Hotel", status: "NEEDS_REVIEW",
    aeoQuestions: ["What amenities does the hotel offer?", "How do I book directly?", "Does the hotel have meeting space?"] };
  const id = crypto.randomUUID(), now = new Date().toISOString();
  await db().batch([
    db().prepare(`INSERT INTO website_factory_projects
      (id,organization_id,property_asset_id,name,slug,theme,status,content_json,seo_json,missing_fields_json,
       created_by,created_at,updated_at,property_context_id)
      VALUES (?,?,?,?,?,'${selectedTemplate.style}','DRAFT',?,?,?,?,?,?,?)`)
      .bind(id, context.organizationId, profile.property.assetRootId || "", name, slug, JSON.stringify(content),
        JSON.stringify(seo), JSON.stringify(missing), email, now, now, profile.property.id),
    db().prepare(`INSERT INTO website_factory_revisions
      (id,organization_id,project_id,revision_number,snapshot_json,change_summary,created_by,created_at)
      VALUES (?,?,?,1,?,'Initial AI-assisted site plan',?,?)`)
      .bind(crypto.randomUUID(), context.organizationId, id, JSON.stringify({ name, content, seo, missing }), email, now),
    db().prepare(`INSERT INTO website_factory_audit
      (id,organization_id,project_id,actor_email,event_type,detail_json,created_at)
      VALUES (?,?,?,?, 'AI_SITE_PLAN_CREATED',?,?)`)
      .bind(crypto.randomUUID(), context.organizationId, id, email,
        JSON.stringify({ propertyId: profile.property.id, missing, roomTypes: profile.roomTypes, amenities }), now),
  ]);
  return { id, slug, content, seo, missing, status: "DRAFT" };
}

export async function updateWebsiteProject(email: string, id: string, input: Record<string, unknown>) {
  const context = await activeStaffContext(email); if (!context || context.role !== "admin") return null;
  await ensure();
  const project = await db().prepare(`SELECT p.* FROM website_factory_projects p
    JOIN property_contexts c ON c.id=p.property_context_id
    WHERE p.id=? AND p.organization_id=?`).bind(id, context.organizationId).first<Record<string, any>>();
  if (!project) return null;
  const content = { ...safeJson(project.content_json, {}), ...((input.content as Record<string, unknown>) ?? {}) };
  const seo = { ...safeJson(project.seo_json, {}), ...((input.seo as Record<string, unknown>) ?? {}) };
  const missing = [!content.address && "Property street address", !content.phone && "Public hotel phone",
    !content.bookingUrl && "Direct booking URL", !content.roomTypes?.length && "Room types",
    !content.heroDescription && "Verified property description"].filter(Boolean);
  const action = String(input.action || "SAVE");
  if (action === "PUBLISH" && missing.length) throw new Error(`Publishing blocked. Complete: ${missing.join(", ")}.`);
  const status = action === "PUBLISH" ? "PUBLISHED" : action === "REQUEST_APPROVAL" ? "AWAITING_APPROVAL" : "DRAFT";
  const now = new Date().toISOString();
  const revision = await db().prepare(`SELECT COALESCE(MAX(revision_number),0)+1 next FROM website_factory_revisions
    WHERE project_id=?`).bind(id).first<{ next: number }>();
  const name = String(input.name || project.name).slice(0, 160);
  await db().batch([
    db().prepare(`UPDATE website_factory_projects SET name=?,content_json=?,seo_json=?,missing_fields_json=?,
      status=?,updated_at=?,published_at=CASE WHEN ?='PUBLISHED' THEN ? ELSE published_at END
      WHERE id=? AND organization_id=?`)
      .bind(name, JSON.stringify(content), JSON.stringify(seo), JSON.stringify(missing), status, now,
        status, now, id, context.organizationId),
    db().prepare(`INSERT INTO website_factory_revisions
      (id,organization_id,project_id,revision_number,snapshot_json,change_summary,created_by,created_at)
      VALUES (?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), context.organizationId, id, revision?.next || 1,
        JSON.stringify({ name, content, seo, missing, status }), action === "PUBLISH" ? "Published website revision" : "Editor changes saved", email, now),
    db().prepare(`INSERT INTO website_factory_audit
      (id,organization_id,project_id,actor_email,event_type,detail_json,created_at)
      VALUES (?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), context.organizationId, id, email,
        status === "PUBLISHED" ? "SITE_PUBLISHED" : status === "AWAITING_APPROVAL" ? "APPROVAL_REQUESTED" : "SITE_MODIFIED",
        JSON.stringify({ propertyId: project.property_context_id, missing, revision: revision?.next || 1 }), now),
  ]);
  return { id, status, missing, previewUrl: `/site-preview/${project.slug}` };
}

export async function websitePreview(slug: string, email?: string) {
  await ensure();
  const project = await db().prepare(`SELECT * FROM website_factory_projects WHERE slug=? LIMIT 1`).bind(slug).first<Record<string, any>>();
  if (!project) return null;
  if (project.status === "PUBLISHED") return { ...project, content: safeJson(project.content_json, {}), seo: safeJson(project.seo_json, {}) };
  if (!email) return null;
  const context = await activeStaffContext(email);
  if (!context || context.organizationId !== project.organization_id) return null;
  return { ...project, content: safeJson(project.content_json, {}), seo: safeJson(project.seo_json, {}) };
}

/** Real verified facts about the active property — the only grounding source
 * the AI generation agent gets besides its own web research. Never more than
 * what the manual template flow above already relies on. */
export async function propertyFactsForGeneration(email: string, propertyContextId?: string | null) {
  const context = await activeStaffContext(email);
  if (!context) return null;
  const scoped = await authorizedPropertyScope(email, propertyContextId);
  const profile = await propertyProfile(context.organizationId, scoped?.property.id);
  if (!profile.property) return { property: null };
  return {
    property: {
      name: profile.property.name, address: profile.property.address || null,
      timezone: profile.property.timezone || null, roomTypes: profile.roomTypes,
      roomCount: profile.rooms.length, amenities: profile.spaces.map((space: any) => space.name),
    },
  };
}

/**
 * Real web search — only runs when an admin has configured a Brave Search
 * API key in Integration Center. Returns snippets (title/url/description),
 * never fetched or scraped page content, so the agent has real, citable
 * source material without this codebase taking on an HTML-parsing surface.
 * Never invents a result when the key is missing or the request fails; the
 * caller must treat researchProperty(...).connected === false as "no
 * external research available," not as "nothing found."
 */
export async function researchProperty(organizationId: string, query: string) {
  const apiKey = await getIntegrationCredential(organizationId, "BRAVE_SEARCH", "BRAVE_SEARCH_API_KEY");
  if (!apiKey) return { connected: false, results: [] as { title: string; url: string; description: string }[] };
  try {
    const response = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query.slice(0, 200))}&count=6`, {
      headers: { Accept: "application/json", "X-Subscription-Token": apiKey },
    });
    if (!response.ok) return { connected: true, error: `Search request failed (${response.status}).`, results: [] };
    const data = await response.json() as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } };
    const results = (data.web?.results ?? []).slice(0, 6).map(item => ({
      title: String(item.title || "").slice(0, 200),
      url: String(item.url || ""),
      description: String(item.description || "").replace(/<[^>]+>/g, "").slice(0, 400),
    })).filter(item => item.url);
    return { connected: true, results };
  } catch {
    return { connected: true, error: "Search request failed.", results: [] };
  }
}

export type GeneratedWebsiteOption = {
  optionLabel: string; templateId: string; heroTitle: string; heroDescription: string;
  amenitiesHighlight: string[]; localAreaBlurb: string; callToAction: string;
};

/**
 * Persists an AI-generated batch of website options as DRAFT projects
 * sharing a variant_group_id, so a human can compare and pick one via the
 * existing chooseWebsiteOption()/updateWebsiteProject() PUBLISH flow. Unlike
 * createWebsiteProject() above, this does not block on an existing DRAFT —
 * only on an existing PUBLISHED site, since publishing (not drafting) is
 * this property's actual single-live-site constraint.
 */
export async function createWebsiteOptionSet(email: string, input: {
  propertyContextId?: string | null; options: GeneratedWebsiteOption[];
  researchUsed: boolean; sourcesUsed: { label: string; url: string | null }[];
}) {
  const context = await activeStaffContext(email); if (!context || context.role !== "admin") return null;
  await ensure();
  const scoped = await authorizedPropertyScope(email, input.propertyContextId);
  const profile = await propertyProfile(context.organizationId, scoped?.property.id);
  if (!profile.property) throw new Error("Select a canonical property before generating a website.");
  const published = await db().prepare(`SELECT id FROM website_factory_projects
    WHERE organization_id=? AND property_context_id=? AND status='PUBLISHED' LIMIT 1`)
    .bind(context.organizationId, profile.property.id).first();
  if (published) throw new Error("This property already has a published website. Archive it before generating new options.");
  if (!input.options.length) throw new Error("No website options were generated.");
  const variantGroupId = crypto.randomUUID();
  const now = new Date().toISOString();
  const researchSources = JSON.stringify(input.sourcesUsed);
  const created: { id: string; slug: string; variantLabel: string }[] = [];
  const statements: D1PreparedStatement[] = [];
  for (const option of input.options) {
    const template = WEBSITE_TEMPLATES.find(item => item.id === option.templateId) ?? WEBSITE_TEMPLATES[0];
    const id = crypto.randomUUID();
    const slug = slugify(`${profile.property.name}-${option.optionLabel}-${id.slice(0, 6)}`);
    const content = {
      brandName: profile.property.name, eyebrow: "AI-generated site option", heroTitle: option.heroTitle,
      heroDescription: option.heroDescription, address: profile.property.address || "", phone: "", bookingUrl: "",
      roomCount: profile.rooms.length, roomTypes: profile.roomTypes,
      amenities: option.amenitiesHighlight.length ? option.amenitiesHighlight : profile.spaces.map((s: any) => s.name),
      localAreaBlurb: option.localAreaBlurb, callToAction: option.callToAction,
      brandColor: template.brand, accentColor: template.accent, templateId: template.id, templateName: template.name, themeStyle: template.style,
      pages: ["Home", "Rooms", "Amenities", "Local Guide", "Contact"],
      sections: { rooms: true, amenities: true, gallery: true, reviews: true, blog: false, events: false, chatbot: true, voice: false },
    };
    const missing = [
      !content.address && "Property street address", !content.phone && "Public hotel phone",
      !content.bookingUrl && "Direct booking URL", !profile.roomTypes.length && "Room types",
    ].filter(Boolean);
    const seo = { title: `${profile.property.name} | Official Hotel Website`, description: option.heroDescription.slice(0, 155),
      status: "NEEDS_REVIEW", aeoQuestions: ["What amenities does the hotel offer?", "How do I book directly?"] };
    statements.push(db().prepare(`INSERT INTO website_factory_projects
      (id,organization_id,property_asset_id,name,slug,theme,status,content_json,seo_json,missing_fields_json,
       created_by,created_at,updated_at,property_context_id,variant_group_id,variant_label,research_sources_json)
      VALUES (?,?,?,?,?,'${template.style}','DRAFT',?,?,?,?,?,?,?,?,?,?)`)
      .bind(id, context.organizationId, profile.property.assetRootId || "", profile.property.name, slug,
        JSON.stringify(content), JSON.stringify(seo), JSON.stringify(missing), email, now, now,
        profile.property.id, variantGroupId, option.optionLabel, researchSources));
    statements.push(db().prepare(`INSERT INTO website_factory_revisions
      (id,organization_id,project_id,revision_number,snapshot_json,change_summary,created_by,created_at)
      VALUES (?,?,?,1,?,?,?,?)`)
      .bind(crypto.randomUUID(), context.organizationId, id,
        JSON.stringify({ name: profile.property.name, content, seo, missing }),
        `AI-generated option: ${option.optionLabel}${input.researchUsed ? " (web research used)" : ""}`, email, now));
    statements.push(db().prepare(`INSERT INTO website_factory_audit
      (id,organization_id,project_id,actor_email,event_type,detail_json,created_at)
      VALUES (?,?,?,?, 'AI_SITE_OPTION_GENERATED',?,?)`)
      .bind(crypto.randomUUID(), context.organizationId, id, email,
        JSON.stringify({ variantGroupId, optionLabel: option.optionLabel, researchUsed: input.researchUsed, missing }), now));
    created.push({ id, slug, variantLabel: option.optionLabel });
  }
  await db().batch(statements);
  return { variantGroupId, projects: created };
}

/** Human picks one AI-generated option; its siblings in the same batch are
 * archived. The chosen project stays DRAFT — publishing still requires the
 * existing, unchanged updateWebsiteProject(..., {action:"PUBLISH"}) step. */
export async function chooseWebsiteOption(email: string, projectId: string) {
  const context = await activeStaffContext(email); if (!context || context.role !== "admin") return null;
  await ensure();
  const project = await db().prepare(`SELECT * FROM website_factory_projects WHERE id=? AND organization_id=?`)
    .bind(projectId, context.organizationId).first<Record<string, any>>();
  if (!project) throw new Error("Website option was not found.");
  if (!project.variant_group_id) throw new Error("This project is not part of a generated option set.");
  const now = new Date().toISOString();
  await db().batch([
    db().prepare(`UPDATE website_factory_projects SET status='ARCHIVED',updated_at=?
      WHERE organization_id=? AND variant_group_id=? AND id!=? AND status!='PUBLISHED'`)
      .bind(now, context.organizationId, project.variant_group_id, projectId),
    db().prepare(`INSERT INTO website_factory_audit
      (id,organization_id,project_id,actor_email,event_type,detail_json,created_at)
      VALUES (?,?,?,?, 'AI_SITE_OPTION_CHOSEN',?,?)`)
      .bind(crypto.randomUUID(), context.organizationId, projectId, email,
        JSON.stringify({ variantGroupId: project.variant_group_id }), now),
  ]);
  return { id: projectId, status: project.status, previewUrl: `/site-preview/${project.slug}` };
}
