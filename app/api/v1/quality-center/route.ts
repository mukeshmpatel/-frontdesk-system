import {getChatGPTUser} from "../../../chatgpt-auth";
import {ensureStaffWorkspace} from "../../../../db/staff";
import {hasModuleAccess} from "../../../../db/access-management";
import {qualityCenter,runAutonomousQa} from "../../../../db/quality-center";
import {prepareGoldenLibrary,qualityEvaluationCenter,reviewEvalBatch,reviewShadowAudit,runEvalSuite,runShadowMonitor} from "../../../../db/quality-evaluations";
const ROUTES=[
 ["OPERATIONS","Housekeeping workflow","/housekeeping","Housekeeping"],
 ["OPERATIONS","Maintenance workflow","/maintenance","Maintenance"],
 ["REPORTING","Enterprise drill-down reporting","/reports","Enterprise"],
 ["TECHNOLOGY","Autonomous configuration","/aaiq-setup-agent","Autonomous"],
 ["TECHNOLOGY","Governed integrations","/aaiq-integration-center","Governed"],
 ["TECHNOLOGY","User and access control","/aaiq-user-management","Access"],
 ["TECHNOLOGY","Security and audit","/aaiq-security","Security"],
 ["TECHNOLOGY","Technology federation","/aaiq-online-presence","Network Center"],
 ["TECHNOLOGY","Digital Employee control","/aaiq-agent-studio","Digital"],
 ["VIDEO_INTELLIGENCE","Video intelligence","/aaiq-video-intelligence","Video"],
 ["GROWTH","Growth and market intelligence","/property-intelligence","Intelligence"],
 ["GROWTH","Customer intelligence","/aaiq-customer-intelligence","Customer"],
 ["GROWTH","Review intelligence","/aaiq-review-center","Review"],
 ["GROWTH","OTA reconciliation","/aaiq-ota-reconciliation","OTA"],
 ["GROWTH","Website and growth factory","/aaiq-website-factory","Website"],
] as const;
export async function GET(request:Request){const user=await getChatGPTUser();if(!user)return Response.json({error:"Sign in is required."},{status:401});if(!await hasModuleAccess(user.email,"AAIQ_QUALITY_CENTER"))return Response.json({error:"Autonomous QA access is required."},{status:403});await ensureStaffWorkspace(user.email,user.displayName);const batchId=new URL(request.url).searchParams.get("batchId");const[data,evaluations]=await Promise.all([qualityCenter(user.email),qualityEvaluationCenter(user.email,batchId)]);return data&&evaluations?Response.json({...data,evaluations},{headers:{"cache-control":"private, no-store"}}):Response.json({error:"Property access is required."},{status:403})}
export async function POST(request:Request){const user=await getChatGPTUser();if(!user)return Response.json({error:"Sign in is required."},{status:401});if(!await hasModuleAccess(user.email,"AAIQ_QUALITY_CENTER"))return Response.json({error:"Autonomous QA access is required."},{status:403});await ensureStaffWorkspace(user.email,user.displayName);
 try{let body:Record<string,unknown>={};try{body=await request.json() as Record<string,unknown>}catch{/* legacy empty POST means structural diagnostics */}const action=String(body.action||"RUN_STRUCTURAL_CHECKS").toUpperCase();
 if(action==="PREPARE_GOLDEN_LIBRARY")return Response.json(await prepareGoldenLibrary(user.email,body));
 if(action==="RUN_EVAL_SUITE")return Response.json(await runEvalSuite(user.email,body));
 if(action==="REVIEW_EVAL_BATCH")return Response.json(await reviewEvalBatch(user.email,body));
 if(action==="RUN_SHADOW_MONITOR")return Response.json(await runShadowMonitor(user.email));
 if(action==="REVIEW_SHADOW_AUDIT")return Response.json(await reviewShadowAudit(user.email,body));
 if(action!=="RUN_STRUCTURAL_CHECKS")return Response.json({error:"Unsupported Quality Center action."},{status:400});
 const origin=new URL(request.url).origin,cookie=request.headers.get("cookie")||"";const probes=await Promise.all(ROUTES.map(async([suite,name,route,marker])=>{const started=Date.now();try{const response=await fetch(`${origin}${route}`,{headers:{cookie}});const body=await response.text(),hasShell=body.length>500,hasMarker=body.toLowerCase().includes(marker.toLowerCase()),status=response.ok&&hasShell&&hasMarker?"PASS":response.ok&&hasShell?"WARN":"FAIL";return{suite,name,route,status:status as "PASS"|"WARN"|"FAIL",evidence:`HTTP ${response.status}; ${body.length.toLocaleString()} bytes; expected ${marker} marker ${hasMarker?"found":"not found"}.`,recommendation:status==="PASS"?undefined:status==="WARN"?"Open the module and confirm its primary workflow is visible after client hydration.":"Open the route and inspect its server error before release.",latencyMs:Date.now()-started}}catch(error){return{suite,name,route,status:"FAIL" as const,evidence:error instanceof Error?error.message:"Route probe failed.",recommendation:"Check deployment routing and server logs.",latencyMs:Date.now()-started}}}));
 const result=await runAutonomousQa(user.email,probes);return result?Response.json(result):Response.json({error:"Administrator approval is required."},{status:403})}catch(error){return Response.json({error:error instanceof Error?error.message:"QA run failed."},{status:400})}}
