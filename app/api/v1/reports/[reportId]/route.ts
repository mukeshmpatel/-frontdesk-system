import { getChatGPTUser } from "../../../../chatgpt-auth";
import { universalReport } from "../../../../../db/reporting-layer";
import { reportingAccessError } from "../../../../../lib/reporting-route-access";

export async function GET(request: Request, context: { params: Promise<{ reportId: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  const denied=await reportingAccessError(user,"READ");if(denied)return denied;
  const { reportId } = await context.params;
  const url = new URL(request.url);
  const from = new Date(url.searchParams.get("from") ?? Date.now() - 7 * 86_400_000);
  const to = new Date(url.searchParams.get("to") ?? Date.now());
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
    return Response.json({ error: "A valid report period is required." }, { status: 400 });
  }
  const result = await universalReport(user.email, reportId, {
    from: from.toISOString(), to: to.toISOString(),property:url.searchParams.get("property")||undefined,
    department: url.searchParams.get("department") || undefined,
    employee: url.searchParams.get("employee") || undefined,
    status: url.searchParams.get("status") || undefined,
    compare: url.searchParams.get("compare") === "prior",
  }, url.searchParams.get("group_by") ?? "fact_type", url.searchParams.get("drill") || undefined);
  return result ? Response.json(result, { headers: { "cache-control": "private, no-store" } })
    : Response.json({ error: "Staff access is required." }, { status: 403 });
}
