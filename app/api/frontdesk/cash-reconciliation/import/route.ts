import { cookies } from "next/headers";
import { getChatGPTUser } from "../../../../chatgpt-auth";
import { ensureStaffWorkspace } from "../../../../../db/staff";
import { hasModuleAccess } from "../../../../../db/access-management";
import { importCashSourceReport } from "../../../../../db/cash-reconciliation";

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!(await hasModuleAccess(user.email, "AAIQ_CASH_CUSTODY"))) return Response.json({ error: "Cash custody access required." }, { status: 403 });
  await ensureStaffWorkspace(user.email, user.displayName);
  try {
    const body = await request.json() as { businessDate?: string; propertyId?: string; sourceType?: string; sourceReference?: string; fileName?: string; content?: string };
    const propertyId = body.propertyId || (await cookies()).get("aaiq_active_property")?.value;
    const result = await importCashSourceReport(user.email, {
      propertyId, businessDate: String(body.businessDate || ""),
      sourceType: String(body.sourceType || "") as "PMS_EXPORT" | "EMAIL_REPORT" | "MANUAL_UPLOAD" | "PMS_LIVE",
      sourceReference: String(body.sourceReference || ""), fileName: body.fileName,
      content: String(body.content || ""),
    });
    return Response.json(result, { status: 201, headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Cash source import failed." }, { status: 409 });
  }
}
