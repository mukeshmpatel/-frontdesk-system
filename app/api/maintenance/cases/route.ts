import { cookies } from "next/headers";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { hasModuleAccess } from "../../../../db/access-management";
import { createMaintenanceCase, maintenanceCenter } from "../../../../db/maintenance-repairs";

async function authorizedUser() {
  const user = await getChatGPTUser();
  if (!user) return { response: Response.json({ error: "Sign in is required." }, { status: 401 }) };
  if (!await hasModuleAccess(user.email, "AAIQ_MAINTENANCE")) {
    return { response: Response.json({ error: "Maintenance access is required." }, { status: 403 }) };
  }
  return { user };
}

export async function GET() {
  const auth = await authorizedUser();
  if (!auth.user) return auth.response;
  const propertyId = (await cookies()).get("aaiq_active_property")?.value || null;
  try {
    const result = await maintenanceCenter(auth.user.email, propertyId);
    return result ? Response.json(result, { headers: { "cache-control": "private, no-store" } }) :
      Response.json({ error: "An active property assignment is required." }, { status: 403 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Maintenance center could not load." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const auth = await authorizedUser();
  if (!auth.user) return auth.response;
  const propertyId = (await cookies()).get("aaiq_active_property")?.value || null;
  try {
    const body = await request.json() as Record<string, unknown>;
    const result = await createMaintenanceCase(auth.user.email, body, propertyId);
    return result ? Response.json(result, { status: result.duplicate ? 200 : 201 }) :
      Response.json({ error: "This Maintenance intake is not permitted." }, { status: 403 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Maintenance intake failed." }, { status: 409 });
  }
}
