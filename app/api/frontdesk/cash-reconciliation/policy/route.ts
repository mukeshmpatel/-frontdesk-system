import { cookies } from "next/headers";
import { getChatGPTUser } from "../../../../chatgpt-auth";
import { ensureStaffWorkspace } from "../../../../../db/staff";
import { hasModuleAccess } from "../../../../../db/access-management";
import { updateCashReconciliationPolicy } from "../../../../../db/cash-reconciliation";

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!(await hasModuleAccess(user.email, "AAIQ_CASH_CUSTODY"))) return Response.json({ error: "Cash custody access required." }, { status: 403 });
  await ensureStaffWorkspace(user.email, user.displayName);
  try {
    const body = await request.json() as Record<string, unknown>;
    const propertyId = String(body.propertyId || "") || (await cookies()).get("aaiq_active_property")?.value;
    const result = await updateCashReconciliationPolicy(user.email, {
      propertyId, expectedShiftCodes: Array.isArray(body.expectedShiftCodes) ? body.expectedShiftCodes.map(String) : [],
      discrepancyThresholdCents: Number(body.discrepancyThresholdCents),
      escalationWindowMinutes: Number(body.escalationWindowMinutes),
      scheduledLocalTime: String(body.scheduledLocalTime || ""),
    });
    return Response.json(result, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Cash policy update failed." }, { status: 409 });
  }
}
