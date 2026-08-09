import { env } from "cloudflare:workers";
import { activeStaffContext } from "./staff";
import { authorizedPropertyScope } from "./property-scope";

function db(): D1Database {
  if (!env.DB) throw new Error("AAIQ property intelligence storage is unavailable.");
  return env.DB;
}

async function ensureTables() {
  db();
}

async function propertyIdFor(organizationId:string,email:string,requestedPropertyId?:string){
 const scoped=await authorizedPropertyScope(email,requestedPropertyId||null);
 if(!scoped||scoped.context.organizationId!==organizationId){
  throw new Error("Inventory access to the selected property is not permitted.");
 }
 return scoped.property.id;
}

export async function propertyIntelligence(email: string,requestedPropertyId?:string) {
  const context = await activeStaffContext(email);
  if (!context) return null;
  await ensureTables();
  const now = new Date().toISOString();
  const propertyId=await propertyIdFor(context.organizationId,context.email,requestedPropertyId);
  const defaultLocation=await db().prepare("SELECT id FROM inventory_locations WHERE organization_id=? AND property_id=? ORDER BY created_at LIMIT 1").bind(context.organizationId,propertyId).first<{id:string}>();
  let locationId=defaultLocation?.id;
  if(!locationId){locationId=crypto.randomUUID();await db().prepare(`INSERT INTO inventory_locations VALUES (?,?,?,?,?,'HOUSEKEEPING','STOREROOM','ACTIVE',?)`).bind(locationId,context.organizationId,propertyId,"MAIN-STOCK","Main Property Storeroom",now).run()}
  const [inventory, orders, access, velocity, transactions, requisitions, vendors,locations,purchaseOrders,poLines,countSessions] = await Promise.all([
    db().prepare("SELECT * FROM supply_inventory WHERE organization_id = ? AND property_id=? ORDER BY category, name").bind(context.organizationId,propertyId).all(),
    db().prepare(`SELECT d.* FROM supply_order_drafts d JOIN supply_inventory i ON i.organization_id=d.organization_id AND i.sku=d.sku
      WHERE d.organization_id=? AND i.property_id=? ORDER BY d.created_at DESC LIMIT 20`).bind(context.organizationId,propertyId).all(),
    db().prepare("SELECT * FROM amenity_access_events WHERE organization_id = ? AND property_id=? ORDER BY occurred_at DESC LIMIT 20").bind(context.organizationId,propertyId).all(),
    db().prepare(`SELECT housekeeper, COUNT(*) rooms, ROUND(AVG(minutes),1) average_minutes,
      MIN(minutes) fastest_minutes, MAX(minutes) slowest_minutes
      FROM cleaning_velocity_events WHERE organization_id = ? AND property_id=? GROUP BY housekeeper ORDER BY average_minutes ASC`)
      .bind(context.organizationId,propertyId).all(),
    db().prepare("SELECT * FROM inventory_transactions WHERE organization_id=? AND property_id=? ORDER BY created_at DESC LIMIT 50").bind(context.organizationId,propertyId).all(),
    db().prepare("SELECT * FROM inventory_requisitions WHERE organization_id=? AND property_id=? ORDER BY created_at DESC LIMIT 50").bind(context.organizationId,propertyId).all(),
    db().prepare("SELECT * FROM inventory_vendors WHERE organization_id=? AND property_id=? ORDER BY name").bind(context.organizationId,propertyId).all(),
    db().prepare("SELECT * FROM inventory_locations WHERE organization_id=? AND property_id=? ORDER BY name").bind(context.organizationId,propertyId).all(),
    db().prepare(`SELECT p.*,v.name vendor_name FROM inventory_purchase_orders p LEFT JOIN inventory_vendors v ON v.id=p.vendor_id
      WHERE p.organization_id=? AND p.property_id=? ORDER BY p.created_at DESC`).bind(context.organizationId,propertyId).all(),
    db().prepare(`SELECT l.* FROM inventory_purchase_order_lines l JOIN inventory_purchase_orders p ON p.id=l.purchase_order_id
      WHERE l.organization_id=? AND p.property_id=? ORDER BY l.created_at DESC`).bind(context.organizationId,propertyId).all(),
    db().prepare(`SELECT s.*,COUNT(l.id) line_count,ROUND(SUM(l.total_on_hand),2) total_units,
      ROUND(SUM(l.needed_quantity),2) units_needed,SUM(l.inventory_value_cents) inventory_value_cents
      FROM inventory_count_sessions s LEFT JOIN inventory_count_lines l ON l.session_id=s.id
      WHERE s.organization_id=? AND s.property_id=? GROUP BY s.id ORDER BY s.submitted_at DESC LIMIT 30`).bind(context.organizationId,propertyId).all(),
  ]);
  return { role: context.role,propertyId, inventory: inventory.results, orders: orders.results, access: access.results, velocity: velocity.results,transactions:transactions.results,requisitions:requisitions.results,vendors:vendors.results,locations:locations.results,purchaseOrders:purchaseOrders.results,poLines:poLines.results,countSessions:countSessions.results };
}

export async function verifyAmenityAccess(email: string, confirmation: string, room: string, facility: string) {
  const context = await activeStaffContext(email);
  if (!context) return null;
  await ensureTables();
  const propertyId=await propertyIdFor(context.organizationId,context.email);
  const normalized = confirmation.trim().toUpperCase();
  const allowed = /^TEST-WGS-\d{3}$/.test(normalized) && /^\d{3}$/.test(room) && ["GYM", "POOL"].includes(facility);
  const reason = allowed ? "Active test reservation profile verified" : "Reservation, room, or facility entitlement did not match";
  const event = { id: crypto.randomUUID(), decision: allowed ? "GRANTED" : "DENIED", reason, occurredAt: new Date().toISOString() };
  await db().prepare(`INSERT INTO amenity_access_events
    (id, organization_id, confirmation_number, room_number, facility, decision, reason, occurred_at, property_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(event.id, context.organizationId, normalized, room, facility, event.decision, reason, event.occurredAt,propertyId).run();
  return event;
}

export async function draftSupplyOrder(email: string, sku: string) {
  const context = await activeStaffContext(email);
  if (!context || context.role !== "admin") return null;
  await ensureTables();
  const propertyId=await propertyIdFor(context.organizationId,context.email);
  const item = await db().prepare("SELECT * FROM supply_inventory WHERE organization_id = ? AND property_id=? AND sku = ?")
    .bind(context.organizationId,propertyId,sku).first<{ sku:string; quantity:number; reorder_threshold:number; target_quantity:number; unit_cost_cents:number }>();
  if (!item) throw new Error("Inventory item was not found.");
  const spike = item.quantity <= Math.ceil(item.reorder_threshold * 1.2);
  if (!spike) throw new Error("Stock remains above the predictive reorder band.");
  const quantity = Math.max(1, item.target_quantity - item.quantity);
  const id = crypto.randomUUID();
  await db().prepare(`INSERT INTO supply_order_drafts
    (id, organization_id, sku, quantity, total_cost_cents, reason, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'DRAFT_APPROVAL_REQUIRED', ?)`)
    .bind(id, context.organizationId, sku, quantity, quantity * item.unit_cost_cents, "Cleaning demand spike / threshold forecast", new Date().toISOString()).run();
  return { id, quantity, status: "DRAFT_APPROVAL_REQUIRED" };
}

export async function recordCleaningCompletion(email: string, housekeeper: string, room: string, minutes: number) {
  const context = await activeStaffContext(email);
  if (!context || context.role !== "admin") return null;
  await ensureTables();
  const propertyId=await propertyIdFor(context.organizationId,context.email);
  const safeName = housekeeper.trim().slice(0, 80);
  if (!safeName || !/^\d{3}$/.test(room) || minutes < 5 || minutes > 180) throw new Error("Valid housekeeper, room, and 5–180 minute duration are required.");
  const completed = new Date(), started = new Date(completed.getTime() - minutes * 60_000);
  const id = crypto.randomUUID();
  await db().prepare(`INSERT INTO cleaning_velocity_events
    (id, organization_id, housekeeper, room_number, started_at, completed_at, minutes, property_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, context.organizationId, safeName, room, started.toISOString(), completed.toISOString(), minutes,propertyId).run();
  return { id, recorded: true };
}

export async function inventoryWorkflow(email:string,input:Record<string,unknown>){
 const context=await activeStaffContext(email);if(!context)return null;await ensureTables();const action=String(input.action),sku=String(input.sku||"").trim().toUpperCase(),now=new Date().toISOString(),propertyId=await propertyIdFor(context.organizationId,context.email,String(input.propertyId||"")||undefined);
 if(action==="submit_inventory_count"){
  const department=String(input.department||"").trim().toUpperCase(),storageArea=String(input.storageArea||"").trim().slice(0,120),shift=String(input.shift||"").trim().toUpperCase(),countType=String(input.countType||"FULL_COUNT").trim().toUpperCase(),lines=Array.isArray(input.lines)?input.lines as Array<Record<string,unknown>>:[];
  if(!department||!storageArea||!shift||!lines.length||lines.length>250)throw new Error("Choose a department, storage area and shift, then enter at least one count line.");
  const duplicate=await db().prepare(`SELECT id FROM inventory_count_sessions WHERE organization_id=? AND property_id=? AND department=? AND storage_area=? AND shift=? AND status IN('SUBMITTED_REVIEW','APPROVED') AND substr(submitted_at,1,10)=substr(?,1,10) LIMIT 1`).bind(context.organizationId,propertyId,department,storageArea,shift,now).first();
  if(duplicate)throw new Error("A count for this department, area and shift is already open today.");
  const id=crypto.randomUUID();
  await db().prepare(`INSERT INTO inventory_count_sessions(id,organization_id,property_id,department,storage_area,shift,count_type,status,completed_by,supervisor_email,notes,attachment_reference,submitted_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'SUBMITTED_REVIEW',?,?,?,?,?,?,?)`).bind(id,context.organizationId,propertyId,department,storageArea,shift,countType,email,String(input.supervisorEmail||"").slice(0,180)||null,String(input.notes||"").slice(0,1000),String(input.attachmentReference||"").slice(0,500)||null,now,now,now).run();
  const statements=[];
  for(const raw of lines){const lineSku=String(raw.sku||"").trim().toUpperCase(),name=String(raw.name||"").trim(),unit=String(raw.unit||"Each").slice(0,40),category=String(raw.category||"GENERAL").slice(0,100),full=Math.max(0,Number(raw.fullQuantity||0)),partial=Math.max(0,Number(raw.partialQuantity||0)),par=Math.max(0,Number(raw.parLevel||0)),total=Number((full+partial).toFixed(3)),needed=Math.max(0,Number((par-total).toFixed(3))),order=Math.max(0,Number(raw.orderQuantity??needed)),cost=Math.max(0,Math.round(Number(raw.unitCostCents||0)));if(!lineSku||!name||![full,partial,par,total,needed,order,cost].every(Number.isFinite))continue;statements.push(db().prepare(`INSERT INTO inventory_count_lines(id,organization_id,session_id,sku,category,item_name,unit,full_quantity,partial_quantity,total_on_hand,par_level,needed_quantity,order_quantity,condition,storage_location,expiration_or_inspection_date,unit_cost_cents,inventory_value_cents,priority,comments,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),context.organizationId,id,lineSku,category,name.slice(0,160),unit,full,partial,total,par,needed,order,String(raw.condition||"Good").slice(0,40),String(raw.storageLocation||storageArea).slice(0,120),String(raw.expirationDate||"")||null,cost,Math.round(total*cost),String(raw.priority||"Normal").slice(0,30),String(raw.comments||"").slice(0,500),now));}
  if(!statements.length){await db().prepare("DELETE FROM inventory_count_sessions WHERE id=?").bind(id).run();throw new Error("No valid inventory lines were supplied.");}
  for(let index=0;index<statements.length;index+=50)await db().batch(statements.slice(index,index+50));
  return{id,status:"SUBMITTED_REVIEW",lineCount:statements.length};
 }
 if(action==="create_requisition"){const quantity=Number(input.quantity);if(!sku||!Number.isInteger(quantity)||quantity<1)throw new Error("Select an item and enter a valid quantity.");const id=crypto.randomUUID();await db().prepare(`INSERT INTO inventory_requisitions
  (id,organization_id,department,sku,quantity,reason,status,requested_by,approved_by,created_at,updated_at,property_id)
  VALUES (?,?,?,?,?,?,'PENDING_APPROVAL',?,NULL,?,?,?)`).bind(id,context.organizationId,String(input.department||"HOUSEKEEPING"),sku,quantity,String(input.reason||"Operational replenishment").slice(0,500),email,now,now,propertyId).run();return{id,status:"PENDING_APPROVAL"}}
 if(context.role!=="admin")return null;
 if(action==="approve_inventory_count"){
  const id=String(input.id||""),session=await db().prepare("SELECT * FROM inventory_count_sessions WHERE id=? AND organization_id=? AND property_id=? AND status='SUBMITTED_REVIEW'").bind(id,context.organizationId,propertyId).first<Record<string,any>>();if(!session)throw new Error("Submitted inventory count was not found.");const result=await db().prepare("SELECT * FROM inventory_count_lines WHERE session_id=? AND organization_id=?").bind(id,context.organizationId).all<Record<string,any>>();
  const current=await db().prepare("SELECT sku,quantity FROM supply_inventory WHERE organization_id=? AND property_id=?").bind(context.organizationId,propertyId).all<{sku:string;quantity:number}>(),currentQuantity=new Map(current.results.map(item=>[item.sku,Number(item.quantity)]));const statements=[];for(const line of result.results){const delta=Number(line.total_on_hand)-Number(currentQuantity.get(line.sku)||0);statements.push(db().prepare(`INSERT INTO supply_inventory(id,organization_id,sku,name,category,quantity,reorder_threshold,target_quantity,unit_cost_cents,updated_at,property_id,location_id,description,base_unit,purchase_unit,issue_unit,pack_size,par_quantity,safety_stock,committed_quantity,on_order_quantity,barcode,preferred_vendor_id,lead_time_days,expiration_tracked,hazardous) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(organization_id,sku) DO UPDATE SET name=excluded.name,category=excluded.category,quantity=excluded.quantity,reorder_threshold=excluded.reorder_threshold,target_quantity=excluded.target_quantity,unit_cost_cents=excluded.unit_cost_cents,updated_at=excluded.updated_at,property_id=excluded.property_id,base_unit=excluded.base_unit,issue_unit=excluded.issue_unit,par_quantity=excluded.par_quantity,expiration_tracked=excluded.expiration_tracked,hazardous=excluded.hazardous`).bind(crypto.randomUUID(),context.organizationId,line.sku,line.item_name,line.category,line.total_on_hand,Math.max(0,Math.floor(line.par_level*.5)),line.par_level,line.unit_cost_cents,now,propertyId,null,"Imported from approved AAIQ department count",line.unit,"CASE",line.unit,1,line.par_level,Math.max(0,Math.floor(line.par_level*.5)),0,0,null,null,5,line.expiration_or_inspection_date?1:0,/chemical/i.test(line.category)?1:0));statements.push(db().prepare(`INSERT INTO inventory_transactions
   (id,organization_id,sku,transaction_type,quantity,balance_after,reason,reference_id,actor_email,created_at,property_id)
   VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),context.organizationId,line.sku,"PHYSICAL_COUNT_APPROVED",delta,line.total_on_hand,`Approved ${session.department} count`,id,email,now,propertyId));if(Number(line.order_quantity)>0)statements.push(db().prepare(`INSERT INTO inventory_requisitions
   (id,organization_id,department,sku,quantity,reason,status,requested_by,approved_by,created_at,updated_at,property_id)
   VALUES (?,?,?,?,?,?,'PENDING_APPROVAL',?,NULL,?,?,?)`).bind(crypto.randomUUID(),context.organizationId,session.department,line.sku,Math.ceil(Number(line.order_quantity)),`Auto-created from approved count ${id}`,email,now,now,propertyId));}
  for(let index=0;index<statements.length;index+=40)await db().batch(statements.slice(index,index+40));await db().prepare("UPDATE inventory_count_sessions SET status='APPROVED',reviewed_by=?,reviewed_at=?,review_note=?,updated_at=? WHERE id=?").bind(email,now,String(input.reviewNote||"Count approved; replenishment needs sent to procurement").slice(0,500),now,id).run();return{id,status:"APPROVED",replenishmentDrafts:result.results.filter(line=>Number(line.order_quantity)>0).length};
 }
 if(action==="return_inventory_count"){const id=String(input.id||""),reason=String(input.reviewNote||"").trim();if(!reason)throw new Error("Enter a reason before returning the count.");const changed=await db().prepare("UPDATE inventory_count_sessions SET status='RETURNED',reviewed_by=?,reviewed_at=?,review_note=?,updated_at=? WHERE id=? AND organization_id=? AND property_id=? AND status='SUBMITTED_REVIEW'").bind(email,now,reason.slice(0,500),now,id,context.organizationId,propertyId).run();if(!changed.meta.changes)throw new Error("Submitted inventory count was not found.");return{id,status:"RETURNED"}}
 if(action==="create_item"){const name=String(input.name||"").trim(),category=String(input.category||"GENERAL").trim().toUpperCase(),quantity=Number(input.openingQuantity||0),threshold=Number(input.reorderThreshold||0),target=Number(input.targetQuantity||0),cost=Number(input.unitCostCents||0);if(!sku||!name||![quantity,threshold,target,cost].every(Number.isInteger)||Math.min(quantity,threshold,target,cost)<0)throw new Error("SKU, name, and valid non-negative quantities and cost are required.");const location=String(input.locationId||"")||null;await db().prepare(`INSERT INTO supply_inventory(id,organization_id,sku,name,category,quantity,reorder_threshold,target_quantity,unit_cost_cents,updated_at,property_id,location_id,description,base_unit,purchase_unit,issue_unit,pack_size,par_quantity,safety_stock,committed_quantity,on_order_quantity,barcode,preferred_vendor_id,lead_time_days,expiration_tracked,hazardous)
 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),context.organizationId,sku,name.slice(0,140),category,quantity,threshold,target,cost,now,propertyId,location,String(input.description||"").slice(0,1000),String(input.baseUnit||"EACH"),String(input.purchaseUnit||"CASE"),String(input.issueUnit||"EACH"),Math.max(1,Number(input.packSize||1)),target,threshold,0,0,String(input.barcode||"")||null,String(input.preferredVendorId||"")||null,Number(input.leadTimeDays||5),input.expirationTracked?1:0,input.hazardous?1:0).run();if(quantity>0)await db().prepare(`INSERT INTO inventory_transactions
  (id,organization_id,sku,transaction_type,quantity,balance_after,reason,reference_id,actor_email,created_at,property_id)
  VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),context.organizationId,sku,"OPENING_BALANCE",quantity,quantity,"Item master opening balance",null,email,now,propertyId).run();return{sku,created:true}}
 if(action==="issue_stock"){const quantity=Number(input.quantity),item=await db().prepare("SELECT quantity,committed_quantity FROM supply_inventory WHERE organization_id=? AND property_id=? AND sku=?").bind(context.organizationId,propertyId,sku).first<{quantity:number;committed_quantity:number}>();if(!item||!Number.isInteger(quantity)||quantity<1||item.quantity<quantity)throw new Error("Insufficient stock or invalid issue quantity.");const balance=item.quantity-quantity,id=crypto.randomUUID();await db().batch([db().prepare("UPDATE supply_inventory SET quantity=?,updated_at=? WHERE organization_id=? AND property_id=? AND sku=?").bind(balance,now,context.organizationId,propertyId,sku),db().prepare(`INSERT INTO inventory_transactions
  (id,organization_id,sku,transaction_type,quantity,balance_after,reason,reference_id,actor_email,created_at,property_id)
  VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(id,context.organizationId,sku,"ISSUE",-quantity,balance,String(input.reason||"Department issue").slice(0,500),String(input.referenceId||""),email,now,propertyId)]);return{id,balance}}
 if(action==="create_purchase_order"){const vendorId=String(input.vendorId||""),quantity=Number(input.quantity),item=await db().prepare("SELECT unit_cost_cents,on_order_quantity FROM supply_inventory WHERE organization_id=? AND property_id=? AND sku=?").bind(context.organizationId,propertyId,sku).first<{unit_cost_cents:number;on_order_quantity:number}>(),vendor=await db().prepare("SELECT id FROM inventory_vendors WHERE id=? AND organization_id=? AND property_id=? AND status='ACTIVE'").bind(vendorId,context.organizationId,propertyId).first();if(!item||!vendor||!Number.isInteger(quantity)||quantity<1)throw new Error("Choose an active vendor, item, and valid order quantity.");const id=crypto.randomUUID(),lineId=crypto.randomUUID(),subtotal=item.unit_cost_cents*quantity,poNumber=`PO-${new Date().toISOString().slice(0,10).replaceAll("-","")}-${crypto.randomUUID().slice(0,6).toUpperCase()}`;await db().batch([db().prepare(`INSERT INTO inventory_purchase_orders VALUES (?,?,?,?,?,'DRAFT_APPROVAL_REQUIRED',?,0,0,?,NULL,NULL,NULL,?,NULL,?,?)`).bind(id,context.organizationId,propertyId,poNumber,vendorId,subtotal,subtotal,email,now,now),db().prepare(`INSERT INTO inventory_purchase_order_lines VALUES (?,?,?,?,?,0,?,'OPEN',?)`).bind(lineId,context.organizationId,id,sku,quantity,item.unit_cost_cents,now),db().prepare("UPDATE supply_inventory SET on_order_quantity=on_order_quantity+?,updated_at=? WHERE organization_id=? AND property_id=? AND sku=?").bind(quantity,now,context.organizationId,propertyId,sku)]);return{id,poNumber,status:"DRAFT_APPROVAL_REQUIRED"}}
 if(action==="approve_purchase_order"){const id=String(input.id||""),po=await db().prepare("SELECT id FROM inventory_purchase_orders WHERE id=? AND organization_id=? AND property_id=? AND status='DRAFT_APPROVAL_REQUIRED'").bind(id,context.organizationId,propertyId).first();if(!po)throw new Error("Draft purchase order not found.");await db().prepare("UPDATE inventory_purchase_orders SET status='APPROVED',approved_by=?,submitted_at=?,updated_at=? WHERE id=? AND property_id=?").bind(email,now,now,id,propertyId).run();return{id,status:"APPROVED"}}
 if(action==="receive_purchase_order"){const id=String(input.id||""),quantity=Number(input.quantity),line=await db().prepare(`SELECT l.*,p.property_id,p.status AS po_status FROM inventory_purchase_order_lines l JOIN inventory_purchase_orders p ON p.id=l.purchase_order_id WHERE p.id=? AND p.organization_id=? AND p.property_id=?`).bind(id,context.organizationId,propertyId).first<any>();if(!line||!["APPROVED","PARTIALLY_RECEIVED"].includes(line.po_status)||!Number.isInteger(quantity)||quantity<1||quantity>line.ordered_quantity-line.received_quantity)throw new Error("Enter a valid receipt against an approved purchase order.");const item=await db().prepare("SELECT quantity,on_order_quantity FROM supply_inventory WHERE organization_id=? AND property_id=? AND sku=?").bind(context.organizationId,line.property_id,line.sku).first<any>();if(!item)throw new Error("Purchase order item is missing.");const received=line.received_quantity+quantity,complete=received===line.ordered_quantity,balance=item.quantity+quantity;await db().batch([db().prepare("UPDATE inventory_purchase_order_lines SET received_quantity=?,status=? WHERE id=?").bind(received,complete?"RECEIVED":"PARTIAL",line.id),db().prepare("UPDATE inventory_purchase_orders SET status=?,received_at=?,updated_at=? WHERE id=? AND property_id=?").bind(complete?"RECEIVED":"PARTIALLY_RECEIVED",complete?now:null,now,id,propertyId),db().prepare("UPDATE supply_inventory SET quantity=?,on_order_quantity=MAX(0,on_order_quantity-?),updated_at=? WHERE organization_id=? AND property_id=? AND sku=?").bind(balance,quantity,now,context.organizationId,line.property_id,line.sku),db().prepare(`INSERT INTO inventory_transactions
  (id,organization_id,sku,transaction_type,quantity,balance_after,reason,reference_id,actor_email,created_at,property_id)
  VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),context.organizationId,line.sku,"PO_RECEIPT",quantity,balance,"Purchase order receiving",id,email,now,propertyId)]);return{id,status:complete?"RECEIVED":"PARTIALLY_RECEIVED",balance}}
 if(action==="count_adjust"){const counted=Number(input.countedQuantity),item=await db().prepare("SELECT quantity FROM supply_inventory WHERE organization_id=? AND property_id=? AND sku=?").bind(context.organizationId,propertyId,sku).first<{quantity:number}>();if(!item||!Number.isInteger(counted)||counted<0)throw new Error("Enter a valid physical count.");const delta=counted-item.quantity,id=crypto.randomUUID();await db().batch([db().prepare("UPDATE supply_inventory SET quantity=?,updated_at=? WHERE organization_id=? AND property_id=? AND sku=?").bind(counted,now,context.organizationId,propertyId,sku),db().prepare(`INSERT INTO inventory_transactions
  (id,organization_id,sku,transaction_type,quantity,balance_after,reason,reference_id,actor_email,created_at,property_id)
  VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(id,context.organizationId,sku,"PHYSICAL_COUNT",delta,counted,String(input.reason||"Cycle count").slice(0,500),null,email,now,propertyId)]);return{id,balance:counted}}
 if(action==="approve_requisition"){const id=String(input.id),req=await db().prepare("SELECT * FROM inventory_requisitions WHERE id=? AND organization_id=? AND property_id=? AND status='PENDING_APPROVAL'").bind(id,context.organizationId,propertyId).first<Record<string,any>>();if(!req)throw new Error("Pending requisition not found.");await db().prepare("UPDATE inventory_requisitions SET status='APPROVED',approved_by=?,updated_at=? WHERE id=? AND property_id=?").bind(email,now,id,propertyId).run();return{id,status:"APPROVED"}}
 if(action==="receive_order"){const quantity=Number(input.quantity),item=await db().prepare("SELECT quantity FROM supply_inventory WHERE organization_id=? AND property_id=? AND sku=?").bind(context.organizationId,propertyId,sku).first<{quantity:number}>();if(!item||!Number.isInteger(quantity)||quantity<1)throw new Error("Enter a valid received quantity.");const balance=item.quantity+quantity,id=crypto.randomUUID();await db().batch([db().prepare("UPDATE supply_inventory SET quantity=?,updated_at=? WHERE organization_id=? AND property_id=? AND sku=?").bind(balance,now,context.organizationId,propertyId,sku),db().prepare(`INSERT INTO inventory_transactions
  (id,organization_id,sku,transaction_type,quantity,balance_after,reason,reference_id,actor_email,created_at,property_id)
  VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(id,context.organizationId,sku,"RECEIPT",quantity,balance,String(input.reason||"Vendor receipt").slice(0,500),String(input.referenceId||""),email,now,propertyId)]);return{id,balance}}
 throw new Error("Unsupported inventory workflow.");
}
