import { env } from "cloudflare:workers";
import { activeStaffContext } from "./staff";
import { emitReportEvent } from "./reporting-layer";
import { authorizedPropertyScope } from "./property-scope";

function db(): D1Database {
  if (!env.DB) throw new Error("Review intelligence storage is unavailable.");
  return env.DB;
}

async function ensureTables() {
  db();
}

function classify(rating: number | null, text: string) {
  const lower = text.toLowerCase();
  const critical = /\b(unsafe|bedbug|bed bug|assault|stolen|theft|discrimination|blood|fire|fraud)\b/.test(lower);
  const negative = critical || /\b(dirty|filthy|broken|rude|smell|mold|noise|loud|refund|terrible|worst|bad|unacceptable)\b/.test(lower) || (rating !== null && rating <= 2);
  const positive = !negative && (/\b(great|excellent|clean|friendly|wonderful|comfortable|love|amazing)\b/.test(lower) || (rating !== null && rating >= 4));
  const themes = [
    [/\b(clean|dirty|filthy|linen|bathroom|housekeep)/, "CLEANLINESS"],
    [/\b(broken|hvac|air condition|heat|leak|maintenance|repair)/, "MAINTENANCE"],
    [/\b(rude|friendly|staff|front desk|service)/, "SERVICE"],
    [/\b(noise|loud|quiet)/, "NOISE"],
    [/\b(breakfast|restaurant|food|bar)/, "FOOD_BEVERAGE"],
    [/\b(refund|charge|billing|folio|price)/, "BILLING"],
    [/\b(pool|fitness|gym|amenity)/, "AMENITIES"],
  ].filter(([pattern]) => (pattern as RegExp).test(lower)).map(([, theme]) => theme as string);
  const scoreSentiment=rating!==null&&rating<3?"NEGATIVE":rating!==null&&rating>=4?"POSITIVE":null;
  return {
    sentiment: scoreSentiment ?? (critical ? "CRITICAL" : negative ? "NEGATIVE" : positive ? "POSITIVE" : "NEUTRAL"),
    urgency: rating!==null&&rating<3 ? "HIGH" : critical ? "CRITICAL" : negative ? "HIGH" : "LOW",
    themes: themes.length ? themes : ["GENERAL"],
  };
}

function draftResponse(propertyName: string, guestName: string, rating: number | null, text: string, sentiment: string, themes: string[]) {
  const firstName = guestName && guestName !== "Anonymous" ? ` ${guestName.split(" ")[0]}` : "";
  if (sentiment === "POSITIVE") {
    return `Thank you${firstName} for sharing your experience at ${propertyName}. We are delighted that your stay went well, and we appreciate your recognition of ${themes.includes("SERVICE") ? "our team" : themes.includes("CLEANLINESS") ? "the cleanliness of your accommodations" : "your overall experience"}. We look forward to welcoming you back.`;
  }
  if (sentiment === "NEUTRAL") {
    return `Thank you${firstName} for reviewing your stay at ${propertyName}. We appreciate the details you shared. Your feedback has been routed to our management team so we can reinforce what worked and improve the areas that did not fully meet expectations. We hope to provide a stronger experience on your next visit.`;
  }
  const issue = themes.includes("CLEANLINESS") ? "the cleanliness concerns you described"
    : themes.includes("MAINTENANCE") ? "the maintenance issue you experienced"
    : themes.includes("SERVICE") ? "the service concerns you described"
    : themes.includes("BILLING") ? "the billing concern you raised"
    : "the experience you described";
  return `Dear${firstName || " Guest"}, thank you for bringing ${issue} to our attention. We are sorry that your stay at ${propertyName} did not meet expectations. We have opened a management review so the underlying issue can be verified and corrected. To protect your privacy, please contact the hotel directly with your stay details so our team can follow up personally.`;
}

export async function reviewCenter(email: string) {
  const context = await activeStaffContext(email);
  if (!context) return null;
  await ensureTables();
  const scoped = await authorizedPropertyScope(email);
  if (!scoped) return null;
  const property = scoped.property;
  const [reviews, drafts, cases, sources, advocacy] = await Promise.all([
    db().prepare("SELECT * FROM guest_review_events WHERE organization_id=? AND property_id=? ORDER BY received_at DESC LIMIT 500").bind(context.organizationId, property.id).all(),
    db().prepare("SELECT * FROM review_response_drafts WHERE organization_id=? AND property_id=? ORDER BY created_at DESC").bind(context.organizationId, property.id).all(),
    db().prepare("SELECT * FROM review_recovery_cases WHERE organization_id=? AND property_id=? ORDER BY created_at DESC").bind(context.organizationId, property.id).all(),
    db().prepare("SELECT * FROM review_source_connections WHERE organization_id=? AND property_id=? ORDER BY source").bind(context.organizationId, property.id).all(),
    db().prepare("SELECT * FROM review_advocacy_invites WHERE organization_id=? AND property_id=? ORDER BY created_at DESC").bind(context.organizationId, property.id).all(),
  ]);
  return { role: context.role, property: property ?? null, reviews: reviews.results, drafts: drafts.results, cases: cases.results, sources: sources.results, advocacy: advocacy.results };
}

export async function ingestReview(email: string, input: Record<string, unknown>) {
  const context = await activeStaffContext(email);
  if (!context) return null;
  await ensureTables();
  const scoped = await authorizedPropertyScope(email, String(input.propertyId ?? "") || null);
  if (!scoped) return null;
  const property = scoped.property;
  const source = String(input.source ?? "MANUAL").toUpperCase().slice(0, 40);
  const account = String(input.sourceAccount ?? "Primary property").slice(0, 120);
  const externalId = String(input.externalId ?? crypto.randomUUID()).slice(0, 180);
  const text = String(input.reviewText ?? "").trim();
  if (!text) throw new Error("Review text is required.");
  const rating = input.rating === null || input.rating === "" || input.rating === undefined ? null : Number(input.rating);
  if (rating !== null && (!Number.isFinite(rating) || rating < 1 || rating > 5)) throw new Error("Rating must be between 1 and 5.");
  const duplicate = await db().prepare(`SELECT id FROM guest_review_events
    WHERE organization_id=? AND property_id=? AND source=? AND source_account=? AND external_id=?`)
    .bind(context.organizationId, property.id, source, account, externalId).first();
  if (duplicate) return { duplicate: true, id: (duplicate as any).id };
  const analysis = classify(rating, text);
  const propertyName = property.name ?? "our hotel";
  const guestName = String(input.guestName ?? "Anonymous").slice(0, 120);
  const id = crypto.randomUUID(), now = new Date().toISOString(), draftId = crypto.randomUUID();
  const statements: D1PreparedStatement[] = [
    db().prepare(`INSERT INTO guest_review_events
      (id,organization_id,property_id,source,source_account,external_id,guest_name,rating,review_title,review_text,
       stay_date,received_at,sentiment,urgency,themes_json,status,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'RESPONSE_DRAFTED',?)`)
      .bind(id, context.organizationId, property.id, source, account, externalId, guestName, rating,
        String(input.reviewTitle ?? "").slice(0, 180), text.slice(0, 5000), input.stayDate || null,
        String(input.receivedAt ?? now), analysis.sentiment, analysis.urgency, JSON.stringify(analysis.themes), now),
    db().prepare(`INSERT INTO review_response_drafts
      (id,organization_id,property_id,review_id,response_text,response_tone,model_label,status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,'AAIQ_CONTEXT_RESPONSE_V1','PENDING_APPROVAL',?,?)`)
      .bind(draftId, context.organizationId, property.id, id,
        draftResponse(propertyName, guestName, rating, text, analysis.sentiment, analysis.themes),
        analysis.sentiment === "POSITIVE" ? "GRATEFUL" : analysis.sentiment === "NEUTRAL" ? "PROFESSIONAL" : "EMPATHETIC",
        now, now),
  ];
  if (["NEGATIVE", "CRITICAL"].includes(analysis.sentiment)) {
    statements.push(db().prepare(`INSERT INTO review_recovery_cases
      (id,organization_id,property_id,review_id,priority,department,summary,status,owner_email,created_at)
      VALUES (?,?,?,?,?,?,?,'OPEN',NULL,?)`)
      .bind(crypto.randomUUID(), context.organizationId, property.id, id, analysis.urgency,
        analysis.themes.includes("CLEANLINESS") ? "HOUSEKEEPING" : analysis.themes.includes("MAINTENANCE") ? "MAINTENANCE" : "EXECUTIVE",
        `${analysis.themes.join(", ")} feedback from ${source}: ${text.slice(0, 400)}`, now));
  } else if (rating!==null&&rating>=4) {
    statements.push(db().prepare(`INSERT INTO review_advocacy_invites
      (id,organization_id,property_id,review_id,guest_name,google_url,tripadvisor_url,facebook_url,status,created_at)
      VALUES (?,?,?,?,?,?,?,?,'READY_TO_OFFER',?)`).bind(crypto.randomUUID(),context.organizationId,property.id,id,guestName,
      String(input.googleReviewUrl??"https://www.google.com/search?q=Wyndham+Garden+Salina+reviews"),
      String(input.tripadvisorReviewUrl??"https://www.tripadvisor.com/"),
      String(input.facebookReviewUrl??"https://www.facebook.com/"),now));
  }
  await db().batch(statements);
  await emitReportEvent({
    organizationId: context.organizationId, propertyId: property.id, sourceModule: "REVIEW_INTELLIGENCE",
    eventType: "GUEST_REVIEW_INTERCEPTED", entityType: "guest_review", entityId: id,
    idempotencyKey: `review:${source}:${account}:${externalId}`, occurredAt: now,
    payload: { source, sentiment: analysis.sentiment, urgency: analysis.urgency, themes: analysis.themes },
  });
  return { id, analysis, draftId };
}

export async function updateResponseDraft(email: string, reviewId: string, responseText: string, action: string) {
  const context = await activeStaffContext(email);
  if (!context || context.role !== "admin") return null;
  await ensureTables();
  const scoped = await authorizedPropertyScope(email);
  if (!scoped) return null;
  if (!responseText.trim()) throw new Error("Response text cannot be empty.");
  const now = new Date().toISOString();
  const status = action === "APPROVE" ? "APPROVED_FOR_POSTING" : "PENDING_APPROVAL";
  await db().prepare(`UPDATE review_response_drafts SET response_text=?,status=?,updated_at=?,
    approved_by=CASE WHEN ?='APPROVED_FOR_POSTING' THEN ? ELSE approved_by END,
    approved_at=CASE WHEN ?='APPROVED_FOR_POSTING' THEN ? ELSE approved_at END
    WHERE review_id=? AND organization_id=? AND property_id=?`)
    .bind(responseText.slice(0, 5000), status, now, status, email, status, now, reviewId, context.organizationId, scoped.property.id).run();
  return { reviewId, status };
}
export async function updateRecoveryCase(email:string,caseId:string,status:string,ownerEmail:string){
 const context=await activeStaffContext(email);if(!context||context.role!=="admin")return null;await ensureTables();
 const scoped=await authorizedPropertyScope(email);if(!scoped)return null;
 const safe=["OPEN","IN_PROGRESS","GUEST_CONTACTED","RESOLVED"].includes(status)?status:"IN_PROGRESS",now=new Date().toISOString();
 await db().prepare(`UPDATE review_recovery_cases SET status=?,owner_email=?,resolved_at=CASE WHEN ?='RESOLVED' THEN ? ELSE resolved_at END WHERE id=? AND organization_id=? AND property_id=?`).bind(safe,ownerEmail.slice(0,180)||email,safe,now,caseId,context.organizationId,scoped.property.id).run();
 return{id:caseId,status:safe};
}
