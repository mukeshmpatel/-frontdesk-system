import { getChatGPTUser } from "../../../../chatgpt-auth";
import { reportDashboardSummary } from "../../../../../db/reporting-layer";
import { reportingAccessError } from "../../../../../lib/reporting-route-access";

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  const denied=await reportingAccessError(user,"READ");if(denied)return denied;
  const url = new URL(request.url);
  const from = new Date(url.searchParams.get("from") ?? Date.now() - 7 * 86_400_000);
  const to = new Date(url.searchParams.get("to") ?? Date.now());
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
    return Response.json({ error: "A valid report period is required." }, { status: 400 });
  }
  const area = url.searchParams.get("area") ?? "all";
  if (!["all","front_desk","workforce","housekeeping","maintenance","restaurant","banquets","sales","inventory","finance","security","technology","compliance"].includes(area)) {
    return Response.json({ error: "Unsupported reporting area." }, { status: 400 });
  }
  const summary = await reportDashboardSummary(user.email, from.toISOString(), to.toISOString(), area,
    url.searchParams.get("department")||undefined,url.searchParams.get("property"),url.searchParams.get("compare")!=="none");
  return summary ? Response.json(summary, { headers: { "cache-control": "private, no-store" } })
    : Response.json({ error: "Staff access is required." }, { status: 403 });
}
