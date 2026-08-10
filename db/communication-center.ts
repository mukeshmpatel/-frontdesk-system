import { env } from "cloudflare:workers";
import { activeStaffContext } from "./staff";
import { authorizedPropertyScope } from "./property-scope";
import { recordSystemAudit } from "./platform-controls";
import { listGoogleConnections } from "./google";
import { decryptSecret } from "../app/server/secrets";
import { sendGmailMessage } from "../app/server/google";
import { classifyReplyRisk, runMasterInboxCertification,
  universalConversationId } from "../lib/master-inbox-certification.mjs";

function db(): D1Database {
  if (!env.DB) throw new Error("AAIQ communication storage is unavailable.");
  return env.DB;
}

async function activeProperty(context: any) {
  return (await authorizedPropertyScope(context.email))?.property || null;
}

export async function ensureCommunicationCenter() {
  db();
}

function classify(text: string) {
  const value = text.toLowerCase();
  const rules: Array<[string, string[], string, string, number]> = [
    ["SAFETY_INCIDENT", ["injury", "fire", "unsafe", "police", "ambulance"], "CRITICAL", "EXECUTIVE", 98],
    ["GUEST_COMPLAINT", ["complaint", "dirty room", "angry", "terrible", "broken"], "HIGH", "FRONT_DESK", 94],
    ["MAINTENANCE_REQUEST", ["air conditioner", "ac not", "leak", "toilet", "light"], "HIGH", "MAINTENANCE", 93],
    ["ADDITIONAL_ITEM", ["towel", "pillow", "blanket", "coffee", "toiletries"], "MEDIUM", "HOUSEKEEPING", 95],
    ["PET_ROOM", ["pet", "dog", "cat", "service animal"], "MEDIUM", "FRONT_DESK", 91],
    ["LATE_CHECKOUT", ["late checkout", "extend checkout"], "LOW", "FRONT_DESK", 96],
    ["RESERVATION", ["reservation", "booking", "arrival", "confirmation"], "MEDIUM", "FRONT_DESK", 90],
    ["VENDOR", ["vendor", "delivery", "shipment", "backorder"], "MEDIUM", "INVENTORY", 91],
  ];
  const matched = rules.find(([, terms]) => terms.some(term => value.includes(term)));
  if (!matched) return { category: "INFORMATIONAL", priority: "LOW", department: "FRONT_DESK",
    confidence: 58, reason: "No approved high-confidence rule matched. Human review is required." };
  const [category, terms, priority, department, confidence] = matched;
  const evidence = terms.find(term => value.includes(term));
  return { category, priority, department, confidence,
    reason: `Approved AAIQ communication rule matched “${evidence}”.` };
}

async function seedSources(organizationId: string, propertyId: string) {
  const now = new Date().toISOString();
  const sources = [
    ["INTERNAL", "AAIQ Internal & Manual", "NATIVE", "ACTIVE", null, 1],
    ["WEBSITE_CHAT", "Website Guest Chat", "AAIQ_WIDGET", "READY", null, 1],
    ["GMAIL", "Google Workspace / Gmail", "OAUTH", "CREDENTIALS_REQUIRED", "GOOGLE_OAUTH_REFERENCE", 0],
    ["OUTLOOK", "Microsoft Outlook", "OAUTH", "CREDENTIALS_REQUIRED", "MICROSOFT_OAUTH_REFERENCE", 0],
    ["TWILIO_SMS", "Twilio SMS & Phone", "WEBHOOK", "CREDENTIALS_REQUIRED", "TWILIO_VAULT_REFERENCE", 0],
    ["WHATSAPP", "WhatsApp Business", "WEBHOOK", "CREDENTIALS_REQUIRED", "WHATSAPP_VAULT_REFERENCE", 0],
    ["FACEBOOK_MESSENGER", "Facebook Messenger", "WEBHOOK", "CREDENTIALS_REQUIRED", "META_VAULT_REFERENCE", 0],
    ["INSTAGRAM_DM", "Instagram Direct", "WEBHOOK", "CREDENTIALS_REQUIRED", "META_VAULT_REFERENCE", 0],
    ["GOOGLE_REVIEWS", "Google Business Reviews", "API", "CREDENTIALS_REQUIRED", "GOOGLE_BUSINESS_VAULT_REFERENCE", 0],
    ["TRIPADVISOR", "Tripadvisor Reviews", "API_OR_MANUAL", "CREDENTIALS_REQUIRED", "TRIPADVISOR_VAULT_REFERENCE", 0],
    ["BOOKING_COM", "Booking.com Guest Reviews", "API_OR_MANUAL", "CREDENTIALS_REQUIRED", "BOOKING_COM_VAULT_REFERENCE", 0],
    ["EXPEDIA", "Expedia Partner Reviews", "API_OR_MANUAL", "CREDENTIALS_REQUIRED", "EXPEDIA_VAULT_REFERENCE", 0],
    ["CHATWOOT", "Chatwoot External Adapter", "OPTIONAL", "OPTIONAL_DISABLED", "CHATWOOT_VAULT_REFERENCE", 0],
  ] as const;
  for (const [key, name, mode, status, reference, enabled] of sources) {
    await db().prepare(`INSERT OR IGNORE INTO communication_sources
      (id,organization_id,property_id,source_key,display_name,connection_mode,status,
       credential_reference,last_sync_at,last_error,enabled,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,NULL,NULL,?,?,?)`)
      .bind(crypto.randomUUID(), organizationId, propertyId, key, name, mode, status,
        reference, enabled, now, now).run();
  }
}

export async function communicationCenter(userEmail: string) {
  const context = await activeStaffContext(userEmail);
  if (!context) return null;
  await ensureCommunicationCenter();
  const property = await activeProperty(context);
  if (!property) return null;
  await seedSources(context.organizationId, property.id);
  const googleAccounts = await listGoogleConnections(userEmail);
  if (googleAccounts.length) {
    await db().prepare(`UPDATE communication_sources
      SET status='CONNECTED',enabled=1,last_error=NULL,updated_at=?
      WHERE organization_id=? AND property_id=? AND source_key='GMAIL'`)
      .bind(new Date().toISOString(), context.organizationId, property.id).run();
  }
  const [sources, threads, drafts, messages, deliveries, certifications] = await Promise.all([
    db().prepare(`SELECT source_key,display_name,connection_mode,status,last_sync_at,last_error,enabled
      FROM communication_sources WHERE organization_id=? AND property_id=? ORDER BY display_name`)
      .bind(context.organizationId, property.id).all(),
    db().prepare(`SELECT * FROM communication_threads WHERE organization_id=? AND property_id=?
      ORDER BY CASE priority WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,
      latest_message_at DESC LIMIT 100`).bind(context.organizationId, property.id).all(),
    db().prepare(`SELECT d.*,t.subject,t.source_key FROM communication_reply_drafts d
      JOIN communication_threads t ON t.id=d.thread_id
      WHERE d.organization_id=? AND d.property_id=? ORDER BY d.created_at DESC LIMIT 50`)
      .bind(context.organizationId, property.id).all(),
    db().prepare(`SELECT * FROM communication_messages WHERE organization_id=? AND property_id=?
      ORDER BY received_at ASC LIMIT 500`).bind(context.organizationId, property.id).all(),
    db().prepare(`SELECT * FROM communication_delivery_attempts WHERE organization_id=? AND property_id=?
      ORDER BY attempted_at DESC LIMIT 100`).bind(context.organizationId, property.id).all(),
    db().prepare(`SELECT * FROM communication_certification_runs WHERE organization_id=? AND property_id=?
      ORDER BY executed_at DESC LIMIT 10`).bind(context.organizationId, property.id).all(),
  ]);
  const rows = threads.results as Array<Record<string, any>>;
  return {
    role: context.role, property, sources: sources.results, threads: rows, drafts: drafts.results,
    messages: messages.results, deliveries: deliveries.results, certifications: certifications.results,
    googleAccounts: googleAccounts.map(account => ({
      id: account.id,
      email: account.account_email,
      name: account.display_name,
      connectedAt: account.created_at,
    })),
    metrics: {
      open: rows.filter(item => !["RESOLVED", "CLOSED"].includes(item.status)).length,
      critical: rows.filter(item => item.priority === "CRITICAL" && item.status !== "CLOSED").length,
      awaitingApproval: rows.filter(item => item.approval_status === "AWAITING_APPROVAL").length,
      unassigned: rows.filter(item => !item.assigned_user && !["RESOLVED", "CLOSED"].includes(item.status)).length,
    },
    automation: { provider: "AAIQ_NATIVE_COMMUNICATIONS", status: "ACTIVE",
      manualFallback: "Every source can be entered manually when an external connector is unavailable." },
  };
}

export async function renameCommunicationSource(userEmail: string, input: Record<string, unknown>) {
  const context = await activeStaffContext(userEmail);
  if (!context || context.role !== "admin") return null;
  await ensureCommunicationCenter();
  const property = await activeProperty(context);
  if (!property) return null;
  const sourceKey = String(input.sourceKey || "").toUpperCase().slice(0, 40);
  const displayName = String(input.displayName || "").trim().slice(0, 100);
  if (!sourceKey || !displayName) throw new Error("Source and inbox name are required.");
  const now = new Date().toISOString();
  await db().prepare(`UPDATE communication_sources SET display_name=?,updated_at=?
    WHERE organization_id=? AND property_id=? AND source_key=?`)
    .bind(displayName, now, context.organizationId, property.id, sourceKey).run();
  await recordSystemAudit({ organizationId: context.organizationId, propertyId: property.id,
    eventType: "COMMUNICATION_SOURCE_RENAMED", entityType: "COMMUNICATION_SOURCE", entityId: sourceKey,
    authorType: "USER", authorId: context.email, correlationId: crypto.randomUUID(),
    delta: { displayName } });
  return { sourceKey, displayName };
}

export async function createCommunicationIntake(userEmail: string, input: Record<string, unknown>) {
  const context = await activeStaffContext(userEmail);
  if (!context) return null;
  await ensureCommunicationCenter();
  const property = await activeProperty(context);
  if (!property) return null;
  const body = String(input.body || "").trim().slice(0, 12000);
  const subject = String(input.subject || "").trim().slice(0, 240) || "Guest communication";
  if (!body) throw new Error("Message content is required.");
  const sourceKey = String(input.sourceKey || "INTERNAL").toUpperCase().slice(0, 40);
  const classification = classify(`${subject}\n${body}`);
  const now = new Date().toISOString(), threadId = crypto.randomUUID(), correlationId = crypto.randomUUID();
  const externalThreadId = String(input.externalThreadId || crypto.randomUUID()).slice(0, 160);
  const existing = await db().prepare(`SELECT id,correlation_id,status FROM communication_threads
    WHERE organization_id=? AND property_id=? AND source_key=? AND external_thread_id=?`)
    .bind(context.organizationId, property.id, sourceKey, externalThreadId)
    .first<Record<string, any>>();
  if (existing) {
    return { id: existing.id, correlationId: existing.correlation_id, status: existing.status,
      classification, duplicate: true };
  }
  const status = classification.confidence >= 90 ? "TRIAGED" : "NEEDS_REVIEW";
  const approvalStatus = ["SAFETY_INCIDENT", "GUEST_COMPLAINT"].includes(classification.category)
    ? "AWAITING_APPROVAL" : "NOT_REQUIRED";
  await db().batch([
    db().prepare(`INSERT INTO communication_threads
      (id,organization_id,property_id,correlation_id,source_key,source_account,external_thread_id,
       guest_reference,room_reference,subject,status,priority,category,assigned_department,
       assigned_user,confidence,reasoning_summary,approval_status,latest_message_at,due_at,
       acknowledged_at,closed_at,created_by,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,?,?,?,?,NULL,NULL,NULL,?,?,?)`)
      .bind(threadId, context.organizationId, property.id, correlationId, sourceKey,
        String(input.sourceAccount || "Manual intake").slice(0, 180), externalThreadId,
        String(input.guestReference || "").slice(0, 180) || null,
        String(input.roomReference || "").slice(0, 40) || null, subject, status,
        classification.priority, classification.category, classification.department,
        classification.confidence, classification.reason, approvalStatus, now,
        context.email, now, now),
    db().prepare(`INSERT INTO communication_messages
      (id,organization_id,property_id,thread_id,external_message_id,direction,sender_label,
       recipient_label,body,attachment_count,sensitivity,received_at,created_by,created_at)
       VALUES (?,?,?,?,?,'INBOUND',?,?,?,0,'INTERNAL',?,?,?)`)
      .bind(crypto.randomUUID(), context.organizationId, property.id, threadId,
        String(input.externalMessageId || crypto.randomUUID()).slice(0, 160),
        String(input.sender || "Guest / external sender").slice(0, 180),
        property.name, body, String(input.receivedAt || now), context.email, now),
    db().prepare(`INSERT INTO communication_status_history
      (id,organization_id,property_id,thread_id,from_status,to_status,reason,changed_by,changed_at)
      VALUES (?,?,?,?,NULL,?,?,?,?)`).bind(crypto.randomUUID(), context.organizationId, property.id,
        threadId, status, classification.reason, context.email, now),
    db().prepare(`INSERT INTO communication_governance_profiles
      (id,organization_id,property_id,thread_id,universal_conversation_id,participant_reference,
       guest_reference,reservation_reference,consent_status,consent_source,quiet_hours_timezone,
       quiet_hours_start,quiet_hours_end,retention_policy_key,sla_due_at,assigned_user,tags_json,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),context.organizationId,
        property.id,threadId,universalConversationId({organizationId:context.organizationId,
          propertyId:property.id,sourceKey,sourceThreadId:externalThreadId}),
        String(input.sender||"Guest / external sender").slice(0,180),
        String(input.guestReference||"").slice(0,180)||null,
        String(input.reservationReference||input.guestReference||"").slice(0,180)||null,
        String(input.consentStatus||"UNKNOWN").slice(0,30),String(input.consentSource||"MANUAL_INTAKE").slice(0,80),
        String(input.timezone||"America/Chicago").slice(0,80),21,8,"COMMUNICATION_STANDARD",
        new Date(Date.now()+(classification.priority==="CRITICAL"?15:classification.priority==="HIGH"?60:240)*60000).toISOString(),
        null,JSON.stringify([]),now,now),
  ]);
  await recordSystemAudit({ organizationId: context.organizationId, propertyId: property.id,
    eventType: "COMMUNICATION_RECEIVED", entityType: "COMMUNICATION_THREAD", entityId: threadId,
    authorType: "USER", authorId: context.email, correlationId,
    delta: { sourceKey, status, category: classification.category, priority: classification.priority },
    metadata: { confidence: classification.confidence, approvalStatus } });
  return { id: threadId, correlationId, status, classification };
}

export async function createReplyDraft(userEmail: string, input: Record<string, unknown>) {
  const context = await activeStaffContext(userEmail);
  if (!context) return null;
  await ensureCommunicationCenter();
  const property = await activeProperty(context);
  if (!property) return null;
  const threadId = String(input.threadId || "");
  const thread = await db().prepare(`SELECT * FROM communication_threads
    WHERE id=? AND organization_id=? AND property_id=?`).bind(threadId,
      context.organizationId, property.id).first<Record<string, any>>();
  if (!thread) throw new Error("The communication thread is unavailable in this property.");
  const body = String(input.body || "").trim().slice(0, 8000);
  if (!body) throw new Error("A reply draft is required.");
  const risk = classifyReplyRisk(body);
  const now = new Date().toISOString(), id = crypto.randomUUID();
  await db().batch([
    db().prepare(`INSERT INTO communication_reply_drafts
      (id,organization_id,property_id,thread_id,body,status,risk_level,confidence,model_or_rule,
       evidence_json,approved_by,approved_at,external_delivery_id,delivery_status,created_by,created_at,updated_at)
       VALUES (?,?,?,?,?,'AWAITING_APPROVAL',?,100,'USER_AUTHORED',?,NULL,NULL,NULL,'NOT_SENT',?,?,?)`)
      .bind(id, context.organizationId, property.id, threadId, body,
        risk.riskLevel,JSON.stringify([{ source: "COMMUNICATION_THREAD", id: threadId },
          { source: "RISK_POLICY", categories: risk.categories }]), context.email, now, now),
    db().prepare(`UPDATE communication_threads SET approval_status='AWAITING_APPROVAL',updated_at=?
      WHERE id=? AND organization_id=? AND property_id=?`).bind(now, threadId,
        context.organizationId, property.id),
  ]);
  await recordSystemAudit({ organizationId: context.organizationId, propertyId: property.id,
    eventType: "COMMUNICATION_REPLY_DRAFTED", entityType: "COMMUNICATION_REPLY_DRAFT", entityId: id,
    authorType: "USER", authorId: context.email, correlationId: thread.correlation_id,
    delta: { status: "AWAITING_APPROVAL", threadId, riskLevel:risk.riskLevel },
    metadata:{ riskCategories:risk.categories } });
  return { id, status: "AWAITING_APPROVAL", risk };
}

export async function runMasterInboxLifecycleCertification(userEmail:string){
  const context=await activeStaffContext(userEmail);
  if(!context||context.role!=="admin")return null;
  await ensureCommunicationCenter();const property=await activeProperty(context);if(!property)return null;
  const result=await runMasterInboxCertification(),id=crypto.randomUUID(),now=new Date().toISOString();
  await db().prepare(`INSERT INTO communication_certification_runs
    (id,organization_id,property_id,status,provider_mode,total_cases,passed_cases,production_enabled,
     real_message_sent,evidence_json,executed_by,executed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id,context.organizationId,property.id,result.status,result.providerMode,result.totalCases,
      result.passedCases,0,0,JSON.stringify(result.cases),context.email,now).run();
  await recordSystemAudit({organizationId:context.organizationId,propertyId:property.id,
    eventType:"MASTER_INBOX_LIFECYCLE_CERTIFIED",entityType:"COMMUNICATION_CERTIFICATION",entityId:id,
    authorType:"USER",authorId:context.email,correlationId:crypto.randomUUID(),
    delta:{status:result.status,totalCases:result.totalCases,passedCases:result.passedCases},
    metadata:{providerMode:result.providerMode,productionEnabled:false,realMessageSent:false}});
  return{id,...result};
}

export async function approveReplyDraft(userEmail: string, draftId: string) {
  const context = await activeStaffContext(userEmail);
  if (!context || context.role !== "admin") return null;
  await ensureCommunicationCenter();
  const property = await activeProperty(context);
  if (!property) return null;
  const draft = await db().prepare(`SELECT d.*,t.correlation_id FROM communication_reply_drafts d
    JOIN communication_threads t ON t.id=d.thread_id WHERE d.id=? AND d.organization_id=?
    AND d.property_id=? AND d.status='AWAITING_APPROVAL'`).bind(draftId,
      context.organizationId, property.id).first<Record<string, any>>();
  if (!draft) return null;
  const now = new Date().toISOString();
  await db().batch([
    db().prepare(`UPDATE communication_reply_drafts SET status='APPROVED_MANUAL_SEND',
      approved_by=?,approved_at=?,delivery_status='MANUAL_FALLBACK',updated_at=?
      WHERE id=? AND organization_id=? AND property_id=?`).bind(context.email, now, now,
        draftId, context.organizationId, property.id),
    db().prepare(`UPDATE communication_threads SET approval_status='APPROVED',
      status='PENDING_MANUAL_SEND',updated_at=? WHERE id=? AND organization_id=? AND property_id=?`)
      .bind(now, draft.thread_id, context.organizationId, property.id),
  ]);
  await recordSystemAudit({ organizationId: context.organizationId, propertyId: property.id,
    eventType: "COMMUNICATION_REPLY_APPROVED", entityType: "COMMUNICATION_REPLY_DRAFT", entityId: draftId,
    authorType: "USER", authorId: context.email, correlationId: draft.correlation_id,
    delta: { status: "APPROVED_MANUAL_SEND", deliveryStatus: "MANUAL_FALLBACK" },
    metadata: { reason: "No external delivery connector is active; approved text remains ready for manual delivery." } });
  return { id: draftId, status: "APPROVED_MANUAL_SEND",
    manualFallback: "Approved. No external message was sent. Copy the approved response into the source channel." };
}

function extractEmail(value: string) {
  return value.match(/<([^>]+)>/)?.[1] ?? value.trim();
}

export async function sendApprovedReply(userEmail: string, input: Record<string, unknown>) {
  const context = await activeStaffContext(userEmail);
  if (!context || context.role !== "admin") return null;
  await ensureCommunicationCenter();
  const property = await activeProperty(context);
  if (!property) return null;
  const draftId = String(input.id || "");
  const draft = await db().prepare(`SELECT d.*,t.correlation_id,t.source_key,t.source_account,
      t.external_thread_id,t.subject,m.sender_label FROM communication_reply_drafts d
      JOIN communication_threads t ON t.id=d.thread_id
      LEFT JOIN communication_messages m ON m.id=(SELECT id FROM communication_messages
        WHERE thread_id=t.id AND direction='INBOUND' ORDER BY received_at DESC LIMIT 1)
      WHERE d.id=? AND d.organization_id=? AND d.property_id=?`)
    .bind(draftId, context.organizationId, property.id).first<Record<string, any>>();
  if (!draft) return null;
  if (!["AWAITING_APPROVAL", "APPROVED_MANUAL_SEND"].includes(draft.status)) {
    throw new Error("This reply is no longer awaiting delivery.");
  }
  const requestedSourceKey = String(input.sourceKey || draft.source_key).toUpperCase();
  const requestedSourceAccount = String(input.sourceAccount || draft.source_account);
  const overrideReason = String(input.overrideReason || "").trim().slice(0, 500);
  if ((requestedSourceKey !== draft.source_key || requestedSourceAccount !== draft.source_account) && !overrideReason) {
    throw new Error("A reason is required when replying from a different source.");
  }
  const attemptId = crypto.randomUUID(), now = new Date().toISOString();
  let status = "MANUAL_FALLBACK", externalDeliveryId: string | null = null, errorMessage: string | null = null;
  try {
    if (requestedSourceKey === "GMAIL") {
      const accounts = await listGoogleConnections(userEmail);
      const account = accounts.find(item => item.account_email.toLowerCase() === requestedSourceAccount.toLowerCase());
      if (!account) throw new Error("The original Gmail account is not connected for this user.");
      if (!account.scopes.includes("gmail.send")) {
        throw new Error("Reconnect this Gmail account once to approve send permission.");
      }
      const sent = await sendGmailMessage({
        refreshToken: await decryptSecret(account.encrypted_refresh_token),
        to: extractEmail(String(draft.sender_label || "")),
        subject: draft.subject,
        body: draft.body,
        threadId: draft.external_thread_id,
      });
      status = "SENT"; externalDeliveryId = sent.externalDeliveryId;
    } else {
      throw new Error(`${requestedSourceKey} outbound delivery is not configured. The approved reply is preserved for manual delivery.`);
    }
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Delivery failed.";
  }
  await db().batch([
    db().prepare(`INSERT INTO communication_delivery_attempts
      (id,organization_id,property_id,thread_id,draft_id,requested_source_key,
       requested_source_account,original_source_key,original_source_account,override_reason,
       status,external_delivery_id,error_message,attempted_by,attempted_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(attemptId, context.organizationId, property.id,
        draft.thread_id, draftId, requestedSourceKey, requestedSourceAccount, draft.source_key,
        draft.source_account, overrideReason || null, status, externalDeliveryId, errorMessage,
        context.email, now),
    db().prepare(`UPDATE communication_reply_drafts SET status=?,approved_by=?,approved_at=?,
      external_delivery_id=?,delivery_status=?,updated_at=? WHERE id=?`)
      .bind(status === "SENT" ? "SENT" : "APPROVED_MANUAL_SEND", context.email, now,
        externalDeliveryId, status, now, draftId),
    db().prepare(`UPDATE communication_threads SET status=?,approval_status='APPROVED',
      updated_at=? WHERE id=?`).bind(status === "SENT" ? "RESPONDED" : "PENDING_MANUAL_SEND",
        now, draft.thread_id),
    ...(status === "SENT" ? [db().prepare(`INSERT INTO communication_messages
      (id,organization_id,property_id,thread_id,external_message_id,direction,sender_label,
       recipient_label,body,attachment_count,sensitivity,received_at,created_by,created_at)
       VALUES (?,?,?,?,?,'OUTBOUND',?,?,?,0,'INTERNAL',?,?,?)`).bind(crypto.randomUUID(),
        context.organizationId, property.id, draft.thread_id, externalDeliveryId,
        requestedSourceAccount, String(draft.sender_label || "Recipient"), draft.body, now,
        context.email, now)] : []),
  ]);
  await recordSystemAudit({ organizationId: context.organizationId, propertyId: property.id,
    eventType: status === "SENT" ? "COMMUNICATION_REPLY_SENT" : "COMMUNICATION_REPLY_FALLBACK",
    entityType: "COMMUNICATION_DELIVERY", entityId: attemptId, authorType: "USER",
    authorId: context.email, correlationId: draft.correlation_id,
    delta: { status, requestedSourceKey, requestedSourceAccount },
    metadata: { originalSourceKey: draft.source_key, overrideReason: overrideReason || null, errorMessage } });
  return { id: attemptId, status, externalDeliveryId, manualFallback: errorMessage };
}
