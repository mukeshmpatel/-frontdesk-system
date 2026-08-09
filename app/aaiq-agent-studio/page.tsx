import{requireChatGPTUser}from"../chatgpt-auth";import{ensureStaffWorkspace}from"../../db/staff";import{hasModuleAccess}from"../../db/access-management";import AaiqAccessDenied from"../components/aaiq-access-denied";
import AgentStudioClient from "./agent-studio-client";

export const dynamic="force-dynamic";export default async function AgentStudioPage() {
  const user=await requireChatGPTUser("/aaiq-agent-studio");await ensureStaffWorkspace(user.email,user.displayName);if(!await hasModuleAccess(user.email,"AAIQ_AGENT_STUDIO"))return <AaiqAccessDenied moduleName="AAIQ Digital Employees"/>;
  return <AgentStudioClient />;
}
