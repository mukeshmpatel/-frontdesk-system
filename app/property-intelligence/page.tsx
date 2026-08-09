import { requireChatGPTUser } from "../chatgpt-auth";
import PropertyIntelligenceClient from "./property-intelligence-client";
import {ensureStaffWorkspace} from "../../db/staff";import {hasModuleAccess} from "../../db/access-management";import AaiqAccessDenied from "../components/aaiq-access-denied";
import "./inventory.css";
import "./count-workspace.css";

export const dynamic = "force-dynamic";
export default async function Page() {
  const user=await requireChatGPTUser("/property-intelligence");await ensureStaffWorkspace(user.email,user.displayName);if(!await hasModuleAccess(user.email,"AAIQ_PROPERTY_INTELLIGENCE"))return <AaiqAccessDenied moduleName="AAIQ Property Intelligence"/>;
  return <PropertyIntelligenceClient />;
}
