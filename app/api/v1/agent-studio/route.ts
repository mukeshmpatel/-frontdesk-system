import { cookies } from "next/headers";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { ensureStaffWorkspace } from "../../../../db/staff";
import { hasModuleAccess } from "../../../../db/access-management";
import { agentStudio, decideAgentApproval, decideSystemCapability, executeSystemNeutralTask, runDigitalEmployeeCommand, teachSystemCapability, updateAgentPolicy } from "../../../../db/agent-platform";
import { runMaintenanceBriefing } from "../../../server/agents/maintenance-briefing-agent";
import { evaluateRoleParity, generateRoleReport, roleParityCenter, runScheduledRoleReports } from "../../../../db/role-parity";
import { recordUatAccessEvidence } from "../../../../db/phase10-uat";
import { agentStudioActionClass, authorizeUatRole } from "../../../../lib/uat-authorization.mjs";
import { digitalEmployeeAuthorityCenter, saveAuthorityDefinition, subscribeSignal, publishSyntheticSignal } from "../../../../db/digital-employee-authority";
import { advanceDigitalEmployeeStep, decideDigitalEmployeePlaybookProposal, digitalEmployeeCommandCenter, interveneDigitalEmployee, startDigitalEmployeeShift } from "../../../../db/digital-employee-command-center";

async function uatGate(user:{email:string;uatRole?:string},action:string){const permission=authorizeUatRole(user.uatRole,"agent_studio",action);if(user.uatRole)await recordUatAccessEvidence({email:user.email,role:user.uatRole,capability:"agent_studio",action,allowed:permission.allowed,reason:permission.reason});return permission.allowed;}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  if(!await hasModuleAccess(user.email,"AAIQ_AGENT_STUDIO"))return Response.json({error:"Digital Employee access is required."},{status:403});
  if(!await uatGate(user,"READ"))return Response.json({error:"This UAT role cannot access Digital Employee governance."},{status:403});
  await ensureStaffWorkspace(user.email, user.displayName);
  const propertyId = (await cookies()).get("aaiq_active_property")?.value;
  const data = await agentStudio(user.email, propertyId);
  const roleParity = await roleParityCenter(user.email, propertyId);
  const authority = await digitalEmployeeAuthorityCenter(user.email, propertyId);
  const commandCenter = await digitalEmployeeCommandCenter(user.email, propertyId);
  return data
    ? Response.json({ ...data, roleParity, authority, commandCenter }, { headers: { "cache-control": "private, no-store" } })
    : Response.json({ error: "Property access is required." }, { status: 403 });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  if(!await hasModuleAccess(user.email,"AAIQ_AGENT_STUDIO"))return Response.json({error:"Digital Employee access is required."},{status:403});
  await ensureStaffWorkspace(user.email, user.displayName);
  try {
    const body = await request.json() as Record<string, unknown>;
    const actionClass=agentStudioActionClass(String(body.action||""));
    if(!await uatGate(user,actionClass))return Response.json({error:"This action is not permitted for the authenticated UAT role.",action:actionClass},{status:403});
    if(body.action==="UPDATE_POLICY")return Response.json(await updateAgentPolicy(user.email,body));
    if(body.action==="DECIDE_APPROVAL")return Response.json(await decideAgentApproval(user.email,body));
    if(body.action==="TEACH_SYSTEM_CAPABILITY")return Response.json(await teachSystemCapability(user.email,body));
    if(body.action==="DECIDE_SYSTEM_CAPABILITY")return Response.json(await decideSystemCapability(user.email,body));
    if(body.action==="RUN_SYSTEM_TASK")return Response.json(await executeSystemNeutralTask(user.email,body));
    if(body.action==="RUN_DIGITAL_EMPLOYEE_COMMAND")return Response.json(await runDigitalEmployeeCommand(user.email,body));
    if(body.action==="EVALUATE_ROLE_PARITY")return Response.json(await evaluateRoleParity(user.email));
    if(body.action==="GENERATE_ROLE_REPORT")return Response.json(await generateRoleReport(user.email,body));
    if(body.action==="RUN_SCHEDULED_ROLE_REPORTS")return Response.json(await runScheduledRoleReports(user.email));
    if(body.action==="SAVE_AUTHORITY")return Response.json(await saveAuthorityDefinition(user.email,body));
    if(body.action==="SUBSCRIBE_SIGNAL")return Response.json(await subscribeSignal(user.email,body));
    if(body.action==="PUBLISH_SYNTHETIC_SIGNAL")return Response.json(await publishSyntheticSignal(user.email,body));
    if(body.action==="START_DIGITAL_EMPLOYEE_SHIFT"||body.action==="ASSIGN_DIGITAL_EMPLOYEE_DUTIES")return Response.json(await startDigitalEmployeeShift(user.email,body));
    if(body.action==="ADVANCE_DIGITAL_EMPLOYEE_STEP")return Response.json(await advanceDigitalEmployeeStep(user.email,body));
    if(body.action==="INTERVENE_DIGITAL_EMPLOYEE")return Response.json(await interveneDigitalEmployee(user.email,body));
    if(body.action==="DECIDE_DIGITAL_EMPLOYEE_PLAYBOOK")return Response.json(await decideDigitalEmployeePlaybookProposal(user.email,body));
    if (body.action !== "RUN_MAINTENANCE_BRIEFING") return Response.json({ error: "Unsupported agent action." }, { status: 400 });
    const result = await runMaintenanceBriefing(user.email,
      String(body.intent || "Prepare the maintenance briefing for this property.").slice(0, 2000));
    return result
      ? Response.json(result, { status: result.status === "MANUAL_FALLBACK" ? 202 : 200 })
      : Response.json({ error: "Property access is required." }, { status: 403 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Agent run failed." }, { status: 500 });
  }
}
