import { cookies } from "next/headers";
import { getChatGPTUser } from "../../../../../chatgpt-auth";
import { ensureStaffWorkspace } from "../../../../../../db/staff";
import { hasModuleAccess } from "../../../../../../db/access-management";
import { runCashReconciliationEscalationsForUser } from "../../../../../../db/cash-reconciliation";

export async function POST() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!(await hasModuleAccess(user.email, "AAIQ_CASH_CUSTODY"))) return Response.json({ error: "Cash custody access required." }, { status: 403 });
  await ensureStaffWorkspace(user.email, user.displayName);
  try {
    const propertyId = (await cookies()).get("aaiq_active_property")?.value;
    return Response.json(await runCashReconciliationEscalationsForUser(user.email, propertyId), { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Cash escalation run failed." }, { status: 409 });
  }
}
