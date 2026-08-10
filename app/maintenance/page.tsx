import { requireChatGPTUser } from "../chatgpt-auth";
import MaintenanceRepairClient from "./maintenance-repair-client";
import { ensureStaffWorkspace } from "../../db/staff";
import { hasModuleAccess } from "../../db/access-management";
import AaiqAccessDenied from "../components/aaiq-access-denied";
import "./maintenance.css";

export default async function MaintenancePage() {
  const user = await requireChatGPTUser("/maintenance");
  await ensureStaffWorkspace(user.email, user.displayName);
  if (!await hasModuleAccess(user.email, "AAIQ_MAINTENANCE")) return <AaiqAccessDenied moduleName="AAIQ Maintenance"/>;
  return <MaintenanceRepairClient displayName={user.displayName}/>;
}
