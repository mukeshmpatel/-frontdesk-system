import{env}from"cloudflare:workers";
import{activeStaffContext}from"./staff";
import{recordSystemAudit}from"./platform-controls";
import{configureManualReportPilot}from"./pilot-reporting";
import{autoPreparePilot,pilotLaunchCenter}from"./pilot-launch";

function db(){if(!env.DB)throw new Error("AAIQ property provisioning storage is unavailable.");return env.DB}

export async function provisionCommonPilotOperations(email:string){
 const context=await activeStaffContext(email);if(!context||context.role!=="admin")return null;
 await autoPreparePilot(email);
 await configureManualReportPilot(email,{contacts:[]});
 const rollout=await db().prepare("SELECT id FROM pilot_rollout_profiles WHERE organization_id=? ORDER BY updated_at DESC LIMIT 1").bind(context.organizationId).first<any>();
 if(!rollout)throw new Error("Initialize the pilot before provisioning common operations.");
 const properties=await db().prepare(`SELECT p.* FROM property_contexts p JOIN pilot_rollout_properties rp ON rp.property_id=p.id AND rp.organization_id=p.organization_id WHERE p.organization_id=? AND rp.rollout_id=? ORDER BY rp.property_role`).bind(context.organizationId,rollout.id).all<any>();
 const now=new Date().toISOString(),results=[];
 for(const property of properties.results){
  await db().batch([
   db().prepare(`INSERT INTO protected_property_administrators(id,organization_id,property_id,user_email,display_name,status,provisioned_by,created_at,updated_at) VALUES(?,?,?,?,?,'ACTIVE',?,?,?) ON CONFLICT(organization_id,property_id) DO UPDATE SET status='ACTIVE',updated_at=excluded.updated_at`).bind(crypto.randomUUID(),context.organizationId,property.id,context.email,context.displayName,email,now,now),
   db().prepare(`INSERT INTO property_assignments(id,organization_id,property_id,user_email,department,role_label,is_default,status,created_at) VALUES(?,?,?,?,'EXECUTIVE','ADMINISTRATOR',1,'ACTIVE',?) ON CONFLICT(organization_id,property_id,user_email) DO UPDATE SET department='EXECUTIVE',role_label='ADMINISTRATOR',is_default=1,status='ACTIVE'`).bind(crypto.randomUUID(),context.organizationId,property.id,context.email,now),
   db().prepare(`INSERT INTO pilot_staff_assignments(id,organization_id,property_id,user_email,display_name,phone,operational_role,enterprise_scope,status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,NULL,'ENTERPRISE_OWNER',1,'ACTIVE',?,?,?) ON CONFLICT(organization_id,property_id,user_email) DO UPDATE SET display_name=excluded.display_name,operational_role='ENTERPRISE_OWNER',enterprise_scope=1,status='ACTIVE',updated_at=excluded.updated_at`).bind(crypto.randomUUID(),context.organizationId,property.id,context.email,context.displayName,email,now,now),
  ]);
  const verified=[
   ["ROSTER",`AAIQ provisioned ${context.displayName} as the protected property administrator. The administrator seat cannot be deleted; it may only be reassigned through an audited administrator workflow.`,"SYSTEM_PROVISIONED_PROTECTED_ADMIN"],
   ["REPORT_PROFILE","AAIQ configured the standard America/Chicago manual-fallback report schedule and seven governed report types. Actual inbox addresses and source reports remain exception inputs.","SYSTEM_PROVISIONED_REPORT_PROFILE"],
   ["QUIET_HOURS","AAIQ applied the protected pilot default of 9:00 PM through 8:00 AM with human approval required for public responses.","SYSTEM_PROVISIONED_QUIET_HOURS"],
   ["RETENTION","AAIQ applied the protected 30-day pilot retention default while financial actions and autonomous guest actions remain disabled.","SYSTEM_PROVISIONED_RETENTION"],
  ];
  for(const [taskKey,note,type] of verified)await db().prepare(`UPDATE pilot_launch_tasks SET status='READY',owner_email=?,note=?,evidence_json=?,updated_by=?,updated_at=? WHERE organization_id=? AND rollout_id=? AND property_id=? AND task_key=?`).bind(context.email,note,JSON.stringify({type,propertyId:property.id,verifiedAt:now,source:"AAIQ_HOTEL_BASELINE_V1"}),email,now,context.organizationId,rollout.id,property.id,taskKey).run();
  await db().prepare(`UPDATE pilot_launch_policies SET quiet_hours_start='21:00',quiet_hours_end='08:00',retention_days=30,public_response_approval=1,financial_actions_enabled=0,guest_actions_enabled=0,updated_by=?,updated_at=? WHERE organization_id=? AND rollout_id=? AND property_id=?`).bind(email,now,context.organizationId,rollout.id,property.id).run();
  await db().prepare(`UPDATE pilot_launch_tasks SET status='IN_PROGRESS',owner_email=?,note=?,evidence_json=?,updated_by=?,updated_at=? WHERE organization_id=? AND rollout_id=? AND property_id=? AND task_key IN('MFA','CLOCK_IN','REPRESENTATIVE_REPORTS','PARSER_REVIEW','PMS','COMMUNICATIONS','TECHNOLOGY','PAYMENTS','ESCALATION','ROLE_JOURNEYS','DENIALS','RECOVERY') AND status='NOT_STARTED'`).bind(context.email,"AAIQ completed the common baseline. This item is waiting only for property-specific evidence or an external provider connection.",JSON.stringify({type:"EXCEPTION_ONLY_REMAINDER",preparedAt:now}),email,now,context.organizationId,rollout.id,property.id).run();
  await recordSystemAudit({organizationId:context.organizationId,propertyId:property.id,eventType:"PILOT_COMMON_OPERATIONS_PROVISIONED",entityType:"PROPERTY_CONTEXT",entityId:property.id,authorType:"USER",authorId:email,correlationId:crypto.randomUUID(),delta:{protectedAdministrator:context.email,baselineTasksVerified:4,reportScheduleConfigured:true,quietHours:["21:00","08:00"],retentionDays:30,remainingMode:"EXCEPTIONS_ONLY",financialAutonomy:false,externalActionsEnabled:false}});
  results.push({propertyId:property.id,code:property.code,protectedAdministrator:context.email,baselineTasksVerified:4});
 }
 const center=await pilotLaunchCenter(email);
 return{...center,automationResult:{properties:results,notice:"AAIQ provisioned the common operating baseline for both properties. Each now has a protected administrator, report schedule, quiet hours, retention, safeguards, assets, and audit evidence. Only property-specific or external evidence remains."}};
}
