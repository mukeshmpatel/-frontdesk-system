import { requireChatGPTUser } from "../chatgpt-auth";
import HousekeepingDepartureClient from "./housekeeping-departure-client";
import { ensureStaffWorkspace } from "../../db/staff";
import { hasModuleAccess } from "../../db/access-management";
import AaiqAccessDenied from "../components/aaiq-access-denied";
import "./housekeeping.css";

export default async function HousekeepingPage() {
  const user = await requireChatGPTUser("/housekeeping");
  await ensureStaffWorkspace(user.email, user.displayName);
  if (!await hasModuleAccess(user.email, "AAIQ_HOUSEKEEPING")) return <AaiqAccessDenied moduleName="AAIQ Housekeeping"/>;
  return <HousekeepingDepartureClient displayName={user.displayName}/>;
}
