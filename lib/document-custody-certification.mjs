const enc=new TextEncoder();
async function digest(value){const bytes=await crypto.subtle.digest("SHA-256",enc.encode(value));return[...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,"0")).join("");}
export function requestDestruction({requestedBy,approvedBy=null,legalHold=false}){if(legalHold)return{allowed:false,outcome:"LEGAL_HOLD_BLOCKED"};if(!approvedBy)return{allowed:false,outcome:"SECOND_APPROVER_REQUIRED"};if(requestedBy===approvedBy)return{allowed:false,outcome:"SEPARATION_OF_DUTIES_BLOCKED"};return{allowed:true,outcome:"DESTRUCTION_AUTHORIZED",certificateRequired:true};}
export function retentionOverride({policyUntil,overrideUntil,reason,authorized}){if(!authorized)return{allowed:false,outcome:"AUTHORIZATION_REQUIRED"};if(!String(reason||"").trim())return{allowed:false,outcome:"REASON_REQUIRED"};return{allowed:true,outcome:"RETENTION_OVERRIDE_RECORDED",policyUntil,overrideUntil,reason:String(reason).trim(),distinctAuditEvent:true};}
export function simulatedSignatureEnvelope(documentId){return{providerMode:"SIMULATED_E_SIGNATURE",status:"COMPLETED_SIMULATED",originalArtifact:`vault://${documentId}/original`,signedArtifact:`vault://${documentId}/signed`,completionCertificate:`vault://${documentId}/certificate`,signerAuthentication:{method:"SIMULATED_EMAIL_OTP",subject:"uat-signer@aaiq.internal"},timestamps:{createdAt:"2026-08-01T00:00:00.000Z",signedAt:"2026-08-01T00:05:00.000Z",completedAt:"2026-08-01T00:05:01.000Z"},custodyChain:["ORIGINAL_HASH_VERIFIED","ENVELOPE_CREATED","SIGNER_AUTHENTICATED","SIGNED_ARTIFACT_HASHED","CERTIFICATE_STORED"]};}
export async function runDocumentCustodyCertification(){
 const documentId="SIMULATED-UAT-DOCUMENT",events=[];let previousHash="GENESIS";
 const add=async(action,evidence={})=>{const at=`2026-08-01T00:${String(events.length).padStart(2,"0")}:00.000Z`,hash=await digest(JSON.stringify({documentId,action,evidence,at,previousHash}));events.push({sequence:events.length+1,action,evidence,at,previousHash,hash});previousHash=hash;};
 await add("INTAKE",{originalHash:await digest("AAIQ simulated exact original")});
 await add("QUARANTINED",{downloadBlocked:true});await add("SCAN_CLEAN",{providerMode:"CONTRACT_MOCK",receipt:"scan-receipt-1"});
 await add("CLASSIFICATION_APPROVED",{documentType:"REGISTRATION_CARD",humanReviewed:true});
 await add("RETENTION_ASSIGNED",{jurisdiction:"KANSAS_UAT_DRAFT",retainDays:2555});
 const envelope=simulatedSignatureEnvelope(documentId);await add("E_SIGNATURE_COMPLETED_SIMULATED",envelope);
 await add("LEGAL_HOLD_PLACED",{reason:"UAT preservation drill"});
 const holdBlocked=requestDestruction({requestedBy:"admin-a",approvedBy:"admin-b",legalHold:true});await add("DESTRUCTION_BLOCKED",holdBlocked);
 await add("LEGAL_HOLD_RELEASED",{authorizedBy:"admin-a",reason:"UAT preservation obligation ended"});
 const singleApprover=requestDestruction({requestedBy:"admin-a",approvedBy:"admin-a"});await add("DESTRUCTION_BLOCKED",singleApprover);
 const authorized=requestDestruction({requestedBy:"admin-a",approvedBy:"admin-b"});await add("DESTRUCTION_AUTHORIZED",authorized);
 const noReason=retentionOverride({policyUntil:"2033-08-01",overrideUntil:"2034-08-01",reason:"",authorized:true});await add("RETENTION_OVERRIDE_BLOCKED",noReason);
 const override=retentionOverride({policyUntil:"2033-08-01",overrideUntil:"2034-08-01",reason:"Authorized UAT litigation preservation extension",authorized:true});await add("RETENTION_OVERRIDE_RECORDED",override);
 await add("PRESERVATION_EXPORT_CREATED",{eventCount:events.length+1,format:"JSON",terminalHash:previousHash});
 return{status:"VERIFIED",providerMode:"SIMULATED_CUSTODY_PROVIDERS",productionEnabled:false,realDocumentDestroyed:false,realSignatureSent:false,documentId,envelope,negativeControls:{legalHoldBlocked:holdBlocked.outcome==="LEGAL_HOLD_BLOCKED",singleApproverBlocked:singleApprover.outcome==="SEPARATION_OF_DUTIES_BLOCKED",reasonlessOverrideBlocked:noReason.outcome==="REASON_REQUIRED"},authorizedControls:{twoPersonDestruction:authorized.allowed,reasonedOverride:override.allowed},ledger:{events,terminalHash:previousHash,exportable:true,tamperEvident:true}};
}
