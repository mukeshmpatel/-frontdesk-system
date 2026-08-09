import {env} from "cloudflare:workers";
import {authorizedPropertyScope} from "./property-scope";

const TYPES=["PROPERTY","BUILDING","FLOOR","ROOM","SPACE","EQUIPMENT"] as const;
function db():D1Database{if(!env.DB)throw new Error("Asset registry storage is unavailable.");return env.DB}
async function ensure(){
 db();
}
export async function assetRegistry(userEmail:string){
 await ensure();const scoped=await authorizedPropertyScope(userEmail);if(!scoped)return null;const {context,property}=scoped;
 await db().prepare(`UPDATE operational_work_orders SET asset_id=(SELECT p.id FROM property_assets p
  WHERE p.organization_id=operational_work_orders.organization_id AND p.property_id=operational_work_orders.property_id AND p.asset_type='ROOM'
  AND p.room_number=operational_work_orders.room_number LIMIT 1)
  WHERE organization_id=? AND property_id=? AND asset_id IS NULL AND room_number IS NOT NULL`).bind(context.organizationId,property.id).run();
 const [assets,audit,orders,evidence,velocity,access,imports,assetAttachments]=await Promise.all([
  db().prepare(`SELECT p.*,
   (SELECT COUNT(*) FROM operational_work_orders w WHERE w.organization_id=p.organization_id AND w.asset_id=p.id) work_order_count,
   (SELECT COUNT(*) FROM operational_work_orders w WHERE w.organization_id=p.organization_id AND w.asset_id=p.id AND w.status NOT IN ('COMPLETE','VERIFIED')) open_work_count,
   (SELECT COUNT(*) FROM work_order_attachments a JOIN operational_work_orders w ON w.id=a.work_order_id WHERE w.asset_id=p.id) evidence_count
   FROM property_assets p WHERE p.organization_id=? AND p.property_id=? ORDER BY
   CASE asset_type WHEN 'PROPERTY' THEN 1 WHEN 'BUILDING' THEN 2 WHEN 'FLOOR' THEN 3 WHEN 'ROOM' THEN 4 WHEN 'SPACE' THEN 5 ELSE 6 END,
   code COLLATE NOCASE`).bind(context.organizationId,property.id).all(),
  db().prepare(`SELECT a.event_type eventType,a.detail_json detailJson,a.created_at createdAt,a.actor_email actorEmail,
   p.name assetName,p.code assetCode FROM property_asset_audit a LEFT JOIN property_assets p ON p.id=a.asset_id
   WHERE a.organization_id=? AND a.property_id=? ORDER BY a.created_at DESC LIMIT 100`).bind(context.organizationId,property.id).all(),
  db().prepare(`SELECT id,asset_id,title,department,work_type,status,progress,priority,room_number,assigned_to,due_at,created_at,completed_at
   FROM operational_work_orders WHERE organization_id=? AND property_id=? ORDER BY created_at DESC`).bind(context.organizationId,property.id).all(),
  db().prepare(`SELECT a.id,w.asset_id,a.file_name,a.content_type,a.size_bytes,a.created_at
   FROM work_order_attachments a JOIN operational_work_orders w ON w.id=a.work_order_id WHERE a.organization_id=? AND a.property_id=? ORDER BY a.created_at DESC`).bind(context.organizationId,property.id).all(),
  db().prepare(`SELECT room_number,housekeeper,minutes,completed_at FROM cleaning_velocity_events WHERE organization_id=? AND property_id=? ORDER BY completed_at DESC LIMIT 200`).bind(context.organizationId,property.id).all(),
  db().prepare(`SELECT room_number,facility,decision,reason,occurred_at FROM amenity_access_events WHERE organization_id=? AND property_id=? ORDER BY occurred_at DESC LIMIT 200`).bind(context.organizationId,property.id).all(),
  db().prepare(`SELECT * FROM property_asset_imports WHERE organization_id=? AND property_id=? ORDER BY created_at DESC LIMIT 20`).bind(context.organizationId,property.id).all(),
  db().prepare(`SELECT id,asset_id,file_name,content_type,size_bytes,attachment_type,notes,uploaded_by,created_at
   FROM property_asset_attachments WHERE organization_id=? AND property_id=? ORDER BY created_at DESC`).bind(context.organizationId,property.id).all(),
 ]);
 const all=assets.results as any[],assetIds=new Set(all.map(a=>a.id)),roomCodes=new Set(all.filter(a=>a.asset_type==="ROOM").map(a=>a.room_number||a.code));
 const findings:any[]=[];
 for(const asset of all){
  if(asset.asset_type!=="PROPERTY"&&!asset.parent_id)findings.push({severity:"CRITICAL",assetId:asset.id,title:"Orphaned asset",detail:`${asset.name} is missing a parent location.`,action:"Assign the correct parent."});
  if(asset.parent_id&&!assetIds.has(asset.parent_id))findings.push({severity:"CRITICAL",assetId:asset.id,title:"Broken hierarchy",detail:`${asset.name} references a missing parent.`,action:"Repair its parent relationship."});
  if(asset.asset_type==="ROOM"&&!asset.room_type)findings.push({severity:"MEDIUM",assetId:asset.id,title:"Room type missing",detail:`${asset.name} cannot support room-type reporting.`,action:"Assign a room type."});
  if(asset.asset_type==="EQUIPMENT"&&!asset.serial_number)findings.push({severity:"MEDIUM",assetId:asset.id,title:"Equipment serial number missing",detail:`${asset.name} cannot be uniquely verified.`,action:"Record the manufacturer serial number."});
  if(asset.asset_type==="EQUIPMENT"&&!asset.warranty_expires_at)findings.push({severity:"LOW",assetId:asset.id,title:"Warranty date missing",detail:`${asset.name} has no warranty-expiry tracking.`,action:"Add warranty information."});
 }
 for(const order of orders.results as any[])if(order.room_number&&!order.asset_id&&!roomCodes.has(order.room_number))findings.push({severity:"HIGH",assetId:null,title:"Unregistered work-order room",detail:`${order.title} references Room ${order.room_number}, which is not in the asset registry.`,action:"Create or map the room before closing the order."});
 const serials=new Set<string>();for(const asset of all.filter(a=>a.serial_number)){if(serials.has(asset.serial_number))findings.push({severity:"HIGH",assetId:asset.id,title:"Duplicate equipment serial number",detail:`${asset.serial_number} appears on multiple assets.`,action:"Verify and correct the serial number."});serials.add(asset.serial_number)}
 const integrations=[
  {key:"OPERA_OHIP",name:"OPERA Cloud / OHIP",status:"NOT_CONNECTED",purpose:"Reservations, rooms, folios and room status",nextStep:"Register OHIP application credentials and approve property scope."},
  {key:"TWILIO",name:"Twilio Communications",status:"NOT_CONNECTED",purpose:"SMS alerts, recovery and guest messaging",nextStep:"Add verified sender, webhook URL and approved message templates."},
  {key:"LOCKS",name:"Acculock / Mobile Key",status:"NOT_CONNECTED",purpose:"Door and amenity access events",nextStep:"Confirm vendor API or on-premise gateway protocol."},
  {key:"HVAC",name:"HVAC / Thermostat Gateway",status:"NOT_CONNECTED",purpose:"Temperature and energy automation",nextStep:"Map thermostat IDs to equipment assets and add gateway credentials."},
  {key:"SUPPLIER",name:"Supplier Procurement API",status:"APPROVAL_ONLY_TEST",purpose:"Purchase-order submission",nextStep:"Approve vendor, catalog and spending limits before outbound ordering."},
  {key:"EMAIL",name:"Connected Email Sources",status:"AVAILABLE_PER_ACCOUNT",purpose:"Source-specific intake and notifications",nextStep:"Connect and authorize each mailbox explicitly."},
 ];
 return{role:context.role,property,assets:all,audit:audit.results,orders:orders.results,evidence:evidence.results,velocity:velocity.results,access:access.results,imports:imports.results,assetAttachments:assetAttachments.results,findings,integrations,types:TYPES};
}
export async function createAsset(userEmail:string,input:any){
 await ensure();const scoped=await authorizedPropertyScope(userEmail);if(!scoped||scoped.context.role!=="admin")return null;const {context,property}=scoped;
 const type=String(input.assetType||"").toUpperCase();if(!TYPES.includes(type as any))throw new Error("Choose a valid asset type.");
 const code=String(input.code||"").trim().toUpperCase().slice(0,50),name=String(input.name||"").trim().slice(0,120);
 if(!code||!name)throw new Error("Asset code and name are required.");
 const id=crypto.randomUUID(),now=new Date().toISOString(),parentId=input.parentId||null;
 if(type!=="PROPERTY"&&!parentId)throw new Error(`${type} requires a parent asset.`);
 if(parentId){const parent=await db().prepare(`SELECT id FROM property_assets WHERE id=? AND organization_id=? AND property_id=?`).bind(parentId,context.organizationId,property.id).first();if(!parent)throw new Error("Parent asset is outside the active property.");}
 await db().batch([
  db().prepare(`INSERT INTO property_assets(id,organization_id,property_id,parent_id,asset_type,code,name,description,status,
   floor_number,room_number,room_type,capacity,area_sq_ft,manufacturer,model,serial_number,install_date,warranty_expires_at,
   metadata_json,created_by_email,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
   .bind(id,context.organizationId,property.id,parentId,type,code,name,String(input.description||"").slice(0,1000),
    ["ACTIVE","INACTIVE","OUT_OF_SERVICE"].includes(input.status)?input.status:"ACTIVE",
    input.floorNumber===undefined||input.floorNumber===""?null:Number(input.floorNumber),input.roomNumber||null,input.roomType||null,
    input.capacity?Number(input.capacity):null,input.areaSqFt?Number(input.areaSqFt):null,input.manufacturer||null,input.model||null,
    input.serialNumber||null,input.installDate||null,input.warrantyExpiresAt||null,JSON.stringify(input.metadata??{}),
    context.email,now,now),
  db().prepare(`INSERT INTO property_asset_audit(id,organization_id,property_id,asset_id,actor_email,event_type,detail_json,created_at)
   VALUES (?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),context.organizationId,property.id,id,context.email,"ASSET_CREATED",JSON.stringify({type,code,parentId}),now),
 ]);return{id};
}
export async function bulkCreateRooms(userEmail:string,input:any){
 await ensure();const scoped=await authorizedPropertyScope(userEmail);if(!scoped||scoped.context.role!=="admin")return null;const {context,property}=scoped;
 const floorId=String(input.floorId||""),start=Number(input.start),end=Number(input.end);
 if(!floorId||!Number.isInteger(start)||!Number.isInteger(end)||end<start||end-start>250)throw new Error("Enter a valid floor and room range of 251 rooms or fewer.");
 const floor=await db().prepare(`SELECT id FROM property_assets WHERE id=? AND organization_id=? AND property_id=? AND asset_type='FLOOR'`).bind(floorId,context.organizationId,property.id).first();
 if(!floor)throw new Error("Selected floor was not found.");const now=new Date().toISOString(),statements:D1PreparedStatement[]=[];let created=0;
 for(let room=start;room<=end;room++){const code=String(room);const exists=await db().prepare(`SELECT id FROM property_assets WHERE organization_id=? AND property_id=? AND asset_type='ROOM' AND code=?`).bind(context.organizationId,property.id,code).first();if(exists)continue;
  const id=crypto.randomUUID();statements.push(db().prepare(`INSERT INTO property_assets(id,organization_id,property_id,parent_id,asset_type,code,name,description,status,
   floor_number,room_number,room_type,capacity,area_sq_ft,manufacturer,model,serial_number,install_date,warranty_expires_at,
   metadata_json,created_by_email,created_at,updated_at) VALUES (?,?,?,?,'ROOM',?,?,?,'ACTIVE',NULL,?,?,?,NULL,NULL,NULL,NULL,NULL,NULL,'{}',?,?,?)`)
   .bind(id,context.organizationId,property.id,floorId,code,`Room ${code}`,"Guest room",code,input.roomType||"STANDARD",input.capacity?Number(input.capacity):2,context.email,now,now));
  statements.push(db().prepare(`INSERT INTO property_asset_audit(id,organization_id,property_id,asset_id,actor_email,event_type,detail_json,created_at)
   VALUES (?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),context.organizationId,property.id,id,context.email,"ROOM_BULK_CREATED",JSON.stringify({floorId,code}),now));created++}
 if(statements.length)await db().batch(statements);return{created};
}
export async function updateAsset(userEmail:string,input:any){
 await ensure();const scoped=await authorizedPropertyScope(userEmail);if(!scoped||scoped.context.role!=="admin")return null;const {context,property}=scoped;const id=String(input.id||""),now=new Date().toISOString();
 await db().batch([
  db().prepare(`UPDATE property_assets SET name=?,description=?,status=?,room_type=?,capacity=?,area_sq_ft=?,
   manufacturer=?,model=?,serial_number=?,install_date=?,warranty_expires_at=?,updated_at=?
   WHERE id=? AND organization_id=? AND property_id=?`).bind(String(input.name||"").trim().slice(0,120),String(input.description||"").slice(0,1000),
   ["ACTIVE","INACTIVE","OUT_OF_SERVICE"].includes(input.status)?input.status:"ACTIVE",input.roomType||null,input.capacity?Number(input.capacity):null,
   input.areaSqFt?Number(input.areaSqFt):null,input.manufacturer||null,input.model||null,input.serialNumber||null,input.installDate||null,
   input.warrantyExpiresAt||null,now,id,context.organizationId,property.id),
  db().prepare(`INSERT INTO property_asset_audit(id,organization_id,property_id,asset_id,actor_email,event_type,detail_json,created_at)
   SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM property_assets WHERE id=? AND organization_id=? AND property_id=?)`).bind(crypto.randomUUID(),context.organizationId,property.id,id,context.email,"ASSET_UPDATED",JSON.stringify({status:input.status}),now,id,context.organizationId,property.id),
 ]);return{updated:true};
}

export async function importAssets(userEmail:string,input:any){
 await ensure();const scoped=await authorizedPropertyScope(userEmail);if(!scoped||scoped.context.role!=="admin")return null;const {context,property}=scoped;
 const rows=Array.isArray(input.rows)?input.rows.slice(0,1000):[];if(!rows.length)throw new Error("No validated import rows were supplied.");
 const now=new Date().toISOString(),byCode=new Map<string,string>();const existing=await db().prepare("SELECT id,code FROM property_assets WHERE organization_id=? AND property_id=?").bind(context.organizationId,property.id).all<any>();
 for(const row of existing.results)byCode.set(String(row.code).toUpperCase(),row.id);let created=0,skipped=0;const audits:D1PreparedStatement[]=[];
 for(const raw of rows){
  const type=String(raw.assetType||raw.type||"").trim().toUpperCase(),code=String(raw.code||"").trim().toUpperCase().slice(0,50),name=String(raw.name||"").trim().slice(0,120);
  if(!TYPES.includes(type as any)||!code||!name||byCode.has(code)){skipped++;continue}
  const parentCode=String(raw.parentCode||"").trim().toUpperCase(),parentId=type==="PROPERTY"?null:byCode.get(parentCode);if(type!=="PROPERTY"&&!parentId){skipped++;continue}
  const id=crypto.randomUUID();await db().prepare(`INSERT INTO property_assets(id,organization_id,property_id,parent_id,asset_type,code,name,description,status,
   floor_number,room_number,room_type,capacity,area_sq_ft,manufacturer,model,serial_number,install_date,warranty_expires_at,
   metadata_json,created_by_email,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,'ACTIVE',?,?,?,?,?,?,?,?,?,?,'{}',?,?,?)`)
   .bind(id,context.organizationId,property.id,parentId,type,code,name,String(raw.description||"").slice(0,1000),raw.floorNumber?Number(raw.floorNumber):null,
    type==="ROOM"?(raw.roomNumber||code):null,raw.roomType||null,raw.capacity?Number(raw.capacity):null,raw.areaSqFt?Number(raw.areaSqFt):null,
    raw.manufacturer||null,raw.model||null,raw.serialNumber||null,raw.installDate||null,raw.warrantyExpiresAt||null,context.email,now,now).run();
  byCode.set(code,id);created++;audits.push(db().prepare(`INSERT INTO property_asset_audit(id,organization_id,property_id,asset_id,actor_email,event_type,detail_json,created_at)
   VALUES (?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),context.organizationId,property.id,id,context.email,"ASSET_IMPORTED",JSON.stringify({type,code,parentCode}),now));
 }
 const importId=crypto.randomUUID();audits.push(db().prepare(`INSERT INTO property_asset_imports(id,organization_id,property_id,file_name,row_count,created_count,skipped_count,status,imported_by,created_at)
  VALUES (?,?,?,?,?,?,?,'COMPLETED',?,?)`).bind(importId,context.organizationId,property.id,String(input.fileName||"property-assets.csv").slice(0,180),rows.length,created,skipped,context.email,now));
 if(audits.length)await db().batch(audits);return{importId,created,skipped};
}

export async function saveAssetAttachment(userEmail:string,assetId:string,file:{name:string;type:string;size:number},objectKey:string,attachmentType:string,notes:string){
 await ensure();const scoped=await authorizedPropertyScope(userEmail);if(!scoped)return null;const {context,property}=scoped;
 const asset=await db().prepare("SELECT id FROM property_assets WHERE id=? AND organization_id=? AND property_id=?").bind(assetId,context.organizationId,property.id).first();if(!asset)return null;
 const id=crypto.randomUUID(),now=new Date().toISOString(),kind=["PHOTO","WARRANTY","MANUAL","INVOICE","SERIAL_PLATE","OTHER"].includes(attachmentType)?attachmentType:"PHOTO";
 await db().batch([
  db().prepare(`INSERT INTO property_asset_attachments(id,organization_id,property_id,asset_id,object_key,file_name,content_type,size_bytes,attachment_type,notes,uploaded_by,created_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,context.organizationId,property.id,assetId,objectKey,file.name.slice(0,180),file.type||"application/octet-stream",file.size,kind,notes.slice(0,500),context.email,now),
  db().prepare(`INSERT INTO property_asset_audit(id,organization_id,property_id,asset_id,actor_email,event_type,detail_json,created_at)
   VALUES (?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),context.organizationId,property.id,assetId,context.email,"ASSET_EVIDENCE_ATTACHED",JSON.stringify({attachmentType:kind,fileName:file.name}),now),
 ]);return{id};
}
export async function assetAttachmentForUser(userEmail:string,id:string){await ensure();const scoped=await authorizedPropertyScope(userEmail);if(!scoped)return null;return db().prepare("SELECT * FROM property_asset_attachments WHERE id=? AND organization_id=? AND property_id=?").bind(id,scoped.context.organizationId,scoped.property.id).first<any>()}
