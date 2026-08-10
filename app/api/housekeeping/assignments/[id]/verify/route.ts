import { cookies } from "next/headers";
import { getChatGPTUser } from "../../../../../chatgpt-auth";
import { hasModuleAccess } from "../../../../../../db/access-management";
import { actOnHousekeepingAssignment } from "../../../../../../db/housekeeping-departures";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  if (!await hasModuleAccess(user.email, "AAIQ_HOUSEKEEPING")) return Response.json({ error: "Housekeeping access is required." }, { status: 403 });
  const { id } = await context.params, propertyId = (await cookies()).get("aaiq_active_property")?.value || null;
  try {
    const body = await request.json() as Record<string, unknown>;
    const result = await actOnHousekeepingAssignment(user.email, id, body, propertyId);
    return result ? Response.json(result) : Response.json({ error: "This assignment action is not permitted." }, { status: 403 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Housekeeping action failed." }, { status: 409 });
  }
}
