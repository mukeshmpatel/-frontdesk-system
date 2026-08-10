import { env } from "cloudflare:workers";
import { activeStaffContext } from "./staff";

type TemplateRecord = {
  id: string;
  version: number;
  name: string;
  description: string;
  snapshot: Record<string, any>;
};

const SAMPLE_TEMPLATE_ID = "aaiq-hospitality-enterprise-v1";

const SAMPLE: TemplateRecord = {
  id: SAMPLE_TEMPLATE_ID,
  version: 2,
  name: "AAIQ Full-Service Hospitality Enterprise",
  description: "Protected 105-room hotel, restaurant, conference center, workforce, assets, operations, agents, website, social sandbox and reporting reference environment.",
  snapshot: {
    company: {
      name: "AAIQ Sample Hospitality Group",
      legalName: "AAIQ Sample Hospitality Group LLC",
      brand: "AAIQ Sample Hotels",
      region: "Central United States",
      currency: "USD",
      accountingMethod: "ACCRUAL",
    },
    property: {
      name: "AAIQ Grand Conference Hotel",
      code: "SAMPLE-GRAND",
      address: "100 Innovation Way, Sample City, KS 67401",
      timezone: "America/Chicago",
      roomCount: 105,
      businessDate: "2026-07-27",
      spaces: [
        ["LOBBY", "Lobby", "PUBLIC"],
        ["FRONT-DESK", "Front Desk", "OPERATIONS"],
        ["RESTAURANT", "Sample Table Restaurant", "FOOD_BEVERAGE"],
        ["BAR", "Sample Lounge", "FOOD_BEVERAGE"],
        ["KITCHEN", "Commercial Kitchen", "FOOD_BEVERAGE"],
        ["BALLROOM", "Grand Ballroom", "EVENT"],
        ["MEETING-A", "Meeting Room A", "EVENT"],
        ["MEETING-B", "Meeting Room B", "EVENT"],
        ["POOL", "Indoor Pool", "AMENITY"],
        ["FITNESS", "Fitness Center", "AMENITY"],
        ["LAUNDRY", "Hotel Laundry", "OPERATIONS"],
        ["HK-STORAGE", "Housekeeping Storeroom", "STORAGE"],
        ["MAINT-SHOP", "Maintenance Workshop", "OPERATIONS"],
        ["MARKET", "Lobby Marketplace", "RETAIL"],
        ["PARKING", "Guest Parking", "EXTERIOR"],
      ],
    },
    people: [
      { name: "Maya Thompson", role: "General Manager", department: "EXECUTIVE", tier: "MANAGER", shift: "08:00–18:00", email: "maya.manager" },
      { name: "Carlos Rivera", role: "Front Desk Supervisor", department: "FRONT_DESK", tier: "SUPERVISOR", shift: "07:00–15:00", email: "carlos.frontdesk" },
      { name: "Emma Brooks", role: "Front Desk Associate", department: "FRONT_DESK", tier: "ASSOCIATE", shift: "15:00–23:00", email: "emma.frontdesk" },
      { name: "Asha Patel", role: "Housekeeping Supervisor", department: "HOUSEKEEPING", tier: "SUPERVISOR", shift: "08:00–16:00", email: "asha.housekeeping" },
      { name: "Rosa Martinez", role: "Room Attendant", department: "HOUSEKEEPING", tier: "ASSOCIATE", shift: "08:00–16:00", email: "rosa.housekeeping" },
      { name: "Daniel Kim", role: "Maintenance Manager", department: "MAINTENANCE", tier: "MANAGER", shift: "07:00–17:00", email: "daniel.maintenance" },
      { name: "Noah Williams", role: "Maintenance Technician", department: "MAINTENANCE", tier: "ASSOCIATE", shift: "09:00–17:00", email: "noah.maintenance" },
      { name: "Grace Lee", role: "Inventory & Procurement Manager", department: "PROCUREMENT", tier: "MANAGER", shift: "08:00–17:00", email: "grace.inventory" },
      { name: "Olivia Reed", role: "Compliance Coordinator", department: "COMPLIANCE", tier: "SUPERVISOR", shift: "08:00–16:00", email: "olivia.compliance" },
      { name: "Liam Carter", role: "Restaurant Manager", department: "FOOD_BEVERAGE", tier: "MANAGER", shift: "12:00–21:00", email: "liam.restaurant" },
    ],
    roomAssetTemplate: [
      ["PTAC", "HVAC / PTAC Unit", "CLIMATE"],
      ["TV", "Guestroom Television", "ELECTRONICS"],
      ["LOCK", "RFID / Mobile Door Lock", "SECURITY"],
      ["SMOKE", "Smoke Detector", "LIFE_SAFETY"],
      ["PHONE", "Guestroom Telephone", "COMMUNICATION"],
      ["COFFEE", "Coffee Maker", "APPLIANCE"],
      ["IRON", "Iron and Ironing Board", "AMENITY"],
      ["HAIR", "Hair Dryer", "APPLIANCE"],
      ["FRIDGE", "Guestroom Refrigerator", "APPLIANCE"],
    ],
    agents: [
      ["EXEC-BRIEF", "AAIQ Executive Briefing Agent", "EXECUTIVE", "Summarize property health with cited evidence", "LOW"],
      ["FD-AGENT", "AAIQ Front Desk Agent", "FRONT_DESK", "Classify requests, incidents and shift exceptions", "MEDIUM"],
      ["HK-COORD", "AAIQ Housekeeping Coordinator", "HOUSEKEEPING", "Prioritize rooms and evaluate required evidence", "MEDIUM"],
      ["MAINT-DISPATCH", "AAIQ Maintenance Dispatcher", "MAINTENANCE", "Triage repairs, check warranty and prepare guided work", "MEDIUM"],
      ["COMPLIANCE", "AAIQ Compliance Inspector", "COMPLIANCE", "Track PMI and life-safety evidence", "MEDIUM"],
      ["INVENTORY", "AAIQ Inventory Planner", "PROCUREMENT", "Forecast supplies and create draft requisitions", "MEDIUM"],
      ["WEBSITE", "AAIQ Website Manager", "MARKETING", "Prepare verified site content and optimization proposals", "HIGH"],
      ["SOCIAL", "AAIQ Social Media Manager", "MARKETING", "Prepare channel-specific campaigns for approval", "HIGH"],
      ["REVIEWS", "AAIQ Review Manager", "GUEST_EXPERIENCE", "Classify reviews and prepare recovery or response drafts", "MEDIUM"],
      ["RESEARCH", "AAIQ Research Agent", "EXECUTIVE", "Research current authoritative sources with citations", "LOW"],
      ["CASH-AUDITOR", "AAIQ Cash & Check Auditor", "ACCOUNTING", "Reconcile source-backed cash, check images, shift drops and manager verification", "HIGH"],
      ["HIRING-MANAGER", "AAIQ Hiring Manager", "PEOPLE", "Prepare role-specific job descriptions, channel drafts, onboarding and access-locker work", "HIGH"],
      ["WEDDING-PLANNER", "AAIQ Wedding Planner", "EVENTS", "Prepare inquiry discovery, proposals, timelines, contract drafts and approval handoffs", "MEDIUM"],
      ["EVENT-MANAGER", "AAIQ Event Manager", "EVENTS", "Coordinate dependencies, deadlines, communications and the governed event portfolio", "MEDIUM"],
      ["BANQUET-COORDINATOR", "AAIQ Banquet Coordinator", "EVENTS", "Prepare BEOs, menus, room sets, service timelines and change-controlled packets", "MEDIUM"],
      ["NETWORK-ENGINEER", "AAIQ Network Engineer", "TECHNOLOGY", "Design, document, test and troubleshoot governed UniFi network plans", "HIGH"],
      ["PHONE-ENGINEER", "AAIQ Phone Engineer", "TECHNOLOGY", "Prepare, test and troubleshoot governed GDMS and Grandstream phone plans", "HIGH"],
      ["VISUAL-QA", "AAIQ Visual QA Supervisor", "OPERATIONS", "Review room and inventory visual evidence and route findings for human verification", "MEDIUM"],
    ],
    inventory: [
      { sku: "DET-POD-01", name: "Laundry Detergent Pods", category: "CHEMICAL", onHand: 84, par: 300, reorderPoint: 75, unitCostCents: 62 },
      { sku: "BED-SHEET-K", name: "King Bedsheet Set", category: "LINEN", onHand: 154, par: 400, reorderPoint: 140, unitCostCents: 1625 },
      { sku: "BED-SHEET-Q", name: "Queen Bedsheet Set", category: "LINEN", onHand: 210, par: 520, reorderPoint: 180, unitCostCents: 1495 },
      { sku: "PILLOWCASE-STD", name: "Standard Pillowcase", category: "LINEN", onHand: 236, par: 500, reorderPoint: 180, unitCostCents: 325 },
      { sku: "TOWEL-BATH", name: "Bath Towel", category: "LINEN", onHand: 390, par: 700, reorderPoint: 250, unitCostCents: 780 },
      { sku: "COFFEE-ROOM", name: "In-Room Coffee Packet", category: "AMENITY", onHand: 420, par: 600, reorderPoint: 200, unitCostCents: 48 },
      { sku: "HVAC-FILTER-20", name: "20×20 HVAC Filter", category: "MAINTENANCE", onHand: 32, par: 60, reorderPoint: 20, unitCostCents: 940 },
    ],
    workOrders: [
      { department: "HOUSEKEEPING", type: "ROOM_TURN", room: "218", title: "Room 218 departure clean", priority: "HIGH", status: "IN_PROGRESS", progress: 55 },
      { department: "MAINTENANCE", type: "GUEST_IMPACT", room: "215", title: "Room 215 PTAC not cooling", priority: "CRITICAL", status: "DIAGNOSING", progress: 25 },
      { department: "MAINTENANCE", type: "PREVENTIVE_MAINTENANCE", room: null, title: "Pool chemical controller PMI", priority: "HIGH", status: "ASSIGNED", progress: 0 },
      { department: "COMPLIANCE", type: "LIFE_SAFETY", room: null, title: "Monthly emergency-light inspection", priority: "HIGH", status: "AWAITING_VERIFICATION", progress: 90 },
      { department: "FRONT_DESK", type: "GUEST_REQUEST", room: "104", title: "Deliver two extra pillows", priority: "NORMAL", status: "ASSIGNED", progress: 0 },
    ],
    website: {
      theme: "EDITORIAL_HOSPITALITY",
      status: "DRAFT",
      pages: ["Home", "Rooms", "Amenities", "Dining", "Meetings & Events", "Offers", "Local Guide", "Gallery", "Contact", "Accessibility", "Privacy"],
      sections: ["Property header", "Booking bar", "Room cards", "Amenity grid", "Restaurant", "Meeting space", "Offers", "Reviews", "FAQ", "Contact/map", "Footer"],
    },
    social: {
      status: "SANDBOX",
      accounts: ["Google Business Profile", "Facebook", "Instagram", "TripAdvisor"],
      campaign: "Sample Summer Conference Package",
      approvalRequired: true,
    },
    reports: [
      "Property Health", "Rooms Readiness", "Housekeeping Velocity", "Maintenance SLA",
      "PMI Compliance", "Inventory Stockout Risk", "Guest Request Fulfillment",
      "Website Conversion", "Social Campaign Performance", "AI Agent Outcomes",
    ],
  },
};

function db(): D1Database {
  if (!env.DB) throw new Error("AAIQ Sample Environment storage is unavailable.");
  return env.DB;
}

async function ensure() {
  db();
  const now = new Date().toISOString();
  await db().prepare(`INSERT INTO sample_environment_templates
    (id,version,name,description,snapshot_json,is_locked,created_at,updated_at)
    VALUES (?,?,?,?,?,1,?,?)
    ON CONFLICT(id) DO UPDATE SET
      version=excluded.version,
      name=excluded.name,
      description=excluded.description,
      snapshot_json=excluded.snapshot_json,
      is_locked=1,
      updated_at=excluded.updated_at`).bind(SAMPLE.id, SAMPLE.version, SAMPLE.name, SAMPLE.description,
      JSON.stringify(SAMPLE.snapshot), now, now).run();
}

function slug(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20);
}

function cloneCode(name: string) {
  const base = slug(name) || "AAIQ-CLONE";
  return `${base.slice(0, 14)}-${crypto.randomUUID().slice(0, 5).toUpperCase()}`;
}

async function runBatches(statements: D1PreparedStatement[], size = 75) {
  for (let index = 0; index < statements.length; index += size) {
    await db().batch(statements.slice(index, index + size));
  }
}

function sampleRecordId(kind: string, propertyId: string, suffix = "default") {
  return `sample-${kind}-${propertyId}-${suffix}`;
}

/**
 * Repairs an older sample clone and gives a new clone enough real, property-scoped
 * work to exercise the product. All records are deterministic and idempotent.
 */
async function ensureCanonicalSampleRecords(context: any, property: {
  id: string; code: string; name: string; address?: string | null;
}) {
  const now = new Date().toISOString();
  const businessDate = now.slice(0, 10);
  const threads = [
    { key: "extra-towels", subject: "Extra towels for room 214", body: "Could we please have two extra bath towels delivered to room 214?", room: "214", priority: "MEDIUM", category: "ADDITIONAL_ITEM", department: "HOUSEKEEPING", status: "TRIAGED" },
    { key: "ptac", subject: "Room 215 is not cooling", body: "The air conditioner in room 215 is running but the room is still warm.", room: "215", priority: "HIGH", category: "MAINTENANCE_REQUEST", department: "MAINTENANCE", status: "TRIAGED" },
    { key: "late-checkout", subject: "Late checkout request", body: "May I keep room 104 until 1:00 PM tomorrow?", room: "104", priority: "LOW", category: "LATE_CHECKOUT", department: "FRONT_DESK", status: "NEEDS_REVIEW" },
    { key: "group", subject: "Wedding room block and ballroom inquiry", body: "We are planning a wedding for 120 guests and need a ballroom proposal and room block.", room: "", priority: "MEDIUM", category: "EVENT_INQUIRY", department: "SALES", status: "TRIAGED" },
  ];
  const statements: D1PreparedStatement[] = [
    db().prepare(`INSERT OR IGNORE INTO communication_sources
      (id,organization_id,property_id,source_key,display_name,connection_mode,status,credential_reference,
       last_sync_at,last_error,enabled,created_at,updated_at)
      VALUES (?,?,?,'INTERNAL','AAIQ Sample Inbox','NATIVE','ACTIVE',NULL,?,NULL,1,?,?)`)
      .bind(sampleRecordId("source", property.id), context.organizationId, property.id, now, now, now),
    db().prepare(`INSERT OR IGNORE INTO workforce_role_templates
      (id,organization_id,role_code,display_name,access_blueprint_json,custody_blueprint_json,locked,created_at,updated_at)
      VALUES (?,?, 'FRONT_DESK','Front Desk',?, ?,1,?,?)`)
      .bind(sampleRecordId("role", property.id, "front-desk"), context.organizationId,
        JSON.stringify(["AAIQ_DIGITAL_FRONT_DESK:OPERATE","AAIQ_COMMUNICATION_CENTER:RESPOND","AAIQ_TIME_MANAGEMENT:SELF"]),
        JSON.stringify(["UNIFORM","KEY_OR_BADGE"]), now, now),
    db().prepare(`INSERT OR IGNORE INTO cash_reconciliation_policies
      (id,organization_id,property_id,timezone,expected_shift_codes_json,discrepancy_threshold_cents,
       escalation_window_minutes,scheduled_local_time,enabled,updated_by,created_at,updated_at)
      VALUES (?,?,?,'America/Chicago','["AM","PM","NIGHT"]',1000,30,'03:30',1,?,?,?)`)
      .bind(sampleRecordId("cash-policy", property.id), context.organizationId, property.id, context.email, now, now),
  ];

  for (const item of threads) {
    const threadId = sampleRecordId("thread", property.id, item.key);
    statements.push(
      db().prepare(`INSERT OR IGNORE INTO communication_threads
        (id,organization_id,property_id,correlation_id,source_key,source_account,external_thread_id,
         guest_reference,room_reference,subject,status,priority,category,assigned_department,assigned_user,
         confidence,reasoning_summary,approval_status,latest_message_at,due_at,acknowledged_at,closed_at,
         created_by,created_at,updated_at)
        VALUES (?,?,?,?,'INTERNAL','AAIQ Sample Inbox',?,?,?,?,?,?,?,?,NULL,94,
          'Sample rule matched a property-scoped hospitality workflow.','NOT_REQUIRED',?,NULL,NULL,NULL,?,?,?)`)
        .bind(threadId, context.organizationId, property.id, sampleRecordId("correlation", property.id, item.key),
          `sample-thread-${item.key}`, `sample-guest-${item.key}`, item.room || null, item.subject, item.status, item.priority,
          item.category, item.department, now, context.email, now, now),
      db().prepare(`INSERT OR IGNORE INTO communication_messages
        (id,organization_id,property_id,thread_id,external_message_id,direction,sender_label,recipient_label,
         body,attachment_count,sensitivity,received_at,created_by,created_at)
        VALUES (?,?,?,?,?,'INBOUND','Sample Guest',?, ?,0,'INTERNAL',?,?,?)`)
        .bind(sampleRecordId("message", property.id, item.key), context.organizationId, property.id,
          threadId, sampleRecordId("external-message", property.id, item.key), property.name,
          item.body, now, context.email, now),
    );
  }

  const jobs = [
    ["front-desk", "Front Desk Agent", "FRONT_DESK", "Welcome guests, complete accurate arrivals and departures, manage reservations and folios within approved authority, respond to guest questions, protect payment and identity information, and use AAIQ to document every handoff. Evening and weekend availability is required."],
    ["room-attendant", "Room Attendant", "HOUSEKEEPING", "Prepare guest rooms to brand and property standards, record room progress, protect lost-and-found chain of custody, report maintenance conditions promptly, and submit required photo or video evidence through AAIQ."],
    ["maintenance", "Hotel Maintenance Technician", "MAINTENANCE", "Complete preventive and corrective maintenance, document diagnosis and parts, protect life-safety boundaries, respond to guest-impacting defects, and provide before-and-after evidence for supervisor verification."],
  ] as const;
  for (const [key, title, department, description] of jobs) {
    const requisitionId = sampleRecordId("job", property.id, key);
    statements.push(db().prepare(`INSERT OR IGNORE INTO workforce_job_requisitions
      (id,organization_id,property_id,title,department,description,status,approval_status,created_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,'DRAFT','PENDING',?,?,?)`)
      .bind(requisitionId, context.organizationId, property.id, title, department, description, context.email, now, now));
    for (const target of ["CAREER_SITE","FACEBOOK","INSTAGRAM","LINKEDIN","INDEED"]) {
      statements.push(db().prepare(`INSERT OR IGNORE INTO workforce_job_publication_drafts
        (id,requisition_id,target_key,payload_json,status,approval_status,external_reference,published_at,created_at,updated_at)
        VALUES (?,?,?,?, 'DRAFT','PENDING',NULL,NULL,?,?)`)
        .bind(sampleRecordId("job-draft", property.id, `${key}-${target.toLowerCase()}`), requisitionId,
          target, JSON.stringify({ title, department, description, property: property.name,
            address: property.address || "", approvalRequired: true, sample: true }), now, now));
    }
  }

  const batchId = sampleRecordId("cash-batch", property.id, businessDate);
  statements.push(
    db().prepare(`INSERT OR IGNORE INTO cash_source_batches
      (id,organization_id,property_id,business_date,source_type,source_reference,file_name,content_sha256,
       row_count,total_cash_cents,active,status,parse_error,imported_by,imported_at)
      VALUES (?,?,?,?,'PMS_EXPORT','SAMPLE-PMS-DAILY-CASH','sample-daily-cash.csv',?,3,48675,1,'PARSED',NULL,?,?)`)
      .bind(batchId, context.organizationId, property.id, businessDate,
        sampleRecordId("cash-sha", property.id, businessDate), context.email, now),
    db().prepare(`INSERT OR IGNORE INTO shift_cash_sessions
      (id,organization_id,property_id,employee_email,shift_entry_id,expected_cash_cents,counted_cash_cents,
       variance_cents,status,submitted_at,verified_by,verified_at,created_at,updated_at,business_date,shift_code,source_batch_id)
      VALUES (?,?,?, ?,NULL,18425,18425,0,'SUBMITTED',?,NULL,NULL,?,?,?,'AM',?)`)
      .bind(sampleRecordId("cash-session", property.id, businessDate), context.organizationId, property.id,
        context.email, now, now, now, businessDate, batchId),
  );
  [14225, 18425, 16025].forEach((amount, index) => statements.push(
    db().prepare(`INSERT OR IGNORE INTO cash_source_transactions
      (id,batch_id,organization_id,property_id,business_date,shift_code,source_row_number,source_reference,
       occurred_at,amount_cents,raw_row_text)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(sampleRecordId("cash-row", property.id, `${businessDate}-${index + 1}`), batchId,
        context.organizationId, property.id, businessDate, ["NIGHT","AM","PM"][index], index + 1,
        `SAMPLE-${index + 1}`, now, amount, `Sample authorized cash row ${index + 1}`),
  ));
  await runBatches(statements);
}

export async function listSampleEnvironments(userEmail: string) {
  await ensure();
  const context = await activeStaffContext(userEmail);
  if (!context) return null;
  const [templates, clones] = await Promise.all([
    db().prepare(`SELECT id,version,name,description,snapshot_json,is_locked,created_at
      FROM sample_environment_templates ORDER BY name`).all<Record<string, any>>(),
    db().prepare(`SELECT * FROM sample_environment_clones WHERE organization_id=?
      ORDER BY created_at DESC`).bind(context.organizationId).all<Record<string, any>>(),
  ]);
  return {
    role: context.role,
    templates: templates.results.map(template => ({
      ...template,
      snapshot: JSON.parse(template.snapshot_json),
      snapshot_json: undefined,
      immutable: template.is_locked === 1,
    })),
    clones: clones.results.map(clone => ({
      ...clone,
      summary: JSON.parse(clone.clone_summary_json),
      clone_summary_json: undefined,
    })),
  };
}

export async function cloneSampleEnvironment(userEmail: string, input: Record<string, unknown>) {
  await ensure();
  const context = await activeStaffContext(userEmail);
  if (!context || context.role !== "admin") return null;
  const templateId = String(input.templateId || SAMPLE_TEMPLATE_ID);
  const template = await db().prepare(`SELECT * FROM sample_environment_templates
    WHERE id=? AND is_locked=1`).bind(templateId).first<Record<string, any>>();
  if (!template) throw new Error("Protected sample template was not found.");
  const snapshot = JSON.parse(template.snapshot_json) as typeof SAMPLE.snapshot;
  const propertyName = String(input.name || `${snapshot.property.name} Copy`).trim().slice(0, 120);
  if (!propertyName) throw new Error("Name the editable environment copy.");
  const propertyCode = cloneCode(String(input.code || propertyName));
  const propertyId = crypto.randomUUID();
  const cloneId = crypto.randomUUID();
  const rootId = crypto.randomUUID();
  const buildingId = crypto.randomUUID();
  const now = new Date().toISOString();
  const correlationId = crypto.randomUUID();
  const statements: D1PreparedStatement[] = [];

  statements.push(
    db().prepare(`INSERT INTO property_contexts
      (id,organization_id,code,name,address,timezone,database_mode,database_binding,status,created_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,'SHARED_DATABASE',NULL,'ACTIVE',?,?,?)`)
      .bind(propertyId, context.organizationId, propertyCode, propertyName,
        String(input.address || snapshot.property.address), snapshot.property.timezone, context.email, now, now),
    db().prepare(`INSERT INTO property_assignments
      (id,organization_id,property_id,user_email,department,role_label,is_default,status,created_at)
      VALUES (?,?,?,?, 'EXECUTIVE','Administrator',0,'ACTIVE',?)`)
      .bind(crypto.randomUUID(), context.organizationId, propertyId, context.email, now),
    db().prepare(`INSERT INTO property_assets
      (id,organization_id,parent_id,asset_type,code,name,description,status,floor_number,room_number,
       room_type,capacity,area_sq_ft,manufacturer,model,serial_number,install_date,warranty_expires_at,
       metadata_json,created_by_email,created_at,updated_at,property_id)
      VALUES (?,?,NULL,'PROPERTY',?,?,?,'ACTIVE',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,?,?,?, ?,?)`)
      .bind(rootId, context.organizationId, `${propertyCode}-ROOT`, propertyName,
        "Editable clone of protected AAIQ sample environment.",
        JSON.stringify({ cloneId, templateId, templateVersion: template.version, company: snapshot.company }),
        context.email, now, now, propertyId),
    db().prepare(`INSERT INTO property_assets
      (id,organization_id,parent_id,asset_type,code,name,description,status,floor_number,room_number,
       room_type,capacity,area_sq_ft,manufacturer,model,serial_number,install_date,warranty_expires_at,
       metadata_json,created_by_email,created_at,updated_at,property_id)
      VALUES (?,?,?,'BUILDING',?,?,?,'ACTIVE',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'{}',?,?,?,?)`)
      .bind(buildingId, context.organizationId, rootId, `${propertyCode}-MAIN`, "Main Hotel & Conference Building",
        "Primary guestroom, conference and operations building.", context.email, now, now, propertyId),
  );

  const floorIds = new Map<number, string>();
  for (const floor of [1, 2, 3]) {
    const id = crypto.randomUUID();
    floorIds.set(floor, id);
    statements.push(db().prepare(`INSERT INTO property_assets
      (id,organization_id,parent_id,asset_type,code,name,description,status,floor_number,room_number,
       room_type,capacity,area_sq_ft,manufacturer,model,serial_number,install_date,warranty_expires_at,
       metadata_json,created_by_email,created_at,updated_at,property_id)
      VALUES (?,?,?,'FLOOR',?,?,?,'ACTIVE',?,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'{}',?,?,?,?)`)
      .bind(id, context.organizationId, buildingId, `${propertyCode}-F${floor}`, `Floor ${floor}`,
        `Guestroom floor ${floor}`, floor, context.email, now, now, propertyId));
  }

  const roomIds = new Map<string, string>();
  for (let roomIndex = 1; roomIndex <= snapshot.property.roomCount; roomIndex++) {
    const floor = roomIndex <= 40 ? 1 : roomIndex <= 80 ? 2 : 3;
    const sequence = floor === 1 ? roomIndex : floor === 2 ? roomIndex - 40 : roomIndex - 80;
    const roomNumber = `${floor}${String(sequence).padStart(2, "0")}`;
    const roomId = crypto.randomUUID();
    roomIds.set(roomNumber, roomId);
    const roomType = sequence % 12 === 0 ? "KING_SUITE" : sequence % 3 === 0 ? "TWO_QUEEN" : "KING_STANDARD";
    statements.push(db().prepare(`INSERT INTO property_assets
      (id,organization_id,parent_id,asset_type,code,name,description,status,floor_number,room_number,
       room_type,capacity,area_sq_ft,manufacturer,model,serial_number,install_date,warranty_expires_at,
       metadata_json,created_by_email,created_at,updated_at,property_id)
      VALUES (?,?,?,'ROOM',?,?,?,'ACTIVE',?,?,?,?,?,NULL,NULL,NULL,NULL,NULL,?,?,?, ?,?)`)
      .bind(roomId, context.organizationId, floorIds.get(floor), `${propertyCode}-R${roomNumber}`,
        `Room ${roomNumber}`, "Sample guestroom with complete standard-asset package.", floor,
        roomNumber, roomType, roomType === "TWO_QUEEN" ? 4 : 2, roomType === "KING_SUITE" ? 460 : 340,
        JSON.stringify({ evidenceZones: ["entry", "beds", "bathroom", "vanity", "floor", "amenities", "thermostat"] }),
        context.email, now, now, propertyId));
    for (const [prefix, label, category] of snapshot.roomAssetTemplate) {
      statements.push(db().prepare(`INSERT INTO property_assets
        (id,organization_id,parent_id,asset_type,code,name,description,status,floor_number,room_number,
         room_type,capacity,area_sq_ft,manufacturer,model,serial_number,install_date,warranty_expires_at,
         metadata_json,created_by_email,created_at,updated_at,property_id)
        VALUES (?,?,?,'EQUIPMENT',?,?,?,'ACTIVE',NULL,NULL,NULL,NULL,NULL,?,?,?,?,?,?, ?,?,?,?)`)
        .bind(crypto.randomUUID(), context.organizationId, roomId, `${propertyCode}-${prefix}-${roomNumber}`,
          `${label} — Room ${roomNumber}`, `Standard ${category.toLowerCase()} asset.`,
          "AAIQ Sample Manufacturer", `${prefix}-2026`, `SAMPLE-${prefix}-${roomNumber}`,
          "2026-01-15", "2028-01-15", JSON.stringify({ category, sampleData: true }),
          context.email, now, now, propertyId));
    }
  }

  for (const [code, name, spaceType] of snapshot.property.spaces) {
    statements.push(db().prepare(`INSERT INTO property_assets
      (id,organization_id,parent_id,asset_type,code,name,description,status,floor_number,room_number,
       room_type,capacity,area_sq_ft,manufacturer,model,serial_number,install_date,warranty_expires_at,
       metadata_json,created_by_email,created_at,updated_at,property_id)
      VALUES (?,?,?,'SPACE',?,?,?,'ACTIVE',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,?,?,?, ?,?)`)
      .bind(crypto.randomUUID(), context.organizationId, buildingId, `${propertyCode}-${code}`, name,
        `Sample ${String(spaceType).toLowerCase()} space.`, JSON.stringify({ spaceType, sampleData: true }),
        context.email, now, now, propertyId));
  }

  for (const person of snapshot.people) {
    const email = `${person.email}.${propertyCode.toLowerCase()}@sample.aaiq.local`;
    statements.push(
      db().prepare(`INSERT OR IGNORE INTO staff_members
        (id,organization_id,user_email,display_name,role,status,invited_by,created_at,updated_at)
        VALUES (?,?,?,?,?,'active',?,?,?)`)
        .bind(crypto.randomUUID(), context.organizationId, email, person.name,
          person.tier === "MANAGER" ? "admin" : "staff", context.email, now, now),
      db().prepare(`INSERT OR IGNORE INTO employee_profiles
        (id,organization_id,user_email,job_title,department,phone,extension,notes,updated_by_email,updated_at)
        VALUES (?,?,?,?,?,'+1-555-0100','','Protected sample role cloned into editable environment.',?,?)`)
        .bind(crypto.randomUUID(), context.organizationId, email, person.role, person.department, context.email, now),
      db().prepare(`INSERT OR IGNORE INTO property_assignments
        (id,organization_id,property_id,user_email,department,role_label,is_default,status,created_at)
        VALUES (?,?,?,?,?,?,0,'ACTIVE',?)`)
        .bind(crypto.randomUUID(), context.organizationId, propertyId, email, person.department, person.role, now),
    );
  }

  for (const order of snapshot.workOrders) {
    const id = crypto.randomUUID();
    statements.push(db().prepare(`INSERT INTO operational_work_orders
      (id,organization_id,department,work_type,title,description,room_number,assigned_to,status,progress,
       priority,parent_order_id,due_at,created_by,created_at,updated_at,completed_at,asset_id,property_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,?,?)`)
      .bind(id, context.organizationId, order.department, order.type, order.title,
        "Editable sample workflow with checklist, evidence and approval history.", order.room,
        null, order.status, order.progress, order.priority, null,
        new Date(Date.now() + 4 * 60 * 60_000).toISOString(), context.email, now, now,
        order.room ? roomIds.get(order.room) ?? null : null, propertyId));
  }

  for (const [agentKey, name, department, purpose, risk] of snapshot.agents) {
    statements.push(db().prepare(`INSERT INTO ai_agent_registry
      (id,organization_id,property_id,agent_key,name,department,purpose,risk_level,status,
       tools_json,data_sources_json,approval_policy_json,template_source,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(), context.organizationId, propertyId, agentKey, name, department, purpose, risk, "SAMPLE_READY",
        JSON.stringify(["READ_SCOPED_RECORDS", "PREPARE_DRAFT", "CREATE_APPROVAL_CASE"]),
        JSON.stringify(["TASKS", "ASSETS", "REPORT_FACTS", "POLICIES"]),
        JSON.stringify({ highRiskRequiresApproval: true, publicActionRequiresApproval: true }),
        templateId, now, now));
  }

  const websiteId = crypto.randomUUID();
  const websiteSlug = `${propertyCode.toLowerCase()}-${cloneId.slice(0, 6)}`;
  statements.push(db().prepare(`INSERT INTO website_factory_projects
    (id,organization_id,property_asset_id,name,slug,theme,status,content_json,seo_json,
     missing_fields_json,created_by,created_at,updated_at,published_at,property_context_id)
    VALUES (?,?,?,?,?,'EDITORIAL_HOSPITALITY','DRAFT',?,?,?,?,?,?,NULL,?)`)
    .bind(websiteId, context.organizationId, rootId, `${propertyName} Website`, websiteSlug,
      JSON.stringify({ ...snapshot.website, propertyName, propertyCode, address: input.address || snapshot.property.address }),
      JSON.stringify({ title: `${propertyName} | Official Sample Website`, schemaType: "Hotel", status: "SAMPLE_REVIEW" }),
      JSON.stringify(["Replace sample media", "Verify public phone", "Connect direct booking URL"]),
      context.email, now, now, propertyId));

  const inventoryLocationId = crypto.randomUUID();
  statements.push(db().prepare(`INSERT INTO inventory_locations
    (id,organization_id,property_id,code,name,department,location_type,status,created_at)
    VALUES (?,?,?,?,?,'HOUSEKEEPING','STOREROOM','ACTIVE',?)`)
    .bind(inventoryLocationId, context.organizationId, propertyId, `${propertyCode}-STOCK`,
      `${propertyName} Main Storeroom`, now));
  statements.push(db().prepare(`INSERT INTO inventory_vendors
    (id,organization_id,name,contact_email,lead_time_days,minimum_order_cents,status,created_at,property_id)
    VALUES (?,?,?,?,?,?,'ACTIVE',?,?)`)
    .bind(crypto.randomUUID(), context.organizationId, `${propertyName} Sample Hospitality Supply`,
      "sample-purchasing@example.invalid", 5, 25000, now, propertyId));
  for (const item of snapshot.inventory) {
    const scopedSku = `${propertyCode}-${item.sku}`.slice(0, 80);
    statements.push(db().prepare(`INSERT INTO supply_inventory
      (id,organization_id,sku,name,category,quantity,reorder_threshold,target_quantity,unit_cost_cents,
       updated_at,property_id,location_id,description,base_unit,purchase_unit,issue_unit,pack_size,
       par_quantity,safety_stock,committed_quantity,on_order_quantity,barcode,preferred_vendor_id,
       lead_time_days,expiration_tracked,hazardous)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'EACH','CASE','EACH',1,?,?,0,0,?,NULL,5,0,?)`)
      .bind(crypto.randomUUID(), context.organizationId, scopedSku, item.name, item.category,
        item.onHand, item.reorderPoint, item.par, item.unitCostCents, now, propertyId,
        inventoryLocationId, "Editable sample inventory item.", item.par, item.reorderPoint,
        `SAMPLE-${item.sku}`, item.category === "CHEMICAL" ? 1 : 0));
  }

  for (const platform of snapshot.social.accounts) {
    statements.push(db().prepare(`INSERT INTO sample_social_accounts
      (id,organization_id,property_id,platform,account_label,status,is_sandbox,permissions_json,last_sync_at,created_at)
      VALUES (?,?,?,?,?,'SANDBOX_NOT_CONNECTED',1,?,NULL,?)`)
      .bind(crypto.randomUUID(), context.organizationId, propertyId, platform,
        `${propertyName} — ${platform}`, JSON.stringify(["READ_TEST", "DRAFT_TEST"]), now));
  }

  snapshot.reports.forEach((reportName, index) => {
    statements.push(db().prepare(`INSERT INTO sample_report_facts
      (id,organization_id,property_id,fact_type,entity_type,entity_id,department,value,unit,
       dimensions_json,occurred_at,source_link)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(), context.organizationId, propertyId,
        reportName.toUpperCase().replace(/[^A-Z0-9]+/g, "_"), "SAMPLE_ENVIRONMENT", cloneId,
        index < 3 ? "HOUSEKEEPING" : index < 6 ? "MAINTENANCE" : "EXECUTIVE",
        [92, 7, 31.4, 88, 96, 2, 14, 3.7, 18.2, 94][index] ?? 1,
        index === 2 ? "MINUTES" : index === 5 ? "ITEMS" : "COUNT",
        JSON.stringify({ templateId, cloneId, drillable: true, sampleData: true }), now,
        `/aaiq-sample-lab?clone=${cloneId}&fact=${index}`));
  });

  const summary = {
    company: snapshot.company.name,
    property: propertyName,
    propertyCode,
    rooms: snapshot.property.roomCount,
    roomAssets: snapshot.property.roomCount * snapshot.roomAssetTemplate.length,
    commonSpaces: snapshot.property.spaces.length,
    people: snapshot.people.length,
    agents: snapshot.agents.length,
    workOrders: snapshot.workOrders.length,
    inventoryItems: snapshot.inventory.length,
    websiteProjectId: websiteId,
    socialSandboxes: snapshot.social.accounts.length,
    reportFacts: snapshot.reports.length,
  };
  statements.push(
    db().prepare(`INSERT INTO sample_environment_clones
      (id,template_id,template_version,organization_id,property_id,property_code,name,status,
       clone_summary_json,created_by,created_at)
      VALUES (?,?,?,?,?,?,?,'EDITABLE_COPY',?,?,?)`)
      .bind(cloneId, templateId, template.version, context.organizationId, propertyId, propertyCode,
        propertyName, JSON.stringify(summary), context.email, now),
    db().prepare(`INSERT INTO sample_environment_audit
      (id,organization_id,template_id,clone_id,event_type,actor_email,detail_json,created_at)
      VALUES (?,?,?,?,'IMMUTABLE_TEMPLATE_CLONED',?,?,?)`)
      .bind(crypto.randomUUID(), context.organizationId, templateId, cloneId, context.email,
        JSON.stringify({ propertyId, propertyCode, correlationId, summary }), now),
  );

  await runBatches(statements);
  await ensureCanonicalSampleRecords(context, { id: propertyId, code: propertyCode, name: propertyName,
    address: String(input.address || snapshot.property.address) });
  return { cloneId, propertyId, propertyCode, summary };
}

/**
 * Makes one complete protected-template clone the only active operating workspace.
 * Prior properties are preserved as ARCHIVED_SOURCE so no pilot work is destroyed.
 */
export async function activateCanonicalSampleWorkspace(userEmail:string){
  await ensure();
  const context=await activeStaffContext(userEmail);
  if(!context||context.role!=="admin")return null;
  const now=new Date().toISOString();
  let canonicalPropertyId:string|null=null;
  let cloneId:string|null=null;
  try{
    const profile=await db().prepare(`SELECT c.canonical_property_id,s.id clone_id
      FROM canonical_workspace_profiles c
      JOIN property_contexts p ON p.id=c.canonical_property_id AND p.organization_id=c.organization_id
      LEFT JOIN sample_environment_clones s ON s.organization_id=c.organization_id AND s.property_id=c.canonical_property_id
      WHERE c.organization_id=? AND c.status='ACTIVE' AND p.status='ACTIVE' LIMIT 1`)
      .bind(context.organizationId).first<any>();
    canonicalPropertyId=profile?.canonical_property_id||null;
    cloneId=profile?.clone_id||null;
  }catch{
    // The deployment route applies migration 0081 before this action is available.
  }
  if(!canonicalPropertyId){
    const existing=await db().prepare(`SELECT s.id clone_id,s.property_id
      FROM sample_environment_clones s JOIN property_contexts p ON p.id=s.property_id
      WHERE s.organization_id=? AND s.template_id=? AND p.status='ACTIVE'
      ORDER BY CASE WHEN s.status='CANONICAL_SAMPLE' THEN 0 ELSE 1 END,s.created_at DESC LIMIT 1`)
      .bind(context.organizationId,SAMPLE_TEMPLATE_ID).first<any>();
    if(existing){canonicalPropertyId=existing.property_id;cloneId=existing.clone_id;}
  }
  if(!canonicalPropertyId){
    const created=await cloneSampleEnvironment(userEmail,{
      templateId:SAMPLE_TEMPLATE_ID,
      name:"AAIQ Sample Hotel & Conference Center",
      code:"AAIQ-SAMPLE-HOTEL",
      address:SAMPLE.snapshot.property.address,
    });
    if(!created)throw new Error("Administrator access is required to activate the sample workspace.");
    canonicalPropertyId=created.propertyId;cloneId=created.cloneId;
  }
  const alreadyExclusive=await db().prepare(`SELECT COUNT(*) count FROM property_contexts
    WHERE organization_id=? AND status='ACTIVE' AND id<>?`).bind(context.organizationId,canonicalPropertyId)
    .first<{count:number}>();
  if((alreadyExclusive?.count||0)===0){
    const active=await db().prepare(`SELECT id,code,name,address,timezone,status FROM property_contexts
      WHERE organization_id=? AND id=? AND status='ACTIVE'`).bind(context.organizationId,canonicalPropertyId).first<any>();
    if(active){await ensureCanonicalSampleRecords(context,active);return {property:active,cloneId,archivedProperties:[],auditId:null,alreadyActive:true};}
  }
  const prior=await db().prepare(`SELECT id,code,name FROM property_contexts
    WHERE organization_id=? AND id<>? AND status='ACTIVE' ORDER BY name`)
    .bind(context.organizationId,canonicalPropertyId).all<any>();
  const archivedIds=prior.results.map(row=>row.id);
  const auditId=crypto.randomUUID();
  await db().batch([
    db().prepare(`UPDATE property_contexts SET status='ARCHIVED_SOURCE',updated_at=?
      WHERE organization_id=? AND id<>? AND status='ACTIVE'`).bind(now,context.organizationId,canonicalPropertyId),
    db().prepare(`UPDATE property_assignments SET status='ARCHIVED',is_default=0
      WHERE organization_id=? AND property_id<>? AND status='ACTIVE'`).bind(context.organizationId,canonicalPropertyId),
    db().prepare(`UPDATE property_contexts SET status='ACTIVE',updated_at=? WHERE organization_id=? AND id=?`)
      .bind(now,context.organizationId,canonicalPropertyId),
    db().prepare(`UPDATE property_assignments SET status='ACTIVE',is_default=CASE WHEN lower(user_email)=lower(?) THEN 1 ELSE is_default END
      WHERE organization_id=? AND property_id=?`).bind(context.email,context.organizationId,canonicalPropertyId),
    db().prepare(`INSERT INTO property_assignments
      (id,organization_id,property_id,user_email,department,role_label,is_default,status,created_at)
      VALUES(?,?,?,?,'EXECUTIVE','Protected sample administrator',1,'ACTIVE',?)
      ON CONFLICT(organization_id,property_id,user_email) DO UPDATE SET status='ACTIVE',is_default=1,role_label=excluded.role_label`)
      .bind(crypto.randomUUID(),context.organizationId,canonicalPropertyId,context.email,now),
    db().prepare(`INSERT INTO user_context_preferences
      (id,organization_id,user_email,active_property_id,active_location_type,active_location_id,updated_at)
      VALUES(?,?,?,?,'PROPERTY',?,?)
      ON CONFLICT(organization_id,user_email) DO UPDATE SET active_property_id=excluded.active_property_id,
      active_location_type='PROPERTY',active_location_id=excluded.active_location_id,updated_at=excluded.updated_at`)
      .bind(crypto.randomUUID(),context.organizationId,context.email,canonicalPropertyId,canonicalPropertyId,now),
    db().prepare(`INSERT INTO canonical_workspace_profiles
      (organization_id,canonical_property_id,workspace_mode,status,archived_property_ids_json,activated_by,activated_at,updated_at)
      VALUES (?,?,'SAMPLE','ACTIVE',?,?,?,?)
      ON CONFLICT(organization_id) DO UPDATE SET canonical_property_id=excluded.canonical_property_id,
      workspace_mode='SAMPLE',status='ACTIVE',archived_property_ids_json=excluded.archived_property_ids_json,
      activated_by=excluded.activated_by,activated_at=excluded.activated_at,updated_at=excluded.updated_at`)
      .bind(context.organizationId,canonicalPropertyId,JSON.stringify(archivedIds),context.email,now,now),
    db().prepare(`UPDATE sample_environment_clones SET status='CANONICAL_SAMPLE'
      WHERE organization_id=? AND property_id=?`).bind(context.organizationId,canonicalPropertyId),
    db().prepare(`INSERT INTO sample_environment_audit
      (id,organization_id,template_id,clone_id,event_type,actor_email,detail_json,created_at)
      VALUES (?,?,?,?,'CANONICAL_SAMPLE_ACTIVATED',?,?,?)`)
      .bind(auditId,context.organizationId,SAMPLE_TEMPLATE_ID,cloneId,context.email,
        JSON.stringify({canonicalPropertyId,archivedProperties:prior.results,mission:"ONE_PERFECT_EDITABLE_SAMPLE"}),now),
  ]);
  const property=await db().prepare(`SELECT id,code,name,address,timezone,status FROM property_contexts WHERE id=?`)
    .bind(canonicalPropertyId).first<any>();
  if(property)await ensureCanonicalSampleRecords(context,property);
  return {property,cloneId,archivedProperties:prior.results,auditId};
}

export async function rejectTemplateMutation() {
  throw new Error("Protected AAIQ sample templates cannot be edited or deleted. Create an editable copy first.");
}
