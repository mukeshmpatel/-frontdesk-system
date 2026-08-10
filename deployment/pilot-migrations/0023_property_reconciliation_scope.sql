CREATE INDEX IF NOT EXISTS property_assets_property_idx
  ON property_assets(organization_id,property_id,parent_id,asset_type);
CREATE INDEX IF NOT EXISTS operational_work_orders_property_idx
  ON operational_work_orders(organization_id,property_id,department,status,due_at);
CREATE INDEX IF NOT EXISTS work_evidence_property_idx
  ON work_evidence_reviews(organization_id,property_id,work_order_id,created_at);

CREATE TABLE IF NOT EXISTS property_reconciliation_plans (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  source_asset_id TEXT,
  source_website_project_id TEXT,
  proposed_property_id TEXT NOT NULL,
  proposed_code TEXT NOT NULL,
  proposed_name TEXT NOT NULL,
  proposed_address TEXT NOT NULL,
  status TEXT NOT NULL,
  descendant_count INTEGER NOT NULL DEFAULT 0,
  conflicts_json TEXT NOT NULL,
  rollback_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  approved_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS property_reconciliation_audit (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  detail_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS property_scope_migration_exceptions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  candidate_property_ids_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'NEEDS_REVIEW',
  resolved_property_id TEXT,
  resolved_by TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS website_factory_revisions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  revision_number INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  change_summary TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(project_id,revision_number)
);
