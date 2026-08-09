import { env } from "cloudflare:workers";
import { activeStaffContext } from "./staff";
import { enterpriseOperations } from "./enterprise-operations";
import { recordSystemAudit } from "./platform-controls";
import { runDocumentCustodyCertification } from "../lib/document-custody-certification.mjs";

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "text/plain",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
const MAX_BYTES = 25 * 1024 * 1024;
const DOCUMENT_TYPES = [
  "REGISTRATION_CARD", "PET_FORM", "TAX_EXEMPTION", "INCIDENT_EVIDENCE",
  "VENDOR_INVOICE", "WARRANTY", "MAINTENANCE_RECORD", "POLICY", "OTHER",
];

function database(): D1Database {
  if (!env.DB) throw new Error("AAIQ Document Vault storage is unavailable.");
  return env.DB;
}

export async function ensureDocumentVault() {
  database();
}

async function scope(userEmail: string) {
  await ensureDocumentVault();
  const context = await activeStaffContext(userEmail);
  const operations = await enterpriseOperations(userEmail);
  if (!context || !operations?.activeProperty) return null;
  return { context, property: operations.activeProperty };
}

async function sha256(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "document";
}

export async function documentVaultCenter(userEmail: string, query = "") {
  const scoped = await scope(userEmail);
  if (!scoped) return null;
  const { context, property } = scoped;
  const term = `%${query.trim().slice(0, 80)}%`;
  const [records, holds, policies, jobs, access, custodyRuns] = await Promise.all([
    database().prepare(`SELECT r.*,b.file_name,b.content_type,b.size_bytes,b.sha256,b.scan_status,b.scan_provider,b.scanned_at
      FROM document_records r LEFT JOIN document_versions v ON v.id=r.current_version_id
      LEFT JOIN document_blobs b ON b.id=v.blob_id
      WHERE r.organization_id=? AND r.property_id=? AND (?='%%' OR r.title LIKE ? OR r.document_type LIKE ? OR r.department LIKE ?)
      ORDER BY r.updated_at DESC LIMIT 100`)
      .bind(context.organizationId, property.id, term, term, term, term).all<any>(),
    database().prepare("SELECT * FROM document_legal_holds WHERE organization_id=? AND property_id=? ORDER BY placed_at DESC LIMIT 50")
      .bind(context.organizationId, property.id).all<any>(),
    database().prepare("SELECT * FROM document_retention_policies WHERE organization_id=? AND (property_id=? OR property_id IS NULL) ORDER BY document_type,name")
      .bind(context.organizationId, property.id).all<any>(),
    database().prepare("SELECT * FROM document_jobs WHERE organization_id=? AND property_id=? AND status NOT IN ('SUCCEEDED','CANCELLED') ORDER BY created_at DESC LIMIT 50")
      .bind(context.organizationId, property.id).all<any>(),
    database().prepare("SELECT * FROM document_access_events WHERE organization_id=? AND property_id=? ORDER BY created_at DESC LIMIT 100")
      .bind(context.organizationId, property.id).all<any>(),
    database().prepare("SELECT * FROM document_custody_certification_runs WHERE organization_id=? AND property_id=? ORDER BY executed_at DESC LIMIT 10")
      .bind(context.organizationId, property.id).all<any>(),
  ]);
  return {
    role: context.role,
    property,
    documentTypes: DOCUMENT_TYPES,
    records: records.results,
    holds: holds.results,
    policies: policies.results,
    jobs: jobs.results,
    access: access.results,
    custodyRuns: custodyRuns.results,
    providers: {
      malware: { status: "CONFIGURATION_REQUIRED", rule: "Files remain quarantined until an authorized scanner reports CLEAN." },
      ocr: { status: "CONFIGURATION_REQUIRED", rule: "No text or classification is invented while OCR is unavailable." },
      signature: { status: "CONFIGURATION_REQUIRED", rule: "Signature evidence requires a configured provider envelope." },
    },
  };
}

export async function ingestDocument(userEmail: string, file: File, input: Record<string, string>) {
  const scoped = await scope(userEmail);
  if (!scoped) return null;
  const { context, property } = scoped;
  if (!ALLOWED_TYPES.has(file.type)) throw new Error("This file type is not permitted.");
  if (file.size < 1 || file.size > MAX_BYTES) throw new Error("Documents must be between 1 byte and 25 MB.");
  const hash = await sha256(file);
  const duplicate = await database().prepare("SELECT document_id FROM document_blobs WHERE organization_id=? AND property_id=? AND sha256=?")
    .bind(context.organizationId, property.id, hash).first<any>();
  if (duplicate) throw new Error(`An exact original already exists in this property (${duplicate.document_id}).`);
  const documentId = crypto.randomUUID(), blobId = crypto.randomUUID(), versionId = crypto.randomUUID();
  const correlationId = crypto.randomUUID(), now = new Date().toISOString();
  const objectKey = `document-vault/${context.organizationId}/${property.id}/${documentId}/${hash}-${safeName(file.name)}`;
  if (!env.MEDIA) throw new Error("Secure object storage is unavailable.");
  await env.MEDIA.put(objectKey, file.stream(), {
    httpMetadata: { contentType: file.type, contentDisposition: `attachment; filename="${safeName(file.name)}"` },
    customMetadata: { organizationId: context.organizationId, propertyId: property.id, documentId, sha256: hash, immutableOriginal: "true" },
  });
  try {
    await database().batch([
      database().prepare(`INSERT INTO document_records(id,organization_id,property_id,correlation_id,title,document_type,status,source_type,source_record_type,source_record_id,department,guest_reference,room_reference,current_version_id,sensitivity,created_by,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
        documentId, context.organizationId, property.id, correlationId,
        String(input.title || file.name).slice(0, 180), DOCUMENT_TYPES.includes(input.documentType) ? input.documentType : "OTHER",
        "QUARANTINED_PENDING_SCAN", "STAFF_UPLOAD", input.sourceRecordType || null, input.sourceRecordId || null,
        input.department || null, input.guestReference || null, input.roomReference || null, versionId,
        input.sensitivity || "INTERNAL", context.email, now, now),
      database().prepare(`INSERT INTO document_blobs(id,organization_id,property_id,document_id,object_key,file_name,content_type,size_bytes,sha256,storage_status,scan_status,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(blobId, context.organizationId, property.id, documentId, objectKey, file.name, file.type, file.size, hash, "STORED", "PENDING", now),
      database().prepare(`INSERT INTO document_versions(id,organization_id,property_id,document_id,version_number,blob_id,change_reason,is_original,created_by,created_at)
        VALUES(?,?,?,?,1,?,'ORIGINAL_INGESTION',1,?,?)`).bind(versionId, context.organizationId, property.id, documentId, blobId, context.email, now),
      database().prepare(`INSERT INTO document_jobs(id,organization_id,property_id,document_id,job_type,status,provider,created_at,updated_at)
        VALUES(?,?,?,?,?,'CONFIGURATION_REQUIRED',NULL,?,?)`).bind(crypto.randomUUID(), context.organizationId, property.id, documentId, "MALWARE_SCAN", now, now),
      database().prepare(`INSERT INTO document_jobs(id,organization_id,property_id,document_id,job_type,status,provider,created_at,updated_at)
        VALUES(?,?,?,?,?,'BLOCKED_BY_SCAN',NULL,?,?)`).bind(crypto.randomUUID(), context.organizationId, property.id, documentId, "OCR_AND_CLASSIFICATION", now, now),
    ]);
  } catch (error) {
    await env.MEDIA.delete(objectKey);
    throw error;
  }
  await recordSystemAudit({
    organizationId: context.organizationId, propertyId: property.id, eventType: "document.ingested",
    entityType: "DOCUMENT", entityId: documentId, authorType: "USER", authorId: context.email, correlationId,
    delta: { status: "QUARANTINED_PENDING_SCAN", sha256: hash, sizeBytes: file.size, documentType: input.documentType || "OTHER" },
    metadata: { immutableOriginal: true, malwareScanRequired: true },
  });
  return { id: documentId, status: "QUARANTINED_PENDING_SCAN", sha256: hash, duplicate: false };
}

export async function recordScanDecision(userEmail: string, documentId: string, decision: string, providerReference: string) {
  const scoped = await scope(userEmail);
  if (!scoped || scoped.context.role !== "admin") return null;
  const { context, property } = scoped;
  if (!["CLEAN", "INFECTED"].includes(decision)) throw new Error("Choose CLEAN or INFECTED.");
  if (!providerReference.trim()) throw new Error("Enter the scanner/provider evidence reference.");
  const record = await database().prepare(`SELECT r.id,r.correlation_id,b.id blob_id FROM document_records r
    JOIN document_versions v ON v.id=r.current_version_id JOIN document_blobs b ON b.id=v.blob_id
    WHERE r.id=? AND r.organization_id=? AND r.property_id=?`).bind(documentId, context.organizationId, property.id).first<any>();
  if (!record) throw new Error("Document not found.");
  const now = new Date().toISOString(), status = decision === "CLEAN" ? "NEEDS_CLASSIFICATION_REVIEW" : "QUARANTINED_INFECTED";
  await database().batch([
    database().prepare("UPDATE document_blobs SET scan_status=?,scan_provider='EXTERNAL_EVIDENCE',scan_reference=?,scanned_by=?,scanned_at=? WHERE id=?")
      .bind(decision, providerReference.slice(0, 240), context.email, now, record.blob_id),
    database().prepare("UPDATE document_records SET status=?,updated_at=? WHERE id=?").bind(status, now, documentId),
    database().prepare("UPDATE document_jobs SET status=?,provider='EXTERNAL_EVIDENCE',updated_at=? WHERE document_id=? AND job_type='MALWARE_SCAN'")
      .bind(decision === "CLEAN" ? "SUCCEEDED" : "FAILED", now, documentId),
    database().prepare("UPDATE document_jobs SET status=?,updated_at=? WHERE document_id=? AND job_type='OCR_AND_CLASSIFICATION'")
      .bind(decision === "CLEAN" ? "CONFIGURATION_REQUIRED" : "CANCELLED", now, documentId),
  ]);
  await recordSystemAudit({ organizationId: context.organizationId, propertyId: property.id, eventType: "document.scan.recorded", entityType: "DOCUMENT", entityId: documentId, authorType: "USER", authorId: context.email, correlationId: record.correlation_id, delta: { decision, status }, metadata: { providerReference } });
  return { id: documentId, status };
}

export async function reviewClassification(userEmail: string, documentId: string, documentType: string, title: string, evidence: string) {
  const scoped = await scope(userEmail);
  if (!scoped || scoped.context.role !== "admin") return null;
  const { context, property } = scoped;
  if (!DOCUMENT_TYPES.includes(documentType)) throw new Error("Choose an approved document type.");
  const record = await database().prepare(`SELECT r.*,b.scan_status FROM document_records r JOIN document_versions v ON v.id=r.current_version_id
    JOIN document_blobs b ON b.id=v.blob_id WHERE r.id=? AND r.organization_id=? AND r.property_id=?`)
    .bind(documentId, context.organizationId, property.id).first<any>();
  if (!record) throw new Error("Document not found.");
  if (record.scan_status !== "CLEAN") throw new Error("Classification cannot be approved until the original passes malware scanning.");
  const now = new Date().toISOString(), decisionId = crypto.randomUUID();
  await database().batch([
    database().prepare("UPDATE document_records SET title=?,document_type=?,status='ACTIVE',classification_confidence=1,classification_evidence=?,updated_at=? WHERE id=?")
      .bind(title.slice(0, 180), documentType, evidence.slice(0, 500), now, documentId),
    database().prepare(`INSERT INTO document_ai_decisions(id,organization_id,property_id,document_id,decision_type,model_or_rule_version,structured_output_json,confidence,evidence_json,risk_class,approval_status,reviewer,reviewed_at,created_at)
      VALUES(?,?,?,?,?,'HUMAN_CLASSIFICATION_V1',?,1,?,'LOW','APPROVED',?,?,?)`)
      .bind(decisionId, context.organizationId, property.id, documentId, "CLASSIFICATION", JSON.stringify({ documentType, title }), JSON.stringify({ evidence, humanAuthored: true }), context.email, now, now),
  ]);
  await recordSystemAudit({ organizationId: context.organizationId, propertyId: property.id, eventType: "document.classification.approved", entityType: "DOCUMENT", entityId: documentId, authorType: "USER", authorId: context.email, correlationId: record.correlation_id, delta: { documentType, title, status: "ACTIVE" } });
  return { id: documentId, status: "ACTIVE" };
}

export async function createRetentionPolicy(userEmail: string, input: any) {
  const scoped = await scope(userEmail);
  if (!scoped || scoped.context.role !== "admin") return null;
  const { context, property } = scoped;
  const days = Number(input.retainDays);
  if (!DOCUMENT_TYPES.includes(String(input.documentType)) || !Number.isInteger(days) || days < 1 || days > 36500) throw new Error("Choose a valid document type and retention period.");
  const id = crypto.randomUUID(), now = new Date().toISOString();
  const existing = await database().prepare("SELECT MAX(version) version FROM document_retention_policies WHERE organization_id=? AND property_id=? AND policy_code=?")
    .bind(context.organizationId, property.id, String(input.policyCode).slice(0, 60)).first<any>();
  await database().prepare(`INSERT INTO document_retention_policies(id,organization_id,property_id,policy_code,name,document_type,jurisdiction,retain_days,trigger_event,version,status,effective_from,created_by,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, context.organizationId, property.id, String(input.policyCode).slice(0, 60), String(input.name).slice(0, 140), input.documentType, String(input.jurisdiction).slice(0, 80), days, String(input.triggerEvent || "DOCUMENT_CREATED").slice(0, 80), Number(existing?.version || 0) + 1, "ACTIVE", now, context.email, now).run();
  await recordSystemAudit({ organizationId: context.organizationId, propertyId: property.id, eventType: "document.retention.policy.created", entityType: "RETENTION_POLICY", entityId: id, authorType: "USER", authorId: context.email, correlationId: id, delta: { documentType: input.documentType, retainDays: days, jurisdiction: input.jurisdiction } });
  return { id, status: "ACTIVE" };
}

export async function assignRetention(userEmail: string, documentId: string, policyId: string) {
  const scoped = await scope(userEmail);
  if (!scoped || scoped.context.role !== "admin") return null;
  const { context, property } = scoped;
  const [record, policy] = await Promise.all([
    database().prepare("SELECT * FROM document_records WHERE id=? AND organization_id=? AND property_id=?").bind(documentId, context.organizationId, property.id).first<any>(),
    database().prepare("SELECT * FROM document_retention_policies WHERE id=? AND organization_id=? AND (property_id=? OR property_id IS NULL)").bind(policyId, context.organizationId, property.id).first<any>(),
  ]);
  if (!record || !policy) throw new Error("Document or retention policy was not found.");
  const base = new Date(record.created_at), until = new Date(base.getTime() + Number(policy.retain_days) * 86400000).toISOString();
  await database().prepare("UPDATE document_records SET retention_policy_id=?,retention_until=?,updated_at=? WHERE id=?").bind(policyId, until, new Date().toISOString(), documentId).run();
  await recordSystemAudit({ organizationId: context.organizationId, propertyId: property.id, eventType: "document.retention.assigned", entityType: "DOCUMENT", entityId: documentId, authorType: "USER", authorId: context.email, correlationId: record.correlation_id, delta: { policyId, retentionUntil: until } });
  return { id: documentId, retentionUntil: until };
}

export async function placeLegalHold(userEmail: string, documentId: string, holdName: string, reason: string) {
  const scoped = await scope(userEmail);
  if (!scoped || scoped.context.role !== "admin") return null;
  const { context, property } = scoped;
  if (holdName.trim().length < 3 || reason.trim().length < 10) throw new Error("Provide a hold name and a specific reason.");
  const record = await database().prepare("SELECT * FROM document_records WHERE id=? AND organization_id=? AND property_id=?").bind(documentId, context.organizationId, property.id).first<any>();
  if (!record) throw new Error("Document not found.");
  const id = crypto.randomUUID(), now = new Date().toISOString();
  await database().batch([
    database().prepare("INSERT INTO document_legal_holds(id,organization_id,property_id,document_id,hold_name,reason,status,placed_by,placed_at) VALUES(?,?,?,?,?,?,'ACTIVE',?,?)")
      .bind(id, context.organizationId, property.id, documentId, holdName.slice(0, 140), reason.slice(0, 800), context.email, now),
    database().prepare("UPDATE document_records SET legal_hold_count=legal_hold_count+1,updated_at=? WHERE id=?").bind(now, documentId),
  ]);
  await recordSystemAudit({ organizationId: context.organizationId, propertyId: property.id, eventType: "document.legal_hold.placed", entityType: "DOCUMENT", entityId: documentId, authorType: "USER", authorId: context.email, correlationId: record.correlation_id, delta: { holdId: id, holdName } });
  return { id, status: "ACTIVE" };
}

export async function releaseLegalHold(userEmail: string, holdId: string, reason: string) {
  const scoped = await scope(userEmail);
  if (!scoped || scoped.context.role !== "admin") return null;
  const { context, property } = scoped;
  if (reason.trim().length < 10) throw new Error("Provide a specific release reason.");
  const hold = await database().prepare("SELECT * FROM document_legal_holds WHERE id=? AND organization_id=? AND property_id=? AND status='ACTIVE'")
    .bind(holdId, context.organizationId, property.id).first<any>();
  if (!hold) throw new Error("Active hold not found.");
  const now = new Date().toISOString();
  await database().batch([
    database().prepare("UPDATE document_legal_holds SET status='RELEASED',released_by=?,released_at=?,release_reason=? WHERE id=?")
      .bind(context.email, now, reason.slice(0, 800), holdId),
    database().prepare("UPDATE document_records SET legal_hold_count=MAX(0,legal_hold_count-1),updated_at=? WHERE id=?").bind(now, hold.document_id),
  ]);
  await recordSystemAudit({ organizationId: context.organizationId, propertyId: property.id, eventType: "document.legal_hold.released", entityType: "DOCUMENT", entityId: hold.document_id, authorType: "USER", authorId: context.email, correlationId: hold.document_id, delta: { holdId, reason } });
  return { id: holdId, status: "RELEASED" };
}

export async function downloadableDocument(userEmail: string, documentId: string, reason: string) {
  const scoped = await scope(userEmail);
  if (!scoped) return null;
  const { context, property } = scoped;
  const row = await database().prepare(`SELECT r.id,r.status,b.* FROM document_records r JOIN document_versions v ON v.id=r.current_version_id
    JOIN document_blobs b ON b.id=v.blob_id WHERE r.id=? AND r.organization_id=? AND r.property_id=?`)
    .bind(documentId, context.organizationId, property.id).first<any>();
  if (!row) return null;
  if (row.scan_status !== "CLEAN" || row.status === "QUARANTINED_INFECTED") throw new Error("This original remains quarantined and cannot be downloaded.");
  const object = await env.MEDIA?.get(row.object_key);
  if (!object) throw new Error("Stored original is unavailable.");
  const now = new Date().toISOString();
  await database().prepare("INSERT INTO document_access_events(id,organization_id,property_id,document_id,action,actor,reason,created_at) VALUES(?,?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), context.organizationId, property.id, documentId, "DOWNLOAD_ORIGINAL", context.email, reason.slice(0, 240) || "Authorized user download", now).run();
  await recordSystemAudit({ organizationId: context.organizationId, propertyId: property.id, eventType: "document.downloaded", entityType: "DOCUMENT", entityId: documentId, authorType: "USER", authorId: context.email, correlationId: documentId, delta: { action: "DOWNLOAD_ORIGINAL" } });
  return { body: object.body, fileName: row.file_name, contentType: row.content_type, sha256: row.sha256 };
}

export async function runDocumentCustodyDrill(userEmail:string){
  const scoped=await scope(userEmail);if(!scoped||scoped.context.role!=="admin")return null;
  const{context,property}=scoped,result=await runDocumentCustodyCertification(),id=crypto.randomUUID(),now=new Date().toISOString();
  const envelope=result.envelope;
  await database().batch([
    database().prepare(`INSERT INTO document_signature_envelopes
      (id,organization_id,property_id,document_id,provider_mode,status,original_artifact_reference,
       signed_artifact_reference,completion_certificate_reference,signer_authentication_json,timestamps_json,
       custody_chain_json,created_by,created_at,completed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(),context.organizationId,property.id,result.documentId,envelope.providerMode,
        envelope.status,envelope.originalArtifact,envelope.signedArtifact,envelope.completionCertificate,
        JSON.stringify(envelope.signerAuthentication),JSON.stringify(envelope.timestamps),
        JSON.stringify(envelope.custodyChain),context.email,now,envelope.timestamps.completedAt),
    database().prepare(`INSERT INTO document_destruction_requests
      (id,organization_id,property_id,document_id,status,requested_by,requested_at,approved_by,approved_at,
       reason,legal_hold_checked,certificate_reference) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(),context.organizationId,property.id,result.documentId,"AUTHORIZED_SIMULATED",
        "uat-admin-a@aaiq.internal",now,"uat-admin-b@aaiq.internal",now,"Two-person UAT custody drill",1,
        `vault://${result.documentId}/disposition-certificate`),
    database().prepare(`INSERT INTO document_retention_overrides
      (id,organization_id,property_id,document_id,policy_retention_until,override_retention_until,reason,
       authorized_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),context.organizationId,
        property.id,result.documentId,"2033-08-01","2034-08-01",
        "Authorized UAT litigation preservation extension",context.email,now),
    database().prepare(`INSERT INTO document_custody_certification_runs
      (id,organization_id,property_id,status,provider_mode,document_reference,ledger_json,terminal_hash,
       negative_controls_json,production_enabled,real_document_destroyed,real_signature_sent,executed_by,executed_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,context.organizationId,property.id,result.status,
        result.providerMode,result.documentId,JSON.stringify(result.ledger),result.ledger.terminalHash,
        JSON.stringify(result.negativeControls),0,0,0,context.email,now)
  ]);
  await recordSystemAudit({organizationId:context.organizationId,propertyId:property.id,
    eventType:"document.custody.drill.verified",entityType:"DOCUMENT_CUSTODY_CERTIFICATION",entityId:id,
    authorType:"USER",authorId:context.email,correlationId:crypto.randomUUID(),
    delta:{status:result.status,eventCount:result.ledger.events.length,terminalHash:result.ledger.terminalHash},
    metadata:{providerMode:result.providerMode,productionEnabled:false,realDocumentDestroyed:false,realSignatureSent:false}});
  return{id,...result};
}
