import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { ensureStaffWorkspace } from "../../../../db/staff";
import { hasModuleAccess } from "../../../../db/access-management";
import { applyEvidenceHold, configureVideoProvider, createExpressCheckin, createIdentityVerificationCase, createInventoryObservation, createVideoAudit, decideInventoryObservation, decideVideoFinding, decideVideoProposal, recordEdgeHeartbeat, registerCamera, registerEdgeNode, runDevelopmentAnalysis, runSampleInventoryDemonstration, runVideoPilotCertificationForProperty, videoIntelligenceCenter } from "../../../../db/video-intelligence";

export async function GET(){
  const user=await getChatGPTUser();if(!user)return Response.json({error:"Sign in is required."},{status:401});
  if(!await hasModuleAccess(user.email,"AAIQ_VIDEO_INTELLIGENCE"))return Response.json({error:"Video Intelligence access is required."},{status:403});
  await ensureStaffWorkspace(user.email,user.displayName);const data=await videoIntelligenceCenter(user.email);
  return data?Response.json(data,{headers:{"cache-control":"private, no-store"}}):Response.json({error:"Property access is required."},{status:403});
}
export async function POST(request:Request){
  const user=await getChatGPTUser();if(!user)return Response.json({error:"Sign in is required."},{status:401});
  if(!await hasModuleAccess(user.email,"AAIQ_VIDEO_INTELLIGENCE"))return Response.json({error:"Video Intelligence access is required."},{status:403});
  await ensureStaffWorkspace(user.email,user.displayName);
  try{
    if((request.headers.get("content-type")||"").includes("multipart/form-data")){
      if(!env.MEDIA)return Response.json({error:"Secure evidence storage is unavailable."},{status:503});
      const form=await request.formData(),file=form.get("file");
      if(!(file instanceof File)||(!file.type.startsWith("video/")&&!file.type.startsWith("image/")))return Response.json({error:"Choose a supported video or image evidence file."},{status:415});
      const limit=file.type.startsWith("video/")?100*1024*1024:15*1024*1024;
      if(file.size>limit)return Response.json({error:file.type.startsWith("video/")?"Video uploads must be 100 MB or smaller.":"Image uploads must be 15 MB or smaller."},{status:413});
      const key=`video-intelligence/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
      await env.MEDIA.put(key,file.stream(),{httpMetadata:{contentType:file.type},customMetadata:{audioProcessing:"disabled",privacyReview:"required"}});
      const result=await createVideoAudit(user.email,{auditType:String(form.get("auditType")),zoneType:String(form.get("zoneType")),locationLabel:String(form.get("locationLabel")||"Unspecified location"),objectKey:key,file});
      if(!result){await env.MEDIA.delete(key);return Response.json({error:"Property access is required."},{status:403})}
      const auditType=String(form.get("auditType"));
      const analysis=["INVENTORY_COUNT","LIQUOR_INVENTORY"].includes(auditType)
        ?await runDevelopmentAnalysis(user.email,result.id):null;
      return Response.json({...result,analysis,automation:analysis
        ?"Private evidence was analyzed automatically; every count remains a human-review proposal."
        :"Evidence was queued for its governed purpose."},{status:202});
    }
    const body=await request.json() as any;
    const result=body.action==="RUN_DEVELOPMENT_ANALYSIS"?await runDevelopmentAnalysis(user.email,String(body.auditId))
      :body.action==="RUN_SAMPLE_INVENTORY_DEMO"?await runSampleInventoryDemonstration(user.email)
      :body.action==="REVIEW_FINDING"?await decideVideoFinding(user.email,String(body.findingId),String(body.decision),String(body.note||""))
      :body.action==="DECIDE_PROPOSAL"?await decideVideoProposal(user.email,String(body.proposalId),String(body.decision),String(body.note||""))
      :body.action==="REGISTER_CAMERA"?await registerCamera(user.email,body)
      :body.action==="REGISTER_EDGE_NODE"?await registerEdgeNode(user.email,body)
      :body.action==="EDGE_HEARTBEAT"?await recordEdgeHeartbeat(user.email,String(body.edgeNodeId))
      :body.action==="CREATE_INVENTORY_OBSERVATION"?await createInventoryObservation(user.email,body)
      :body.action==="DECIDE_INVENTORY_OBSERVATION"?await decideInventoryObservation(user.email,String(body.observationId),String(body.decision),String(body.note||""))
      :body.action==="CREATE_IDENTITY_VERIFICATION"?await createIdentityVerificationCase(user.email,{...body,consent:body.consent===true})
      :body.action==="APPLY_EVIDENCE_HOLD"?await applyEvidenceHold(user.email,String(body.evidenceId),body.hold===true,String(body.note||""))
      :body.action==="CONFIGURE_PROVIDER"?await configureVideoProvider(user.email,body)
      :body.action==="RUN_PILOT_CERTIFICATION"?await runVideoPilotCertificationForProperty(user.email)
      :body.action==="CREATE_EXPRESS_CHECKIN"?await createExpressCheckin(user.email,body):null;
    return result?Response.json(result,{status:body.action==="CREATE_EXPRESS_CHECKIN"?201:200}):Response.json({error:"Action is not permitted."},{status:403});
  }catch(error){return Response.json({error:error instanceof Error?error.message:"Video intelligence action failed."},{status:400})}
}
