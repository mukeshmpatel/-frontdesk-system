import { cookies } from "next/headers";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { hasModuleAccess } from "../../../../db/access-management";
import { complianceCenter, configureComplianceProgram, prepareComplianceBaseline, runComplianceAutomation } from "../../../../db/compliance-inspections";

async function authorizedUser() {
  const user = await getChatGPTUser();
  if (!user) return { response: Response.json({ error: "Sign in is required." }, { status: 401 }) };
  if (!await hasModuleAccess(user.email, "AAIQ_COMPLIANCE_CENTER")) {
    return { response: Response.json({ error: "Compliance Center access is required." }, { status: 403 }) };
  }
  return { user };
}

export async function GET() {
  const auth = await authorizedUser(); if (!auth.user) return auth.response;
  const propertyId = (await cookies()).get("aaiq_active_property")?.value || null;
  try {
    const result = await complianceCenter(auth.user.email, propertyId);
    return result ? Response.json(result, { headers: { "cache-control": "private, no-store" } }) :
      Response.json({ error: "An active property assignment is required." }, { status: 403 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Compliance Center could not load." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const auth = await authorizedUser(); if (!auth.user) return auth.response;
  const propertyId = (await cookies()).get("aaiq_active_property")?.value || null;
  try {
    const body = await request.json() as Record<string, unknown>, action = String(body.action || "").toUpperCase();
    const result = action === "PREPARE_BASELINE" ? await prepareComplianceBaseline(auth.user.email, propertyId) :
      action === "CONFIGURE_PROGRAM" ? await configureComplianceProgram(auth.user.email, body, propertyId) :
      action === "RUN_AUTOMATION" ? await runComplianceAutomation(auth.user.email, propertyId) : null;
    return result ? Response.json(result) : Response.json({ error: "This Compliance action is not permitted." }, { status: 403 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Compliance action failed." }, { status: 409 });
  }
}
