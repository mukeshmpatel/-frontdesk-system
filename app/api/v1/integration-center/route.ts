import { getChatGPTUser } from "../../../chatgpt-auth";
import { ensureStaffWorkspace } from "../../../../db/staff";
import { hasModuleAccess } from "../../../../db/access-management";
import { createSocialDraft, integrationCenter, saveIntegrationCredentials,
  updateIntegration } from "../../../../db/open-source-integrations";
import { approvePostizDraft, indexOrganizationalMemory, runGovernedHealthCheck, runMetaCapiTestEvent,
  searchOrganizationalMemory, syncGovernedReadOnlyData,
  listPostizChannels } from "../../../server/integrations/governed-open-source";
import { connectorCertificationCenter, runMessagingContractCertification, runMockConnectorCertification, runOperationalContractCertification } from "../../../../db/connector-certification";
import {configureTwoPropertyPilot,pilotRolloutCenter}from"../../../../db/pilot-rollout";
import {configureManualReportPilot,configurePilotRoster,pilotReportingCenter,savePilotReport}from"../../../../db/pilot-reporting";
import {env}from"cloudflare:workers";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  if(!await hasModuleAccess(user.email,"AAIQ_INTEGRATION_CENTER"))return Response.json({error:"Governed Integrations access is required."},{status:403});
  await ensureStaffWorkspace(user.email, user.displayName);
  const data = await integrationCenter(user.email);
  const [certification,pilot,pilotReporting] = await Promise.all([connectorCertificationCenter(user.email),pilotRolloutCenter(user.email),pilotReportingCenter(user.email)]);
  return data ? Response.json({...data,certification,pilot,pilotReporting}, { headers: { "cache-control": "private, no-store" } })
    : Response.json({ error: "Property access is required." }, { status: 403 });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  if(!await hasModuleAccess(user.email,"AAIQ_INTEGRATION_CENTER"))return Response.json({error:"Governed Integrations access is required."},{status:403});
  await ensureStaffWorkspace(user.email, user.displayName);
  try {
    if((request.headers.get("content-type")||"").includes("multipart/form-data")){
      if(!env.MEDIA)return Response.json({error:"Report storage is unavailable."},{status:503});
      const form=await request.formData(),file=form.get("file");if(!(file instanceof File))return Response.json({error:"Choose a CSV, Excel, PDF, or text report."},{status:400});
      const allowed=/\.(csv|xls|xlsx|pdf|txt)$/i.test(file.name);if(!allowed)return Response.json({error:"Choose a CSV, Excel, PDF, or text report."},{status:415});if(file.size>25*1024*1024)return Response.json({error:"Keep report files under 25 MB."},{status:413});
      const bytes=await file.arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),x=>x.toString(16).padStart(2,"0")).join(""),key=`pilot-reports/${String(form.get("propertyId")||"unknown")}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_").slice(-120)}`;
      await env.MEDIA.put(key,bytes,{httpMetadata:{contentType:file.type||"application/octet-stream"}});const result=await savePilotReport(user.email,{propertyId:String(form.get("propertyId")||""),reportType:String(form.get("reportType")||""),scheduledLocalTime:String(form.get("scheduledLocalTime")||""),businessDate:String(form.get("businessDate")||""),objectKey:key,file,sha256:hash});if(!result||result.duplicate)await env.MEDIA.delete(key);return result?Response.json(result,{status:result.duplicate?200:201}):Response.json({error:"Property access is required."},{status:403});
    }
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action || "");
    const result = action === "UPDATE_INTEGRATION" ? await updateIntegration(user.email, body)
      : action === "CONFIGURE_TWO_PROPERTY_PILOT" ? await configureTwoPropertyPilot(user.email)
      : action === "CONFIGURE_MANUAL_REPORT_PILOT" ? await configureManualReportPilot(user.email,body)
      : action === "CONFIGURE_PILOT_ROSTER" ? await configurePilotRoster(user.email,body)
      : action === "RUN_MOCK_CERTIFICATION" ? await runMockConnectorCertification(user.email,String(body.familyKey||"")||undefined)
      : action === "RUN_MESSAGING_CONTRACT_CERTIFICATION" ? await runMessagingContractCertification(user.email,String(body.familyKey||""))
      : action === "RUN_OPERATIONAL_CONTRACT_CERTIFICATION" ? await runOperationalContractCertification(user.email,String(body.familyKey||""))
      : action === "SAVE_CREDENTIALS" ? await saveIntegrationCredentials(user.email, body)
      : action === "HEALTH_CHECK" ? await runGovernedHealthCheck(user.email, String(body.providerKey || ""))
      : action === "META_CAPI_TEST_EVENT" ? await runMetaCapiTestEvent(user.email)
      : action === "SAVE_MEMORY" ? await indexOrganizationalMemory(user.email, body)
      : action === "SEARCH_MEMORY" ? await searchOrganizationalMemory(user.email, String(body.query || ""))
      : action === "SYNC_READ_ONLY_DATA" ? await syncGovernedReadOnlyData(user.email, String(body.providerKey || ""))
      : action === "LIST_POSTIZ_CHANNELS" ? await listPostizChannels(user.email)
      : action === "CREATE_SOCIAL_DRAFT" ? await createSocialDraft(user.email, body)
      : action === "APPROVE_SOCIAL_DRAFT" ? await approvePostizDraft(user.email, String(body.id || ""))
      : null;
    return result ? Response.json(result, { status: action.startsWith("CREATE") ? 201 : 200 })
      : Response.json({ error: "The action is unavailable or requires administrator approval." }, { status: 403 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Integration action failed." }, { status: 400 });
  }
}
