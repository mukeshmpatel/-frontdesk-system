import type { ChatGPTUser } from "../app/chatgpt-auth";
import { ensureStaffWorkspace } from "../db/staff";
import { hasModuleAccess } from "../db/access-management";
import { recordUatAccessEvidence } from "../db/phase10-uat";
import { authorizeUatRole } from "./uat-authorization.mjs";

export async function reportingAccessError(user:ChatGPTUser,action:"READ"|"EXPORT"="READ"){
 await ensureStaffWorkspace(user.email,user.displayName);
 if(!await hasModuleAccess(user.email,"AAIQ_REPORTING"))return Response.json({error:"AAIQ Reporting access is required."},{status:403});
 const permission=authorizeUatRole(user.uatRole,"reports",action);
 if(user.uatRole)await recordUatAccessEvidence({email:user.email,role:user.uatRole,capability:"reports",action,allowed:permission.allowed,reason:permission.reason});
 return permission.allowed?null:Response.json({error:`Report ${action.toLowerCase()} is not permitted for this UAT role.`},{status:403});
}
