import { cookies } from "next/headers";
import { getChatGPTUser } from "../../../../chatgpt-auth";
import { hasModuleAccess } from "../../../../../db/access-management";
import { housekeepingAssignmentsToday } from "../../../../../db/housekeeping-departures";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  if (!await hasModuleAccess(user.email, "AAIQ_HOUSEKEEPING")) return Response.json({ error: "Housekeeping access is required." }, { status: 403 });
  const propertyId = (await cookies()).get("aaiq_active_property")?.value || null;
  const result = await housekeepingAssignmentsToday(user.email, propertyId);
  return result ? Response.json(result, { headers: { "cache-control": "private, no-store" } }) :
    Response.json({ error: "An active property assignment is required." }, { status: 403 });
}
