-- Batch 3 Workflow 3: source-backed Maintenance defect-to-repair chain.

CREATE TABLE IF NOT EXISTS maintenance_cases (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  work_order_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK(source_type IN('HOUSEKEEPING','FRONT_DESK','GUEST','PMS_REPORT','EMAIL_ATTACHMENT','MANUAL','IOT_ALERT','COMPLIANCE')),
  source_reference TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  summary TEXT NOT NULL,
  description TEXT NOT NULL,
  room_number TEXT,
  asset_id TEXT,
  hazard_type TEXT NOT NULL,
  guest_impact INTEGER NOT NULL DEFAULT 0 CHECK(guest_impact IN(0,1)),
  room_outage INTEGER NOT NULL DEFAULT 0 CHECK(room_outage IN(0,1)),
  active_leak INTEGER NOT NULL DEFAULT 0 CHECK(active_leak IN(0,1)),
  safety_hold INTEGER NOT NULL DEFAULT 0 CHECK(safety_hold IN(0,1)),
  priority TEXT NOT NULL CHECK(priority IN('LOW','MEDIUM','HIGH','CRITICAL')),
  response_target_minutes INTEGER NOT NULL,
  classification_reason TEXT NOT NULL,
  risk_facts_json TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN('UNASSIGNED','ASSIGNED','ACKNOWLEDGED','DIAGNOSING','AWAITING_PART','REPAIRING','TESTING','AWAITING_VERIFICATION','RETURNED_TO_SERVICE','REWORK_REQUIRED','SAFETY_HOLD','CANCELLED')),
  assigned_to_email TEXT,
  assignment_reason TEXT NOT NULL,
  warranty_disposition TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK(warranty_disposition IN('UNKNOWN','NOT_APPLICABLE','CLAIM_RECOMMENDED','AUTHORIZED_REPAIR')),
  due_at TEXT NOT NULL,
  acknowledged_at TEXT,
  diagnosis_completed_at TEXT,
  repair_started_at TEXT,
  repair_completed_at TEXT,
  verification_requested_at TEXT,
  returned_to_service_at TEXT,
  outage_started_at TEXT,
  outage_ended_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(organization_id,property_id,work_order_id),
  UNIQUE(organization_id,property_id,idempotency_key)
);

CREATE INDEX IF NOT EXISTS maintenance_case_queue_idx
  ON maintenance_cases(organization_id,property_id,state,priority,due_at);
CREATE INDEX IF NOT EXISTS maintenance_case_asset_history_idx
  ON maintenance_cases(organization_id,property_id,asset_id,created_at);

CREATE TABLE IF NOT EXISTS maintenance_case_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  from_state TEXT,
  to_state TEXT,
  actor_type TEXT NOT NULL CHECK(actor_type IN('USER','SYSTEM')),
  actor_id TEXT NOT NULL,
  detail_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS maintenance_case_event_trace_idx
  ON maintenance_case_events(organization_id,property_id,case_id,created_at);
CREATE TRIGGER IF NOT EXISTS maintenance_case_events_append_only_update
BEFORE UPDATE ON maintenance_case_events BEGIN SELECT RAISE(ABORT,'Maintenance case events are append-only.'); END;
CREATE TRIGGER IF NOT EXISTS maintenance_case_events_append_only_delete
BEFORE DELETE ON maintenance_case_events BEGIN SELECT RAISE(ABORT,'Maintenance case events are append-only.'); END;

CREATE TABLE IF NOT EXISTS maintenance_diagnoses (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  failure_code TEXT NOT NULL,
  finding TEXT NOT NULL,
  probable_cause TEXT NOT NULL,
  warranty_disposition TEXT NOT NULL CHECK(warranty_disposition IN('UNKNOWN','NOT_APPLICABLE','CLAIM_RECOMMENDED','AUTHORIZED_REPAIR')),
  diagnosed_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS maintenance_diagnosis_case_idx
  ON maintenance_diagnoses(organization_id,property_id,case_id,created_at);

CREATE TABLE IF NOT EXISTS maintenance_repair_actions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK(action_type IN('REPAIR','TEST','OBSERVATION','TEMPORARY_CONTROL')),
  description TEXT NOT NULL,
  outcome TEXT NOT NULL,
  measurement_value REAL,
  measurement_unit TEXT,
  performed_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS maintenance_repair_action_case_idx
  ON maintenance_repair_actions(organization_id,property_id,case_id,created_at);

CREATE TABLE IF NOT EXISTS maintenance_parts_reservations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity>0),
  status TEXT NOT NULL CHECK(status IN('RESERVED','ISSUED','RELEASED')),
  reserved_by TEXT NOT NULL,
  reserved_at TEXT NOT NULL,
  issued_at TEXT,
  released_at TEXT
);
CREATE INDEX IF NOT EXISTS maintenance_parts_case_idx
  ON maintenance_parts_reservations(organization_id,property_id,case_id,status);

CREATE TABLE IF NOT EXISTS maintenance_evidence_links (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  attachment_id TEXT NOT NULL UNIQUE,
  content_sha256 TEXT NOT NULL,
  evidence_area TEXT NOT NULL,
  evidence_stage TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(organization_id,property_id,case_id,content_sha256,evidence_area,evidence_stage)
);
CREATE INDEX IF NOT EXISTS maintenance_evidence_case_idx
  ON maintenance_evidence_links(organization_id,property_id,case_id,created_at);

CREATE TABLE IF NOT EXISTS maintenance_return_to_service_reviews (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN('APPROVED','REWORK_REQUIRED','SAFETY_HOLD')),
  checklist_json TEXT NOT NULL,
  reviewer_email TEXT NOT NULL,
  reviewer_note TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS maintenance_return_review_idx
  ON maintenance_return_to_service_reviews(organization_id,property_id,case_id,created_at);
