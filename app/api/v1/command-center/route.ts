import {getChatGPTUser} from "../../../chatgpt-auth";import {ensureStaffWorkspace} from "../../../../db/staff";
import {accessCenter} from "../../../../db/access-management";import {getPropertyWorkflows} from "../../../../db/property-workflows";import {assetRegistry} from "../../../../db/property-assets";
import {homeWorkspace,updateQuickLink} from "../../../../db/home-adoption";
export async function GET(){const user=await getChatGPTUser();if(!user)return Response.json({error:"Sign in required."},{status:401});await ensureStaffWorkspace(user.email,user.displayName);
 const [access,workflows,assets,home]=await Promise.all([accessCenter(user.email),getPropertyWorkflows(user.email),assetRegistry(user.email),homeWorkspace(user.email)]);
 if(!access)return Response.json({error:"Staff access required."},{status:403});const profile=access.users.find((item:any)=>item.email.toLowerCase()===user.email.toLowerCase())??access.users[0];
 const allowed=new Set(profile?.grants??[]),open=(workflows?.orders as any[]??[]).filter(order=>!["COMPLETE","VERIFIED"].includes(order.status));
 const scoped=profile?.department==="EXECUTIVE"||access.role==="admin"?open:open.filter(order=>order.department===profile?.department);
 return Response.json({profile,primaryAction:scoped[0]??null,openCount:scoped.length,criticalCount:scoped.filter(order=>order.priority==="CRITICAL").length,
  assetFindings:assets?.findings?.length??0,modules:{actions:allowed.has("AAIQ_ACTION_CENTER")||access.role==="admin",operations:allowed.has("AAIQ_PROPERTY_OPERATIONS")||access.role==="admin",
  reports:allowed.has("AAIQ_REPORTING")||access.role==="admin",assets:allowed.has("AAIQ_ASSET_REGISTRY")||access.role==="admin"},home});
}
export async function POST(request:Request){const user=await getChatGPTUser();if(!user)return Response.json({error:"Sign in required."},{status:401});const body=await request.json() as {action:string;href?:string};try{const home=await updateQuickLink(user.email,body);if(!home)return Response.json({error:"Staff access required."},{status:403});return Response.json({home});}catch(error){return Response.json({error:error instanceof Error?error.message:"Quick Link update failed."},{status:400});}}
