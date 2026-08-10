import { getChatGPTUser } from "../../../../chatgpt-auth";
import { listReportViews, saveReportView } from "../../../../../db/reporting-layer";
import { reportingAccessError } from "../../../../../lib/reporting-route-access";

export async function GET(request:Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  const denied=await reportingAccessError(user,"READ");if(denied)return denied;
  const result = await listReportViews(user.email,new URL(request.url).searchParams.get("property"));
  return result ? Response.json({ views: result.results }) : Response.json({ error: "Staff access is required." }, { status: 403 });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  const denied=await reportingAccessError(user,"READ");if(denied)return denied;
  const body = await request.json() as { name?: string; reportId?: string; filters?: Record<string, unknown> };
  if (!body.name?.trim()) return Response.json({ error: "A view name is required." }, { status: 400 });
  const result = await saveReportView(user.email, body.name.trim(), body.reportId ?? "property", body.filters ?? {});
  return result ? Response.json(result, { status: 201 }) : Response.json({ error: "Staff access is required." }, { status: 403 });
}
