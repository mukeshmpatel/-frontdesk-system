import { env } from "cloudflare:workers";
import { activeStaffContext } from "./staff";
import { emitReportEvent } from "./reporting-layer";
import { authorizedPropertyScope } from "./property-scope";

function db():D1Database{if(!env.DB)throw new Error("OTA reconciliation storage is unavailable.");return env.DB}
async function ensure(){
  db();
}
async function otaScope(email:string){
  const context=await activeStaffContext(email),scoped=await authorizedPropertyScope(email);
  if(!context||!scoped||context.organizationId!==scoped.context.organizationId)return null;
  return{context,propertyId:scoped.property.id};
}
const aliases:Record<string,string[]>={
  externalId:["externalid","external_id","reservationid","bookingid","otaid"],
  confirmation:["confirmation","confirmationnumber","confirmation_number","hotelconfirmation","pmsconfirmation"],
  guest:["guest","guestname","guest_name","name"],arrival:["arrival","arrivaldate","arrival_date","checkin","check_in"],
  departure:["departure","departuredate","departure_date","checkout","check_out"],
  roomType:["roomtype","room_type","roomcategory","accommodation"],
  status:["status","reservationstatus","bookingstatus"],gross:["gross","grossamount","gross_amount","total","reservationtotal","revenue"],
  commission:["commission","commissionamount","commission_amount","otacommission"],currency:["currency","currencycode"],
};
function norm(v:string){return v.toLowerCase().replace(/[^a-z0-9_]/g,"")}
function money(v:unknown){const n=Number(String(v??"0").replace(/[$,%()\s,]/g,""));return Number.isFinite(n)?n:0}
function parse(text:string){
  const lines=text.split(/\r?\n/).map(v=>v.trim()).filter(Boolean).slice(0,10001);if(lines.length<2)throw new Error("Reservation file needs a header and data rows.");
  const delimiter=lines[0].includes("\t")?"\t":lines[0].includes("|")?"|":",",split=(line:string)=>line.split(delimiter).map(v=>v.trim().replace(/^"|"$/g,""));
  const headers=split(lines[0]),idx=Object.fromEntries(Object.entries(aliases).map(([key,list])=>[key,headers.findIndex(h=>list.includes(norm(h)))]));
  for(const key of ["externalId","arrival","departure"])if(idx[key]<0)throw new Error(`AAIQ could not map the required ${key} column.`);
  const exceptions:string[]=[];const rows=lines.slice(1).flatMap((line,rowIndex)=>{const c=split(line),get=(key:string)=>idx[key]>=0?c[idx[key]]??"":"";
    const externalId=get("externalId"),arrival=new Date(get("arrival")),departure=new Date(get("departure"));
    if(!externalId||Number.isNaN(arrival.getTime())||Number.isNaN(departure.getTime())){exceptions.push(`Row ${rowIndex+2}: missing reservation ID or valid stay dates.`);return[]}
    return[{externalId,confirmation:get("confirmation")||externalId,guest:get("guest")||"Guest",arrival:arrival.toISOString().slice(0,10),departure:departure.toISOString().slice(0,10),
      roomType:get("roomType")||"UNMAPPED",status:(get("status")||"RESERVED").toUpperCase().replace(/\s+/g,"_"),gross:money(get("gross")),commission:money(get("commission")),currency:get("currency")||"USD"}]});
  return{rows,exceptions};
}
export async function otaCenter(email:string){
  const scoped=await otaScope(email);if(!scoped)return null;const {context,propertyId}=scoped;await ensure();
  const [records,runs,exceptions,roomTypes]=await Promise.all([
    db().prepare(`SELECT source,COUNT(*) count,COALESCE(SUM(gross_amount),0) gross,COALESCE(SUM(commission_amount),0) commission,
      MAX(imported_at) last_import FROM distribution_reservation_records WHERE organization_id=? AND property_id=? GROUP BY source ORDER BY source`).bind(context.organizationId,propertyId).all(),
    db().prepare("SELECT * FROM ota_reconciliation_runs WHERE organization_id=? AND property_id=? ORDER BY run_at DESC LIMIT 20").bind(context.organizationId,propertyId).all(),
    db().prepare("SELECT * FROM ota_reconciliation_exceptions WHERE organization_id=? AND property_id=? ORDER BY CASE severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 ELSE 3 END,created_at DESC LIMIT 500").bind(context.organizationId,propertyId).all(),
    db().prepare(`SELECT room_type,COUNT(*) room_count FROM property_assets WHERE organization_id=? AND property_id=? AND asset_type='ROOM' AND room_type IS NOT NULL GROUP BY room_type ORDER BY room_type`).bind(context.organizationId,propertyId).all(),
  ]);
  return{role:context.role,propertyId,records:records.results,runs:runs.results,exceptions:exceptions.results,roomTypes:roomTypes.results};
}
export async function importReservations(email:string,source:string,fileName:string,text:string){
  const scoped=await otaScope(email);if(!scoped||scoped.context.role!=="admin")return null;const {context,propertyId}=scoped;await ensure();
  const safeSource=["PMS","WYNDHAM","BOOKING_COM","EXPEDIA","OTHER_OTA"].includes(source)?source:"OTHER_OTA",parsed=parse(text),now=new Date().toISOString();
  const statements=parsed.rows.map(row=>db().prepare(`INSERT INTO distribution_reservation_records
    (id,organization_id,property_id,source,external_id,confirmation_number,guest_name,arrival_date,departure_date,room_type,status,
     gross_amount,commission_amount,currency,source_file,imported_by,imported_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(organization_id,source,external_id) DO UPDATE SET confirmation_number=excluded.confirmation_number,
     guest_name=excluded.guest_name,arrival_date=excluded.arrival_date,departure_date=excluded.departure_date,
     room_type=excluded.room_type,status=excluded.status,gross_amount=excluded.gross_amount,
     commission_amount=excluded.commission_amount,currency=excluded.currency,source_file=excluded.source_file,
     imported_by=excluded.imported_by,imported_at=excluded.imported_at,property_id=excluded.property_id`)
    .bind(crypto.randomUUID(),context.organizationId,propertyId,safeSource,row.externalId,row.confirmation,row.guest,row.arrival,row.departure,row.roomType,row.status,row.gross,row.commission,row.currency,fileName.slice(0,180),email,now));
  if(statements.length)await db().batch(statements);
  return{source:safeSource,imported:parsed.rows.length,exceptions:parsed.exceptions};
}
export async function runOtaReconciliation(email:string,start:string,end:string){
  const scoped=await otaScope(email);if(!scoped||scoped.context.role!=="admin")return null;const {context,propertyId}=scoped;await ensure();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||start>end)throw new Error("Select a valid reconciliation period.");
  const records=await db().prepare(`SELECT * FROM distribution_reservation_records WHERE organization_id=? AND property_id=?
    AND arrival_date<=? AND departure_date>=? ORDER BY source,external_id`).bind(context.organizationId,propertyId,end,start).all<Record<string,any>>();
  const pms=records.results.filter(r=>r.source==="PMS"),otas=records.results.filter(r=>r.source!=="PMS"),byConfirmation=new Map(pms.map(r=>[String(r.confirmation_number).toUpperCase(),r]));
  const validTypes=new Set((await db().prepare(`SELECT DISTINCT upper(room_type) room_type FROM property_assets
    WHERE organization_id=? AND property_id=? AND asset_type='ROOM' AND room_type IS NOT NULL`).bind(context.organizationId,propertyId).all<{room_type:string}>()).results.map(r=>r.room_type));
  const findings:Array<Record<string,any>>=[];let matched=0;
  for(const ota of otas){
    const match=byConfirmation.get(String(ota.confirmation_number).toUpperCase());
    if(!match){findings.push({type:"MISSING_IN_PMS",severity:"CRITICAL",record:ota,summary:`${ota.source} reservation ${ota.confirmation_number} is missing from PMS.`});continue}
    matched++;
    if(match.status!==ota.status)findings.push({type:"STATUS_MISMATCH",severity:"HIGH",record:ota,summary:`Status differs: ${ota.source} ${ota.status}; PMS ${match.status}.`,match});
    if(match.arrival_date!==ota.arrival_date||match.departure_date!==ota.departure_date)findings.push({type:"DATE_MISMATCH",severity:"HIGH",record:ota,summary:`Stay dates do not match PMS for ${ota.confirmation_number}.`,match});
    if(norm(match.room_type)!==norm(ota.room_type))findings.push({type:"ROOM_TYPE_MISMATCH",severity:"MEDIUM",record:ota,summary:`Room type differs: ${ota.source} ${ota.room_type}; PMS ${match.room_type}.`,match});
    if(Math.abs(Number(match.gross_amount)-Number(ota.gross_amount))>1)findings.push({type:"AMOUNT_MISMATCH",severity:"HIGH",record:ota,summary:`Amount differs by $${Math.abs(Number(match.gross_amount)-Number(ota.gross_amount)).toFixed(2)}.`,match});
    if(validTypes.size&&!validTypes.has(String(ota.room_type).toUpperCase()))findings.push({type:"UNMAPPED_ROOM_TYPE",severity:"MEDIUM",record:ota,summary:`${ota.room_type} is not mapped to the canonical room inventory.`});
  }
  const duplicateGroups=new Map<string,Record<string,any>[]>();for(const ota of otas){const key=String(ota.confirmation_number).toUpperCase(),group=duplicateGroups.get(key)??[];group.push(ota);duplicateGroups.set(key,group)}
  for(const group of duplicateGroups.values())if(group.length>1)findings.push({type:"DUPLICATE_CHANNEL_BOOKING",severity:"CRITICAL",record:group[0],summary:`Confirmation ${group[0].confirmation_number} appears in ${group.map(r=>r.source).join(", ")}.`});
  const gross=otas.reduce((s,r)=>s+Number(r.gross_amount),0),commission=otas.reduce((s,r)=>s+Number(r.commission_amount),0),runId=crypto.randomUUID(),now=new Date().toISOString();
  await db().batch([
    db().prepare(`INSERT INTO ota_reconciliation_runs
      (id,organization_id,property_id,period_start,period_end,pms_count,ota_count,matched_count,exception_count,gross_amount,
       commission_amount,net_amount,status,run_by,run_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'COMPLETED',?,?)`)
      .bind(runId,context.organizationId,propertyId,start,end,pms.length,otas.length,matched,findings.length,gross,commission,gross-commission,email,now),
    ...findings.map(f=>db().prepare(`INSERT INTO ota_reconciliation_exceptions
      (id,organization_id,property_id,run_id,exception_type,severity,source,external_id,confirmation_number,summary,detail_json,status,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,'OPEN',?)`).bind(crypto.randomUUID(),context.organizationId,propertyId,runId,f.type,f.severity,f.record.source,f.record.external_id,f.record.confirmation_number,f.summary,JSON.stringify({source:f.record,match:f.match??null}),now)),
  ]);
  await emitReportEvent({organizationId:context.organizationId,propertyId,sourceModule:"OTA_RECONCILIATION",eventType:"OTA_RECONCILIATION_COMPLETED",entityType:"reconciliation_run",entityId:runId,idempotencyKey:`ota-run:${runId}`,occurredAt:now,payload:{start,end,matched,exceptions:findings.length,gross,commission}});
  return{runId,pmsCount:pms.length,otaCount:otas.length,matched,exceptions:findings.length,gross,commission,net:gross-commission};
}
export async function resolveOtaException(email:string,id:string,note:string){
  const scoped=await otaScope(email);if(!scoped||scoped.context.role!=="admin")return null;const {context,propertyId}=scoped;await ensure();const now=new Date().toISOString();
  await db().prepare(`UPDATE ota_reconciliation_exceptions SET status='RESOLVED',resolution_note=?,resolved_at=?,resolved_by=?
    WHERE id=? AND organization_id=? AND property_id=?`).bind(note.slice(0,1000),now,email,id,context.organizationId,propertyId).run();return{id,status:"RESOLVED"};
}
