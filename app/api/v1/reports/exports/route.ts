import { getChatGPTUser } from "../../../../chatgpt-auth";
import { compileGovernedReportExport } from "../../../../../db/reporting-layer";
import { reportingAccessError } from "../../../../../lib/reporting-route-access";

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  // reportingAccessError centralizes authorizeUatRole and the matching
  // recordUatAccessEvidence allow/deny receipt for every EXPORT decision.
  const denied=await reportingAccessError(user,"EXPORT");if(denied)return denied;
  try{const body=await request.json() as any,filters=body.filters??{};
   if(!filters.from||!filters.to)return Response.json({error:"Export start and end dates are required."},{status:400});
   const result=await compileGovernedReportExport(user.email,{reportId:String(body.reportId||"property"),format:String(body.format||"csv"),filters,groupBy:String(body.groupBy||"fact_type"),drill:body.drill?String(body.drill):undefined});
   return result?new Response(result.content,{status:201,headers:{"content-type":"text/csv; charset=utf-8","content-disposition":`attachment; filename="${result.fileName}"`,"cache-control":"private, no-store","x-aaiq-row-count":String(result.rowCount),"x-content-checksum-sha256":result.checksum}}):Response.json({error:"Staff access is required."},{status:403});
  }catch(error){return Response.json({error:error instanceof Error?error.message:"Export failed."},{status:400})}
}
