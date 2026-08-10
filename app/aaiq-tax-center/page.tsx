import { requireChatGPTUser } from "../chatgpt-auth";
import { ensureStaffWorkspace } from "../../db/staff";
import { hasModuleAccess } from "../../db/access-management";
import AaiqAccessDenied from "../components/aaiq-access-denied";
import TaxCenterClient from "./tax-center-client";
import "./tax-center.css";

export const dynamic = "force-dynamic";

export default async function TaxCenterPage() {
  const user = await requireChatGPTUser("/aaiq-tax-center");
  await ensureStaffWorkspace(user.email, user.displayName);
  if (!await hasModuleAccess(user.email, "AAIQ_TAX_PREPARATION")) {
    return <AaiqAccessDenied moduleName="AAIQ Tax & Profit Center" />;
  }
  return <TaxCenterClient />;
}
