import { requireChatGPTUser } from "../chatgpt-auth";
import TeamOperationsCommandCenter from "./team-operations-command-center";
import {ensureStaffWorkspace} from "../../db/staff";import {hasModuleAccess} from "../../db/access-management";import AaiqAccessDenied from "../components/aaiq-access-denied";
import "./team-command.css";
export default async function PropertyOperationsPage(){
  const user=await requireChatGPTUser("/property-operations");
  await ensureStaffWorkspace(user.email,user.displayName);if(!await hasModuleAccess(user.email,"AAIQ_PROPERTY_OPERATIONS"))return <AaiqAccessDenied moduleName="AAIQ Property Operations"/>;
  return <TeamOperationsCommandCenter displayName={user.displayName}/>;
}
