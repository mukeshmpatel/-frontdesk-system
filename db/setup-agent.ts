import {env} from "cloudflare:workers";
import {activeStaffContext,inviteStaffMembers} from "./staff";
import {importAssets} from "./property-assets";
import {updateAccessUser} from "./access-management";
import {createPropertyContext} from "./enterprise-operations";

function db():D1Database{if(!env.DB)throw new Error("AAIQ Setup Agent storage is unavailable.");return env.DB}
async function ensure(){db()}
const clean=(value:string)=>value.trim().replace(/\s+/g," ");
function propertyPlan(instruction:string){
 const rooms=Number(instruction.match(/\b(\d{1,4})\s*(?:guest\s*)?rooms?\b/i)?.[1]||0);
 const address=clean(instruction.match(/(?:located at|address(?: is)?)[\s:]+(.+?)(?:(?:\.|,)\s*(?:called|named|with)|$)/i)?.[1]||"");
 const named=instruction.match(/((?:Wyndham|Holiday|Hampton|Hilton|Marriott|Hyatt|Quality|Comfort|Best Western|Days Inn)[^,.]*?(?:Center|Hotel|Inn|Suites|Resort)?)(?:[,.]|$)/i)?.[1];
 const name=clean(named||instruction.match(/(?:called|named)\s+([^,.]+)/i)?.[1]||"");
 const questions=[] as string[];if(!name)questions.push("What is the official property name?");if(!rooms)questions.push("How many guest rooms should AAIQ create?");
 const floorCount=rooms>160?3:rooms>0?2:0,firstFloor=Math.ceil(rooms/Math.max(floorCount,1));
 const rows:any[]=[];if(name&&rooms){
  const propertyCode=name.toUpperCase().replace(/[^A-Z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,20)||"PROPERTY";
  rows.push({assetType:"PROPERTY",code:propertyCode,name,parentCode:"",description:address?`Official address: ${address}`:"Address pending verification"});
  rows.push({assetType:"BUILDING",code:"MAIN",name:"Main Hotel Building",parentCode:propertyCode,description:"Primary guestroom and operations building"});
  let remaining=rooms;
  for(let floor=1;floor<=floorCount;floor++){const count=floor===floorCount?remaining:firstFloor;remaining-=count;const floorCode=`F${floor}`;rows.push({assetType:"FLOOR",code:floorCode,name:`Floor ${floor}`,parentCode:"MAIN",floorNumber:floor});
   for(let n=1;n<=count;n++){const roomNumber=`${floor}${String(n).padStart(2,"0")}`,roomCode=roomNumber;rows.push({assetType:"ROOM",code:roomCode,name:`Room ${roomNumber}`,parentCode:floorCode,roomNumber,roomType:"STANDARD",capacity:2});
    [["HVAC","HVAC / PTAC Unit"],["TV","Guestroom Television"],["IRON","Iron and Ironing Board"],["COFFEE","Coffee Maker"]].forEach(([prefix,label])=>rows.push({assetType:"EQUIPMENT",code:`${prefix}-${roomNumber}`,name:`${label} — Room ${roomNumber}`,parentCode:roomCode,description:"Common guestroom equipment template; maintenance manager should add photo, manufacturer, model, serial number and warranty."}));
   }
  }
  [["LOBBY","Lobby"],["FRONT-DESK","Front Desk"],["LAUNDRY","Laundry"],["POOL","Indoor Pool"],["FITNESS","Fitness Center"],["RESTAURANT","Restaurant"],["BAR","Bar"],["KITCHEN","Commercial Kitchen"],["BALLROOM","Conference / Ballroom"],["MEETING","Meeting Rooms"],["MARKET","Marketplace"]].forEach(([code,label])=>rows.push({assetType:"SPACE",code,name:label,parentCode:"MAIN"}));
 }
 return{setupType:"PROPERTY",questions,assumptions:[
  floorCount?`${floorCount} floors with rooms distributed as evenly as possible.`:"Floor count will be selected after room count is known.",
  "Default room numbers use floor + two-digit sequence (101, 102 … 201, 202).",
  "Every guest room receives HVAC/PTAC, television, iron/board and coffee-maker asset records.",
  "Common hotel spaces are included and remain fully editable before and after approval.",
 ],summary:name&&rooms?`Build ${name} with ${rooms} rooms, ${floorCount} floors, ${rows.filter(r=>r.assetType==="SPACE").length} common spaces and ${rows.filter(r=>r.assetType==="EQUIPMENT").length} guestroom equipment records.`:"More information is required before AAIQ can prepare a safe property plan.",rows,details:{name,address,rooms,floorCount}};
}
function userPlan(instruction:string){
 const email=instruction.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase()||"";
 const department=/housekeep/i.test(instruction)?"HOUSEKEEPING":/maint/i.test(instruction)?"MAINTENANCE":/executive|general manager|agm|gm\b/i.test(instruction)?"EXECUTIVE":"FRONT_DESK";
 const tier=/corporate/i.test(instruction)?"CORPORATE":/manager|agm|gm\b/i.test(instruction)?"MANAGER":/supervisor|lead/i.test(instruction)?"SUPERVISOR":"ASSOCIATE";
 const name=clean(instruction.match(/(?:create|add|invite)\s+(?:a\s+)?(?:user|employee|staff)?\s*([A-Za-z][A-Za-z .'-]+?)(?=\s+(?:as|to|for|email|at)\b|,|$)/i)?.[1]||"New employee");
 const questions=[] as string[];if(!email)questions.push(`What is ${name}'s work email address?`);
 return{setupType:"USER",questions,assumptions:[`Department: ${department.replaceAll("_"," ")}.`,`Role tier: ${tier}.`,"MFA will be required for managers, corporate staff and identity administrators.","The user receives least-privilege module access and can be modified by an administrator."],summary:email?`Invite ${name} (${email}) as ${department.replaceAll("_"," ")} ${tier}.`:"A work email is required before the invitation can be created.",rows:[],details:{name,email,department,tier,mfaRequired:["MANAGER","CORPORATE"].includes(tier)}};
}
export async function createSetupPlan(userEmail:string,instruction:string,inputMode:string){
 await ensure();const context=await activeStaffContext(userEmail);if(!context||context.role!=="admin")return null;
 const text=clean(instruction).slice(0,8000);if(!text)throw new Error("Tell AAIQ what you want to build.");
 const plan=/\b(user|employee|staff|front desk|housekeep|maintenance manager)\b/i.test(text)&&!/\b(property|hotel|rooms?|building)\b/i.test(text)?userPlan(text):propertyPlan(text);
 const id=crypto.randomUUID(),now=new Date().toISOString(),status=plan.questions.length?"NEEDS_INPUT":"READY_FOR_APPROVAL";
 await db().prepare(`INSERT INTO ai_setup_sessions(id,organization_id,actor_email,input_mode,instruction,setup_type,status,plan_json,questions_json,assumptions_json,created_at,updated_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,context.organizationId,context.email,["TEXT","VOICE","VIDEO"].includes(inputMode)?inputMode:"TEXT",text,plan.setupType,status,JSON.stringify(plan),JSON.stringify(plan.questions),JSON.stringify(plan.assumptions),now,now).run();
 return{id,status,...plan};
}
export async function approveSetupPlan(userEmail:string,id:string){
 await ensure();const context=await activeStaffContext(userEmail);if(!context||context.role!=="admin")return null;
 const row=await db().prepare("SELECT * FROM ai_setup_sessions WHERE id=? AND organization_id=?").bind(id,context.organizationId).first<any>();if(!row)throw new Error("Setup plan was not found.");
 if(row.status!=="READY_FOR_APPROVAL")throw new Error("Answer the open questions before approving this plan.");const plan=JSON.parse(row.plan_json),now=new Date().toISOString();let outcome:any;
 if(plan.setupType==="PROPERTY"){
  const propertyCode=String(plan.rows?.find((item:any)=>item.assetType==="PROPERTY")?.code||"PROPERTY");
  const canonical=await createPropertyContext(userEmail,{code:propertyCode,name:plan.details.name,address:plan.details.address||"Address pending verification",timezone:"America/Chicago",databaseMode:"SHARED_DATABASE"});
  if(!canonical)throw new Error("The canonical property could not be created.");
  const assets=await importAssets(userEmail,{rows:plan.rows,fileName:`AAIQ AI Setup ${id}.json`,propertyId:canonical.id});
  outcome={...assets,propertyId:canonical.id,propertyCode,propertyName:plan.details.name};
 }
 else{const details=plan.details;if(!details.email)throw new Error("A work email is required.");await inviteStaffMembers(userEmail,[details.email]);await updateAccessUser(userEmail,details.email,{department:details.department,roleTier:details.tier,mfaRequired:details.mfaRequired,accessStatus:"ACTIVE",modules:details.department==="EXECUTIVE"?["AAIQ_HOME","AAIQ_ACTION_CENTER","AAIQ_REPORTING","AAIQ_PROPERTY_INTELLIGENCE","AAIQ_TIME_MANAGEMENT"]:["AAIQ_HOME","AAIQ_ACTION_CENTER","AAIQ_TIME_MANAGEMENT",...(details.department==="HOUSEKEEPING"||details.department==="MAINTENANCE"?["AAIQ_PROPERTY_OPERATIONS"]:[])]});outcome={invited:1,email:details.email}}
 await db().prepare("UPDATE ai_setup_sessions SET status='EXECUTED',approved_at=?,executed_at=?,updated_at=? WHERE id=?").bind(now,now,now,id).run();return{executed:true,setupType:plan.setupType,outcome};
}
