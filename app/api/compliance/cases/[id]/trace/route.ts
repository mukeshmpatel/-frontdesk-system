import { cookies } from "next/headers";
import { getChatGPTUser } from "../../../../../chatgpt-auth";
import { hasModuleAccess } from "../../../../../../db/access-management";
import { complianceCaseTrace } from "../../../../../../db/compliance-inspections";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  if (!await hasModuleAccess(user.email, "AAIQ_COMPLIANCE_CENTER")) return Response.json({ error: "Compliance Center access is required." }, { status: 403 });
  const { id } = await context.params, propertyId = (await cookies()).get("aaiq_active_property")?.value || null;
  try {
    const result = await complianceCaseTrace(user.email, id, propertyId);
    return result ? Response.json(result, { headers: { "cache-control": "private, no-store" } }) :
      Response.json({ error: "Compliance case trace was not found." }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Compliance trace could not load." }, { status: 409 });
  }
}
