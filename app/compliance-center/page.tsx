import { requireChatGPTUser } from "../chatgpt-auth";
import ComplianceInspectionClient from "./compliance-inspection-client";
import { ensureStaffWorkspace } from "../../db/staff";
import { hasModuleAccess } from "../../db/access-management";
import AaiqAccessDenied from "../components/aaiq-access-denied";
import "./compliance.css";

export default async function ComplianceCenterPage() {
  const user = await requireChatGPTUser("/compliance-center");
  await ensureStaffWorkspace(user.email, user.displayName);
  if (!await hasModuleAccess(user.email, "AAIQ_COMPLIANCE_CENTER")) return <AaiqAccessDenied moduleName="AAIQ Compliance Center"/>;
  return <ComplianceInspectionClient displayName={user.displayName}/>;
}
