import { cookies } from "next/headers";
import { getChatGPTUser } from "../../../../../chatgpt-auth";
import { ensureStaffWorkspace } from "../../../../../../db/staff";
import { hasModuleAccess } from "../../../../../../db/access-management";
import { independentlyVerifyCashReconciliation } from "../../../../../../db/cash-reconciliation";

export async function POST(_request: Request, { params }: { params: Promise<{ date: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!(await hasModuleAccess(user.email, "AAIQ_CASH_CUSTODY"))) return Response.json({ error: "Cash custody access required." }, { status: 403 });
  await ensureStaffWorkspace(user.email, user.displayName);
  try {
    const { date } = await params;
    const propertyId = (await cookies()).get("aaiq_active_property")?.value;
    const result = await independentlyVerifyCashReconciliation(user.email, { propertyId, businessDate: decodeURIComponent(date) });
    return Response.json(result, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Independent verification failed." }, { status: 409 });
  }
}
