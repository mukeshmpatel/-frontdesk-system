import { getChatGPTUser } from "../../../../chatgpt-auth";
import { reportDrilldown,reportMetricDrilldown } from "../../../../../db/reporting-layer";
import { reportingAccessError } from "../../../../../lib/reporting-route-access";

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  const denied=await reportingAccessError(user,"READ");if(denied)return denied;
  const url=new URL(request.url),token=url.searchParams.get("token")??"",metricId=url.searchParams.get("metric")??"";
  if(!token&&!metricId)return Response.json({error:"A metric is required."},{status:400});
  const result=token?await reportDrilldown(user.email,token):await reportMetricDrilldown(user.email,{metricId,
    from:url.searchParams.get("from")??"",to:url.searchParams.get("to")??"",property:url.searchParams.get("property")??undefined,
    department:url.searchParams.get("department")??undefined,employee:url.searchParams.get("employee")??undefined,status:url.searchParams.get("status")??undefined,
    groupBy:url.searchParams.get("group_by")??undefined,dimension:url.searchParams.get("dimension")??undefined});
  if (!result) return Response.json({ error: "Staff access is required." }, { status: 403 });
  if ("expired" in result&&result.expired) return Response.json({ error: "This legacy drill-down expired. Refresh the report." }, { status: 410 });
  return Response.json(result, { headers: { "cache-control": "private, no-store" } });
}
