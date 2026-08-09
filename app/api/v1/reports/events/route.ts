import { getChatGPTUser } from "../../../../chatgpt-auth";
import { reportEventCursor } from "../../../../../db/reporting-layer";
import { reportingAccessError } from "../../../../../lib/reporting-route-access";

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  const denied=await reportingAccessError(user,"READ");if(denied)return denied;
  const url=new URL(request.url);const result=await reportEventCursor(user.email,url.searchParams.get("after")??"",url.searchParams.get("property"));
  return result ? Response.json(result, { headers: { "cache-control": "private, no-store" } })
    : Response.json({ error: "Staff access is required." }, { status: 403 });
}
