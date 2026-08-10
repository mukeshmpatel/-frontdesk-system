/* eslint-disable @typescript-eslint/no-explicit-any */
import { env } from "cloudflare:workers";
import { activeStaffContext } from "./staff";
import { authorizedPropertyScope } from "./property-scope";

function database():D1Database { if (!env.DB) throw new Error("Event Workforce storage is unavailable."); return env.DB; }
async function activeProperty(context:any) { return (await authorizedPropertyScope(context.email))?.property||null; }
const clean=(value:any,max=500)=>String(value??"").trim().slice(0,max);

export async function eventWorkforceCenter(email:string) {
  const context=await activeStaffContext(email); if(!context)return null;
  const property=await activeProperty(context); if(!property)return null;
  const [leads,portfolios,tasks,documents,communications]=await Promise.all([
    database().prepare("SELECT * FROM event_leads WHERE organization_id=? AND property_id=? ORDER BY created_at DESC LIMIT 100").bind(context.organizationId,property.id).all(),
    database().prepare("SELECT * FROM event_portfolios WHERE organization_id=? AND property_id=? ORDER BY updated_at DESC LIMIT 100").bind(context.organizationId,property.id).all(),
    database().prepare("SELECT t.* FROM event_workflow_tasks t JOIN event_portfolios p ON p.id=t.portfolio_id WHERE p.organization_id=? AND p.property_id=? ORDER BY t.due_at,t.title").bind(context.organizationId,property.id).all(),
    database().prepare("SELECT d.* FROM event_documents d JOIN event_portfolios p ON p.id=d.portfolio_id WHERE p.organization_id=? AND p.property_id=? ORDER BY d.updated_at DESC").bind(context.organizationId,property.id).all(),
    database().prepare("SELECT c.* FROM event_communications c JOIN event_portfolios p ON p.id=c.portfolio_id WHERE p.organization_id=? AND p.property_id=? ORDER BY c.created_at DESC").bind(context.organizationId,property.id).all(),
  ]);
  const open=(tasks.results as any[]).filter(row=>row.status!=="COMPLETE");
  return { role:context.role,property,leads:leads.results,portfolios:portfolios.results,tasks:tasks.results,documents:documents.results,communications:communications.results,summary:{activePortfolios:(portfolios.results as any[]).filter(x=>!['CLOSED','CANCELLED'].includes(x.stage)).length,openTasks:open.length,urgentTasks:open.filter(x=>x.due_at&&new Date(x.due_at).getTime()<Date.now()+86400000).length,pendingApprovals:(documents.results as any[]).filter(x=>x.approval_status==='PENDING').length} };
}

export async function eventWorkforceAction(email:string,input:any) {
  const context=await activeStaffContext(email); if(!context)return null;
  const property=await activeProperty(context); if(!property)return null;
  const action=clean(input.action,50),now=new Date().toISOString();
  if(action==="CREATE_LEAD") {
    const contactName=clean(input.contactName,120),eventType=clean(input.eventType,60).toUpperCase();
    if(contactName.length<2)throw new Error("Enter the inquiry contact name.");
    if(!["WEDDING","BANQUET","MEETING","CONFERENCE","GROUP","SOCIAL_EVENT"].includes(eventType))throw new Error("Select a supported event type.");
    const leadId=crypto.randomUUID(),portfolioId=crypto.randomUUID();
    const eventName=clean(input.eventName,160)||`${contactName} ${eventType.replaceAll('_',' ').toLowerCase()}`;
    const role=eventType==="WEDDING"?"DIGITAL_WEDDING_PLANNER":eventType==="BANQUET"?"DIGITAL_BANQUET_COORDINATOR":"DIGITAL_EVENT_MANAGER";
    const due=new Date(Date.now()+86400000).toISOString();
    await database().batch([
      database().prepare("INSERT INTO event_leads VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(leadId,context.organizationId,property.id,eventType,contactName,clean(input.contactEmail,200)||null,clean(input.contactPhone,40)||null,clean(input.eventDate,30)||null,Number(input.guestCount)||null,Number(input.budgetCents)||null,clean(input.source,60)||"DIRECT","QUALIFYING",role,now,now),
      database().prepare("INSERT INTO event_portfolios VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(portfolioId,context.organizationId,property.id,leadId,eventName,eventType,"DISCOVERY",role,JSON.stringify({guestCount:Number(input.guestCount)||null,eventDate:clean(input.eventDate,30)||null}),"[]","Confirm date, guest count, spaces, service, budget and decision timeline",due,now,now),
      ...[["DISCOVERY_CALL","Confirm requirements and decision timeline",role],["AVAILABILITY","Prepare availability and space-fit review","DIGITAL_EVENT_MANAGER"],["PROPOSAL","Prepare package and pricing draft",role],["CONTRACT","Prepare approval-ready agreement","DIGITAL_EVENT_MANAGER"],["BANQUET_PACKET","Prepare BEO and operating packet","DIGITAL_BANQUET_COORDINATOR"]].map(([code,title,assigned])=>database().prepare("INSERT INTO event_workflow_tasks VALUES (?,?,?,?,?,'ASSISTED','OPEN',?,'{}',NULL)").bind(crypto.randomUUID(),portfolioId,code,title,assigned,due)),
      database().prepare("INSERT INTO event_documents VALUES (?,?,?,'R123.1',?,'DRAFT','PENDING',NULL,?,?)").bind(crypto.randomUUID(),portfolioId,"DISCOVERY_SUMMARY",JSON.stringify({eventName,eventType,contactName,property:property.name}),now,now),
      database().prepare("INSERT INTO event_communications VALUES (?,?,?,'OUTBOUND',?,'DRAFT','PENDING',NULL,?)").bind(crypto.randomUUID(),portfolioId,"EMAIL",`Thank you for considering ${property.name}. We are preparing your ${eventType.replaceAll('_',' ').toLowerCase()} options and will confirm the remaining details with you.`,now),
      database().prepare("INSERT INTO event_audit_events VALUES (?,?,?,?,?,'USER',? ,?,?)").bind(crypto.randomUUID(),context.organizationId,property.id,portfolioId,"EVENT_PORTFOLIO_CREATED",email,JSON.stringify({leadId,eventType,role,externalMessageSent:false}),now),
    ]);
    return {id:portfolioId,status:"DRAFT_PORTFOLIO_CREATED",externalMessageSent:false};
  }
  if(action==="COMPLETE_TASK") {
    const task=await database().prepare("SELECT t.*,p.organization_id,p.property_id FROM event_workflow_tasks t JOIN event_portfolios p ON p.id=t.portfolio_id WHERE t.id=? AND p.organization_id=? AND p.property_id=?").bind(clean(input.id,100),context.organizationId,property.id).first<any>();
    if(!task)throw new Error("Event task was not found in this property.");
    await database().batch([
      database().prepare("UPDATE event_workflow_tasks SET status='COMPLETE',completed_at=? WHERE id=?").bind(now,task.id),
      database().prepare("INSERT INTO event_audit_events VALUES (?,?,?,?,?,'USER',?,?,?)").bind(crypto.randomUUID(),context.organizationId,property.id,task.portfolio_id,"EVENT_TASK_COMPLETED",email,JSON.stringify({taskId:task.id,taskCode:task.task_code}),now),
    ]); return {id:task.id,status:"COMPLETE"};
  }
  throw new Error("Unsupported Event Workforce action.");
}
