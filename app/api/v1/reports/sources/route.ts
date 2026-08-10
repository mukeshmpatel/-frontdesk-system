import {getChatGPTUser} from "../../../../chatgpt-auth";
import {authorizedPropertyScope} from "../../../../../db/property-scope";
import {reportingAccessError} from "../../../../../lib/reporting-route-access";

/**
 * Notification sources created before property reconciliation are deliberately
 * not relabeled as the active hotel. This endpoint becomes available after a
 * source account is explicitly mapped to a canonical property.
 */
export async function GET(request:Request){
 const user=await getChatGPTUser();if(!user)return Response.json({error:"Sign in is required."},{status:401});
 const denied=await reportingAccessError(user,"READ");if(denied)return denied;
 const url=new URL(request.url),scope=await authorizedPropertyScope(user.email,url.searchParams.get("property"));
 if(!scope)return Response.json({error:"Authorized property access is required."},{status:403});
 return Response.json({mode:url.searchParams.get("mode")==="summary"?"summary":"separate",property:{id:scope.property.id,code:scope.property.code,name:scope.property.name},
  total:0,sources:[],coverage:{state:"CONNECTION_REQUIRED",sources:[],missing:["Property mapping for each email, phone, or connected account"],
  message:"Connected-source records are preserved, but AAIQ will not assign an organization-wide inbox item to this hotel without an explicit property mapping."},
  summary:"Connect or map each source account to this property before it appears in property reporting."},{headers:{"cache-control":"private, no-store"}});
}
