export const UAT_ROLES = Object.freeze(["FRONT_DESK","SUPERVISOR","GM","ADMINISTRATOR","AUDITOR"]);

const permissions = Object.freeze({
  FRONT_DESK: { sample_lab:["READ"], agent_studio:["READ","GENERATE_REPORT"], reports:["READ"] },
  SUPERVISOR: { sample_lab:["READ"], agent_studio:["READ","GENERATE_REPORT","DECIDE_APPROVAL","RUN_TASK"], reports:["READ","EXPORT"] },
  GM: { sample_lab:["READ"], agent_studio:["READ","GENERATE_REPORT","DECIDE_APPROVAL","RUN_TASK"], reports:["READ","EXPORT"] },
  ADMINISTRATOR: { sample_lab:["READ","CREATE"], agent_studio:["READ","GENERATE_REPORT","DECIDE_APPROVAL","RUN_TASK","CONFIGURE","EVALUATE","SCHEDULE"], reports:["READ","EXPORT"] },
  AUDITOR: { sample_lab:["READ"], agent_studio:["READ"], reports:["READ","EXPORT"] },
});

export function authorizeUatRole(role, capability, action) {
  if (!role) return { allowed:true, reason:"PRODUCTION_IDENTITY_POLICY" };
  if (!UAT_ROLES.includes(role)) return { allowed:false, reason:"UNKNOWN_UAT_ROLE" };
  const allowed = permissions[role]?.[capability]?.includes(action) ?? false;
  return { allowed, reason:allowed?"ROLE_PERMISSION_MATCH":"ROLE_PERMISSION_DENIED" };
}

export function agentStudioActionClass(action) {
  if (action === "GENERATE_ROLE_REPORT") return "GENERATE_REPORT";
  if (action === "DECIDE_APPROVAL" || action === "DECIDE_SYSTEM_CAPABILITY" || action === "DECIDE_DIGITAL_EMPLOYEE_PLAYBOOK") return "DECIDE_APPROVAL";
  if (["UPDATE_POLICY","TEACH_SYSTEM_CAPABILITY","SAVE_AUTHORITY","SUBSCRIBE_SIGNAL","PUBLISH_SYNTHETIC_SIGNAL"].includes(action)) return "CONFIGURE";
  if (action === "EVALUATE_ROLE_PARITY") return "EVALUATE";
  if (action === "RUN_SCHEDULED_ROLE_REPORTS") return "SCHEDULE";
  if (["RUN_SYSTEM_TASK","RUN_MAINTENANCE_BRIEFING","RUN_DIGITAL_EMPLOYEE_COMMAND","START_DIGITAL_EMPLOYEE_SHIFT","ASSIGN_DIGITAL_EMPLOYEE_DUTIES","ADVANCE_DIGITAL_EMPLOYEE_STEP","INTERVENE_DIGITAL_EMPLOYEE"].includes(action)) return "RUN_TASK";
  return "UNKNOWN";
}
