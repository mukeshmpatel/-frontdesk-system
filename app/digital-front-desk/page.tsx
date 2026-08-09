import { requireChatGPTUser } from "../chatgpt-auth";
import { ensureStaffWorkspace } from "../../db/staff";
import { hasModuleAccess } from "../../db/access-management";
import AaiqAccessDenied from "../components/aaiq-access-denied";
import DigitalFrontDeskClient from "./workforce-client";
import EnterpriseFrontDeskCenter from "./enterprise-operations-center";
import "./enterprise-front-desk.css";

export const dynamic = "force-dynamic";

export default async function DigitalFrontDeskPage() {
  const user = await requireChatGPTUser("/digital-front-desk");
  await ensureStaffWorkspace(user.email, user.displayName);
  if (!await hasModuleAccess(user.email, "AAIQ_DIGITAL_FRONT_DESK")) return <AaiqAccessDenied moduleName="AAIQ Digital Front Desk" />;
  return <>
    <EnterpriseFrontDeskCenter />
    <DigitalFrontDeskClient userEmail={user.email} />
  </>;
}
