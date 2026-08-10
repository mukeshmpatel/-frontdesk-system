import {getChatGPTUser} from "../../../../chatgpt-auth";
import {reportDashboardSummary,recordReportRun} from "../../../../../db/reporting-layer";
import {reportingAccessError} from "../../../../../lib/reporting-route-access";

export async function POST(request:Request){
 const user=await getChatGPTUser();if(!user)return Response.json({error:"Sign in is required."},{status:401});
 const denied=await reportingAccessError(user,"READ");if(denied)return denied;
 try{
  const body=await request.json() as{from?:string;to?:string;area?:string;department?:string;property?:string;compare?:boolean};
  if(!body.from||!body.to)return Response.json({error:"Report start and end are required."},{status:400});
  const started=Date.now(),result=await reportDashboardSummary(user.email,body.from,body.to,body.area??"all",body.department,body.property,body.compare!==false);
  if(!result)return Response.json({error:"Authorized property reporting access is required."},{status:403});
  const receipt=await recordReportRun(user.email,{reportId:body.area??"all",filters:{from:body.from,to:body.to,property:result.property.id,department:body.department,compare:body.compare!==false},
   rowCount:result.metrics.reduce((sum,item)=>sum+item.recordCount,0),coverage:result.coverage,durationMs:Date.now()-started,result});
  return Response.json({...result,receipt},{status:201,headers:{"cache-control":"private, no-store"}});
 }catch(error){return Response.json({error:error instanceof Error?error.message:"Report run failed."},{status:400})}
}
