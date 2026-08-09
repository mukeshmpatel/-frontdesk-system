import {requireChatGPTUser} from "../chatgpt-auth";
import MemoryAgentClient from "./memory-agent-client";
import "./memory-agent.css";
import {ensureStaffWorkspace} from "../../db/staff";import {hasModuleAccess} from "../../db/access-management";import AaiqAccessDenied from "../components/aaiq-access-denied";
export const dynamic="force-dynamic";
export default async function MemoryAgentPage(){const user=await requireChatGPTUser("/memory-agent");await ensureStaffWorkspace(user.email,user.displayName);if(!await hasModuleAccess(user.email,"AAIQ_MEMORY_AGENT"))return <AaiqAccessDenied moduleName="AAIQ Memory Agent"/>;return <MemoryAgentClient/>}
