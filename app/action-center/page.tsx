import { requireChatGPTUser } from "../chatgpt-auth";
import ActionCalendarCenter from "./action-calendar-center";
import "./action-center.css";
import "./briefing-preference.css";
import {ensureStaffWorkspace} from "../../db/staff";import {hasModuleAccess} from "../../db/access-management";import AaiqAccessDenied from "../components/aaiq-access-denied";
export const dynamic="force-dynamic";
export default async function ActionCenterPage(){const user=await requireChatGPTUser("/action-center");await ensureStaffWorkspace(user.email,user.displayName);if(!await hasModuleAccess(user.email,"AAIQ_ACTION_CENTER"))return <AaiqAccessDenied moduleName="AAIQ Action, Notification & Calendar"/>;return <ActionCalendarCenter/>}
