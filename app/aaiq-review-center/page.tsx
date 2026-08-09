import { requireChatGPTUser } from "../chatgpt-auth";
import { ensureStaffWorkspace } from "../../db/staff";
import { hasModuleAccess } from "../../db/access-management";
import AaiqAccessDenied from "../components/aaiq-access-denied";
import ReviewCenterClient from "./review-center-client";
import "./review-center.css";
import "./review-advanced.css";

export const dynamic = "force-dynamic";
export default async function ReviewCenterPage() {
  const user = await requireChatGPTUser("/aaiq-review-center");
  await ensureStaffWorkspace(user.email, user.displayName);
  if (!await hasModuleAccess(user.email, "AAIQ_REVIEW_INTELLIGENCE")) return <AaiqAccessDenied moduleName="AAIQ Review Intelligence" />;
  return <ReviewCenterClient />;
}
