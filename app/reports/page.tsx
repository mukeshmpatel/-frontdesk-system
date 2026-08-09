import { requireChatGPTUser } from "../chatgpt-auth";
import PmsReportingCenter from "./pms-reporting-center";
import "./source-reports.css";
import "./task-drilldown.css";
import {ensureStaffWorkspace} from "../../db/staff";import {hasModuleAccess} from "../../db/access-management";import AaiqAccessDenied from "../components/aaiq-access-denied";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const user = await requireChatGPTUser("/reports");
  await ensureStaffWorkspace(user.email,user.displayName);
  if(!await hasModuleAccess(user.email,"AAIQ_REPORTING"))return <AaiqAccessDenied moduleName="AAIQ Reporting"/>;
  return <PmsReportingCenter />;
}
