import { cookies } from "next/headers";
import { getChatGPTUser } from "../../../../../chatgpt-auth";
import { hasModuleAccess } from "../../../../../../db/access-management";
import { maintenanceCaseTrace } from "../../../../../../db/maintenance-repairs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  if (!await hasModuleAccess(user.email, "AAIQ_MAINTENANCE")) return Response.json({ error: "Maintenance access is required." }, { status: 403 });
  const { id } = await context.params, propertyId = (await cookies()).get("aaiq_active_property")?.value || null;
  const result = await maintenanceCaseTrace(user.email, id, propertyId);
  return result ? Response.json(result, { headers: { "cache-control": "private, no-store" } }) :
    Response.json({ error: "Maintenance case trace was not found." }, { status: 404 });
}
