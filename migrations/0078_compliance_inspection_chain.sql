-- Batch 3 Workflow 4: governed Compliance inspection-to-closure chain.

CREATE TABLE IF NOT EXISTS compliance_programs (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, property_id TEXT NOT NULL, template_id TEXT NOT NULL,
  program_code TEXT NOT NULL, target_kind TEXT NOT NULL, source_status TEXT NOT NULL DEFAULT 'CONFIGURATION_REQUIRED'
    CHECK(source_status IN('CONFIGURATION_REQUIRED','APPROVED','RETIRED')),
  source_title TEXT, source_reference TEXT, jurisdiction TEXT, effective_date TEXT,
  licensed_signoff_required INTEGER NOT NULL DEFAULT 0 CHECK(licensed_signoff_required IN(0,1)),
  required_evidence_json TEXT NOT NULL, frequency TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)),
  next_due_at TEXT NOT NULL, configured_by TEXT, configured_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(organization_id,property_id,program_code)
);
CREATE INDEX IF NOT EXISTS compliance_program_due_idx ON compliance_programs(organization_id,property_id,active,source_status,next_due_at);

CREATE TABLE IF NOT EXISTS compliance_program_items (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, property_id TEXT NOT NULL, program_id TEXT NOT NULL,
  item_code TEXT NOT NULL, step_number INTEGER NOT NULL, instruction TEXT NOT NULL,
  response_type TEXT NOT NULL CHECK(response_type IN('PASS_FAIL','NUMBER','TEXT','DATE')),
  required INTEGER NOT NULL DEFAULT 1 CHECK(required IN(0,1)), critical INTEGER NOT NULL DEFAULT 0 CHECK(critical IN(0,1)),
  measurement_unit TEXT, minimum_value REAL, maximum_value REAL, evidence_required_on_failure INTEGER NOT NULL DEFAULT 0 CHECK(evidence_required_on_failure IN(0,1)),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(organization_id,property_id,program_id,item_code), UNIQUE(organization_id,property_id,program_id,step_number)
);
CREATE INDEX IF NOT EXISTS compliance_program_item_idx ON compliance_program_items(organization_id,property_id,program_id,step_number);

CREATE TABLE IF NOT EXISTS compliance_inspection_cases (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, property_id TEXT NOT NULL, program_id TEXT NOT NULL, template_id TEXT NOT NULL,
  work_order_id TEXT NOT NULL, target_asset_id TEXT, target_label TEXT NOT NULL, due_instance_key TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN('CONFIGURATION_REQUIRED','UNASSIGNED','ASSIGNED','ACKNOWLEDGED','INSPECTING','FAILED_HOLD','REMEDIATION_REQUIRED','AWAITING_EVIDENCE','AWAITING_REVIEW','COMPLIANT','REWORK_REQUIRED','WAIVED','CANCELLED')),
  assigned_to_email TEXT, assignment_reason TEXT NOT NULL, due_at TEXT NOT NULL, acknowledged_at TEXT, inspection_started_at TEXT,
  submitted_at TEXT, closed_at TEXT, remediation_case_id TEXT, failure_count INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(organization_id,property_id,program_id,target_asset_id,due_instance_key), UNIQUE(organization_id,property_id,work_order_id)
);
CREATE INDEX IF NOT EXISTS compliance_case_queue_idx ON compliance_inspection_cases(organization_id,property_id,state,due_at);

CREATE TABLE IF NOT EXISTS compliance_inspection_responses (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, property_id TEXT NOT NULL, case_id TEXT NOT NULL, program_item_id TEXT NOT NULL,
  result TEXT NOT NULL CHECK(result IN('PASS','FAIL','NOT_APPLICABLE')), value_text TEXT, measurement_unit TEXT,
  note TEXT NOT NULL DEFAULT '', range_failure INTEGER NOT NULL DEFAULT 0 CHECK(range_failure IN(0,1)),
  critical_failure INTEGER NOT NULL DEFAULT 0 CHECK(critical_failure IN(0,1)), recorded_by TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS compliance_response_latest_idx ON compliance_inspection_responses(organization_id,property_id,case_id,program_item_id,created_at);

CREATE TABLE IF NOT EXISTS compliance_evidence_links (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, property_id TEXT NOT NULL, case_id TEXT NOT NULL,
  program_item_id TEXT, attachment_id TEXT NOT NULL UNIQUE, content_sha256 TEXT NOT NULL, evidence_type TEXT NOT NULL,
  provider_label TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE(organization_id,property_id,case_id,content_sha256,evidence_type)
);
CREATE INDEX IF NOT EXISTS compliance_evidence_case_idx ON compliance_evidence_links(organization_id,property_id,case_id,created_at);

CREATE TABLE IF NOT EXISTS compliance_case_reviews (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, property_id TEXT NOT NULL, case_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN('COMPLIANT','REWORK_REQUIRED','FAILED_HOLD','WAIVED')),
  checklist_json TEXT NOT NULL, reviewer_email TEXT NOT NULL, reviewer_note TEXT NOT NULL,
  qualified_person TEXT, credential_reference TEXT, waiver_expires_at TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS compliance_review_case_idx ON compliance_case_reviews(organization_id,property_id,case_id,created_at);

CREATE TABLE IF NOT EXISTS compliance_case_events (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, property_id TEXT NOT NULL, case_id TEXT NOT NULL,
  event_type TEXT NOT NULL, from_state TEXT, to_state TEXT, actor_type TEXT NOT NULL CHECK(actor_type IN('USER','SYSTEM')),
  actor_id TEXT NOT NULL, detail_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS compliance_event_trace_idx ON compliance_case_events(organization_id,property_id,case_id,created_at);
CREATE TRIGGER IF NOT EXISTS compliance_case_events_append_only_update BEFORE UPDATE ON compliance_case_events
BEGIN SELECT RAISE(ABORT,'Compliance case events are append-only.'); END;
CREATE TRIGGER IF NOT EXISTS compliance_case_events_append_only_delete BEFORE DELETE ON compliance_case_events
BEGIN SELECT RAISE(ABORT,'Compliance case events are append-only.'); END;

CREATE TABLE IF NOT EXISTS compliance_automation_runs (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, property_id TEXT NOT NULL, run_key TEXT NOT NULL,
  programs_prepared INTEGER NOT NULL, cases_created INTEGER NOT NULL, exceptions_created INTEGER NOT NULL,
  started_at TEXT NOT NULL, completed_at TEXT NOT NULL, UNIQUE(organization_id,property_id,run_key)
);
