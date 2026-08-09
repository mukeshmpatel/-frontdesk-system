import { requireChatGPTUser } from "../chatgpt-auth";
import { ensureStaffWorkspace } from "../../db/staff";
import { hasModuleAccess } from "../../db/access-management";
import AaiqAccessDenied from "../components/aaiq-access-denied";
import CashCustodyClient from "./cash-custody-client";
export const dynamic="force-dynamic";
export default async function Page(){const u=await requireChatGPTUser("/aaiq-cash-custody");await ensureStaffWorkspace(u.email,u.displayName);if(!await hasModuleAccess(u.email,"AAIQ_CASH_CUSTODY"))return <AaiqAccessDenied moduleName="AAIQ Cash & Check Custody"/>;return <CashCustodyClient/>;}
