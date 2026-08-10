import { requireChatGPTUser } from "../chatgpt-auth";
import { ensureStaffWorkspace } from "../../db/staff";
import { hasModuleAccess } from "../../db/access-management";
import AaiqAccessDenied from "../components/aaiq-access-denied";
import TimeClockClient from "./time-clock-client";

export default async function WorkforceTimeClockPage() {
  const user = await requireChatGPTUser("/workforce-time-clock");
  await ensureStaffWorkspace(user.email, user.displayName);
  if (!await hasModuleAccess(user.email, "AAIQ_TIME_MANAGEMENT")) return <AaiqAccessDenied moduleName="AAIQ Workforce & Time Clock" />;
  return <TimeClockClient />;
}
