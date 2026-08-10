import { requireChatGPTUser } from "../chatgpt-auth";
import { ensureStaffWorkspace } from "../../db/staff";
import { hasModuleAccess } from "../../db/access-management";
import AaiqAccessDenied from "../components/aaiq-access-denied";
import EventWorkforceClient from "./event-workforce-client";
import "./event-workforce.css";
export const dynamic="force-dynamic";
export default async function EventWorkforcePage(){const user=await requireChatGPTUser("/aaiq-event-workforce");await ensureStaffWorkspace(user.email,user.displayName);if(!await hasModuleAccess(user.email,"AAIQ_EVENT_WORKFORCE"))return <AaiqAccessDenied moduleName="AAIQ Event Workforce"/>;return <EventWorkforceClient/>}
