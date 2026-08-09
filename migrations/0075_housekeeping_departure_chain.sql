-- Batch 3 Workflow 2: property-scoped departure-to-housekeeping-to-maintenance chain.
-- Additive and forward-only. Release 68 work orders and evidence records remain authoritative.

ALTER TABLE work_order_attachments ADD COLUMN content_sha256 TEXT;

CREATE TABLE IF NOT EXISTS housekeeping_departure_batches (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  business_date TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK(source_type IN ('PMS_API','EMAIL_ATTACHMENT','MANUAL_UPLOAD')),
  source_reference TEXT NOT NULL,
  file_name TEXT,
  object_key TEXT,
  content_sha256 TEXT NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0 CHECK(row_count>=0),
  accepted_row_count INTEGER NOT NULL DEFAULT 0 CHECK(accepted_row_count>=0),
  exception_count INTEGER NOT NULL DEFAULT 0 CHECK(exception_count>=0),
  status TEXT NOT NULL CHECK(status IN ('PARSED','REVIEW_REQUIRED','FAILED')),
  parse_issues_json TEXT NOT NULL DEFAULT '[]',
  imported_by TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  UNIQUE(organization_id,property_id,content_sha256)
);

CREATE TABLE IF NOT EXISTS housekeeping_departures (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  business_date TEXT NOT NULL,
  source_row_number INTEGER NOT NULL CHECK(source_row_number>0),
  room_number TEXT NOT NULL,
  departure_status TEXT NOT NULL CHECK(departure_status IN ('DEPARTED','DUE_OUT','DIRTY')),
  guest_reference TEXT,
  departed_at TEXT,
  expected_arrival_at TEXT,
  early_arrival INTEGER NOT NULL DEFAULT 0 CHECK(early_arrival IN (0,1)),
  vip INTEGER NOT NULL DEFAULT 0 CHECK(vip IN (0,1)),
  raw_row_text TEXT NOT NULL,
  normalized_json TEXT NOT NULL,
  parse_confidence REAL NOT NULL CHECK(parse_confidence>=0 AND parse_confidence<=1),
  status TEXT NOT NULL DEFAULT 'READY_FOR_ASSIGNMENT' CHECK(status IN ('READY_FOR_ASSIGNMENT','ASSIGNED','UNASSIGNED','COMPLETED','CANCELLED')),
  created_at TEXT NOT NULL,
  FOREIGN KEY(batch_id) REFERENCES housekeeping_departure_batches(id),
  UNIQUE(batch_id,source_row_number)
);

CREATE TABLE IF NOT EXISTS housekeeping_assignments (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  departure_id TEXT NOT NULL UNIQUE,
  work_order_id TEXT NOT NULL UNIQUE,
  assigned_to_email TEXT,
  assignment_status TEXT NOT NULL CHECK(assignment_status IN ('UNASSIGNED','ASSIGNED','ACCEPTED','IN_PROGRESS','EVIDENCE_SUBMITTED','SUPERVISOR_REVIEW','REWORK_REQUIRED','MAINTENANCE_HOLD','VERIFIED','CANCELLED')),
  priority TEXT NOT NULL CHECK(priority IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  priority_score INTEGER NOT NULL CHECK(priority_score>=0),
  decision_reason_json TEXT NOT NULL,
  decision_policy_version TEXT NOT NULL,
  roster_source TEXT NOT NULL CHECK(roster_source IN ('CLOCKED_IN','PROPERTY_ASSIGNMENT','NO_ELIGIBLE_ROSTER')),
  due_at TEXT NOT NULL,
  accepted_at TEXT,
  started_at TEXT,
  evidence_submitted_at TEXT,
  verified_at TEXT,
  escalated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(departure_id) REFERENCES housekeeping_departures(id),
  FOREIGN KEY(work_order_id) REFERENCES operational_work_orders(id)
);

CREATE TABLE IF NOT EXISTS housekeeping_assignment_inspections (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  assignment_id TEXT NOT NULL,
  inspection_type TEXT NOT NULL CHECK(inspection_type IN ('HOUSEKEEPER_CHECKLIST','SUPERVISOR_REVIEW','VISION_PROVIDER')),
  checklist_json TEXT NOT NULL,
  result TEXT NOT NULL CHECK(result IN ('PASS','FAIL','LOW_CONFIDENCE','MISSING_EVIDENCE')),
  confidence REAL CHECK(confidence IS NULL OR (confidence>=0 AND confidence<=1)),
  provider_label TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(assignment_id) REFERENCES housekeeping_assignments(id)
);

CREATE TABLE IF NOT EXISTS housekeeping_maintenance_handoffs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  assignment_id TEXT NOT NULL,
  housekeeping_work_order_id TEXT NOT NULL,
  maintenance_work_order_id TEXT NOT NULL UNIQUE,
  defect_key TEXT NOT NULL,
  defect_category TEXT NOT NULL,
  defect_summary TEXT NOT NULL,
  defect_detail TEXT NOT NULL,
  source_inspection_id TEXT,
  source_evidence_review_id TEXT,
  confidence REAL,
  status TEXT NOT NULL CHECK(status IN ('OPEN','ACKNOWLEDGED','RESOLVED','CANCELLED')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  FOREIGN KEY(assignment_id) REFERENCES housekeeping_assignments(id),
  FOREIGN KEY(housekeeping_work_order_id) REFERENCES operational_work_orders(id),
  FOREIGN KEY(maintenance_work_order_id) REFERENCES operational_work_orders(id),
  UNIQUE(organization_id,property_id,assignment_id,defect_key)
);

CREATE INDEX IF NOT EXISTS idx_housekeeping_batch_scope ON housekeeping_departure_batches(organization_id,property_id,business_date,imported_at);
CREATE INDEX IF NOT EXISTS idx_housekeeping_departure_scope ON housekeeping_departures(organization_id,property_id,business_date,status,room_number);
CREATE INDEX IF NOT EXISTS idx_housekeeping_assignment_queue ON housekeeping_assignments(organization_id,property_id,assignment_status,assigned_to_email,due_at);
CREATE INDEX IF NOT EXISTS idx_housekeeping_inspection_assignment ON housekeeping_assignment_inspections(organization_id,property_id,assignment_id,created_at);
CREATE INDEX IF NOT EXISTS idx_housekeeping_handoff_assignment ON housekeeping_maintenance_handoffs(organization_id,property_id,assignment_id,status);
CREATE INDEX IF NOT EXISTS idx_work_attachment_checksum ON work_order_attachments(organization_id,property_id,work_order_id,content_sha256);
