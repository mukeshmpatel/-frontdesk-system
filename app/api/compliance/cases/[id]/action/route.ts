import { cookies } from "next/headers";
import { getChatGPTUser } from "../../../../../chatgpt-auth";
import { hasModuleAccess } from "../../../../../../db/access-management";
import { actOnComplianceCase } from "../../../../../../db/compliance-inspections";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  if (!await hasModuleAccess(user.email, "AAIQ_COMPLIANCE_CENTER")) return Response.json({ error: "Compliance Center access is required." }, { status: 403 });
  const { id } = await context.params, propertyId = (await cookies()).get("aaiq_active_property")?.value || null;
  try {
    const result = await actOnComplianceCase(user.email, id, await request.json() as Record<string, unknown>, propertyId);
    return result ? Response.json(result) : Response.json({ error: "This Compliance action is not permitted." }, { status: 403 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Compliance action failed." }, { status: 409 });
  }
}
