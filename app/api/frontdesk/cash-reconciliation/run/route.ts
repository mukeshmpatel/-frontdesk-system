import { cookies } from "next/headers";
import { getChatGPTUser } from "../../../../chatgpt-auth";
import { ensureStaffWorkspace } from "../../../../../db/staff";
import { hasModuleAccess } from "../../../../../db/access-management";
import { runCashReconciliation } from "../../../../../db/cash-reconciliation";

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!(await hasModuleAccess(user.email, "AAIQ_CASH_CUSTODY"))) return Response.json({ error: "Cash custody access required." }, { status: 403 });
  await ensureStaffWorkspace(user.email, user.displayName);
  try {
    const body = await request.json() as { businessDate?: string; propertyId?: string };
    const propertyId = body.propertyId || (await cookies()).get("aaiq_active_property")?.value;
    const result = await runCashReconciliation(user.email, { propertyId, businessDate: String(body.businessDate || "") });
    return Response.json(result, { status: 201, headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Cash reconciliation failed." }, { status: 409 });
  }
}
