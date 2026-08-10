import { env } from "cloudflare:workers";
import { activeStaffContext } from "./staff";
function db():D1Database{if(!env.DB)throw new Error("Memory storage is unavailable.");return env.DB}
async function ensure(){
  db();
}
export async function saveAgentMemory(userEmail:string,input:{title:string;content:string;sourceType?:string;sourceAccount?:string;occurredAt?:string;tags?:string[]}){
  await ensure();const context=await activeStaffContext(userEmail);if(!context)return null;
  const now=new Date(),occurred=new Date(input.occurredAt||now);if(Number.isNaN(occurred.getTime()))throw new Error("Choose a valid memory date.");
  const retention=new Date(occurred);retention.setFullYear(retention.getFullYear()+3);
  const id=crypto.randomUUID();await db().prepare(`INSERT INTO agent_memories
    (id,organization_id,owner_email,title,content,source_type,source_account,source_record_id,occurred_at,retention_until,tags_json,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,context.organizationId,context.email,input.title.trim().slice(0,140),
      input.content.trim().slice(0,12000),input.sourceType||"MANUAL",input.sourceAccount?.trim().slice(0,140)||"",null,
      occurred.toISOString(),retention.toISOString(),JSON.stringify(input.tags??[]),now.toISOString(),now.toISOString()).run();
  return{id};
}
export async function recallAgentMemory(userEmail:string,query="",source="ALL",from?:string,to?:string){
  await ensure();const context=await activeStaffContext(userEmail);if(!context)return null;
  const retention=(date:string)=>{const value=new Date(date);value.setFullYear(value.getFullYear()+3);return value.toISOString()};
  const now=new Date().toISOString();
  try{
    const [reminders,sources,media]=await Promise.all([
      db().prepare(`SELECT id,title,note,source_type,source_label,scheduled_at FROM reminders WHERE lower(user_email)=?`)
        .bind(context.email).all<any>(),
      db().prepare(`SELECT id,subject,raw_content,source,source_account,received_at FROM notification_source_events
        WHERE organization_id=? AND lower(owner_email)=?`).bind(context.organizationId,context.email).all<any>(),
      db().prepare(`SELECT id,title,content_type,created_at FROM media_memories WHERE lower(user_email)=?`)
        .bind(context.email).all<any>(),
    ]);
    const statements=[
      ...reminders.results.map(row=>db().prepare(`INSERT OR IGNORE INTO agent_memories
        (id,organization_id,owner_email,title,content,source_type,source_account,source_record_id,occurred_at,retention_until,tags_json,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(`reminder-${row.id}`,context.organizationId,context.email,row.title,row.note||row.title,
          String(row.source_type||"REMINDER").toUpperCase(),row.source_label||"",row.id,row.scheduled_at,retention(row.scheduled_at),"[]",now,now)),
      ...sources.results.map(row=>db().prepare(`INSERT OR IGNORE INTO agent_memories
        (id,organization_id,owner_email,title,content,source_type,source_account,source_record_id,occurred_at,retention_until,tags_json,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(`source-${row.id}`,context.organizationId,context.email,row.subject||"Connected source",
          row.raw_content,row.source,row.source_account,row.id,row.received_at,retention(row.received_at),"[]",now,now)),
      ...media.results.map(row=>db().prepare(`INSERT OR IGNORE INTO agent_memories
        (id,organization_id,owner_email,title,content,source_type,source_account,source_record_id,occurred_at,retention_until,tags_json,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(`media-${row.id}`,context.organizationId,context.email,row.title,
          `Saved ${row.content_type} memory. Open the cited media record for playback.`,"VIDEO","AAI Q media",row.id,row.created_at,retention(row.created_at),"[]",now,now)),
    ];
    if(statements.length)await db().batch(statements);
  }catch{/* A source module may not be initialized yet; manual memory remains available. */}
  const start=from?new Date(from).toISOString():new Date(Date.now()-3*365*86_400_000).toISOString();
  const end=to?new Date(`${to}T23:59:59.999Z`).toISOString():new Date().toISOString();
  const terms=query.toLowerCase().split(/\s+/).filter(term=>term.length>2).slice(0,8);
  const clauses=["organization_id=?","lower(owner_email)=?","occurred_at>=?","occurred_at<=?"];
  const args:unknown[]=[context.organizationId,context.email,start,end];
  if(source!=="ALL"){clauses.push("source_type=?");args.push(source)}
  if(terms.length){clauses.push(`(${terms.map(()=>"(lower(title) LIKE ? OR lower(content) LIKE ? OR lower(tags_json) LIKE ?)").join(" OR ")})`);
    terms.forEach(term=>args.push(`%${term}%`,`%${term}%`,`%${term}%`))}
  const result=await db().prepare(`SELECT id,title,content,source_type AS sourceType,source_account AS sourceAccount,
    occurred_at AS occurredAt,tags_json AS tagsJson,retention_until AS retentionUntil FROM agent_memories
    WHERE ${clauses.join(" AND ")} ORDER BY occurred_at DESC LIMIT 50`).bind(...args).all<any>();
  const memories=result.results.map(row=>({...row,tags:JSON.parse(row.tagsJson||"[]")}));
  const answer=memories.length?`I found ${memories.length} relevant ${memories.length===1?"memory":"memories"}. The most recent is “${memories[0].title}” from ${new Date(memories[0].occurredAt).toLocaleDateString("en-US")}. Review the cited records below for exact context.`:
    "I could not find a matching memory in the selected period. Try another phrase, source, or wider date range.";
  return{answer,memories,range:{from:start,to:end},retentionYears:3};
}
