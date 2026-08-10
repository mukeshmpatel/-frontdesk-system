-- Release 114: governed enterprise reporting and drill-down registry.
CREATE TABLE IF NOT EXISTS report_query_definitions (
  id TEXT PRIMARY KEY,
  query_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  base_sql TEXT NOT NULL,
  allowed_filters_json TEXT NOT NULL DEFAULT '[]',
  drill_down_target TEXT NOT NULL CHECK(drill_down_target IN ('task','invoice','guest','room','staff','reservation','order','custom')),
  version INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS report_widget_registry (
  id TEXT PRIMARY KEY,
  widget_key TEXT NOT NULL UNIQUE,
  display_label TEXT NOT NULL,
  module_key TEXT NOT NULL,
  source_query_id TEXT NOT NULL,
  refresh_strategy TEXT NOT NULL DEFAULT 'live' CHECK(refresh_strategy IN ('live','cached_5min','cached_hourly')),
  route_template TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(source_query_id) REFERENCES report_query_definitions(id)
);

CREATE TABLE IF NOT EXISTS report_drilldown_log (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  user_email TEXT NOT NULL,
  widget_key TEXT NOT NULL,
  filters_json TEXT NOT NULL DEFAULT '{}',
  result_row_count INTEGER NOT NULL,
  clicked_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS report_drilldown_log_scope_idx ON report_drilldown_log(organization_id,property_id,clicked_at);

CREATE TABLE IF NOT EXISTS saved_reports (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  owner_user_email TEXT NOT NULL,
  name TEXT NOT NULL,
  query_definition_id TEXT NOT NULL,
  filters_json TEXT NOT NULL DEFAULT '{}',
  schedule TEXT NOT NULL DEFAULT 'none' CHECK(schedule IN ('none','daily','weekly','monthly')),
  delivery_channel TEXT NOT NULL DEFAULT 'in_app' CHECK(delivery_channel IN ('in_app','email','both')),
  is_shared_tenant_wide INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(query_definition_id) REFERENCES report_query_definitions(id)
);
CREATE INDEX IF NOT EXISTS saved_reports_owner_idx ON saved_reports(organization_id,property_id,owner_user_email);

CREATE TABLE IF NOT EXISTS module_test_runs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  property_id TEXT,
  module_key TEXT NOT NULL,
  test_name TEXT NOT NULL,
  result TEXT NOT NULL CHECK(result IN ('PASS','FAIL','WARN','BLOCKED')),
  evidence_json TEXT NOT NULL DEFAULT '{}',
  notes TEXT,
  run_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS module_test_runs_module_idx ON module_test_runs(organization_id,module_key,run_at);

INSERT OR IGNORE INTO report_query_definitions(id,query_key,name,description,base_sql,allowed_filters_json,drill_down_target,version,active,created_by,created_at,updated_at)
VALUES
('rqd-tasks-open','tasks.open','Open operational tasks','Canonical property-scoped incomplete operational work.','SELECT * FROM operational_work_orders WHERE organization_id=:organization_id AND property_id=:property_id AND status NOT IN (''COMPLETE'',''VERIFIED'')','["department","assigned_to","status"]','task',1,1,'AAIQ-MIGRATION','2026-08-03T00:00:00.000Z','2026-08-03T00:00:00.000Z'),
('rqd-tasks-urgent','tasks.urgent','Urgent operational tasks','Critical incomplete work from the same canonical task set.','SELECT * FROM operational_work_orders WHERE organization_id=:organization_id AND property_id=:property_id AND status NOT IN (''COMPLETE'',''VERIFIED'') AND priority=''CRITICAL''','["department","assigned_to","status"]','task',1,1,'AAIQ-MIGRATION','2026-08-03T00:00:00.000Z','2026-08-03T00:00:00.000Z');

INSERT OR IGNORE INTO report_widget_registry(id,widget_key,display_label,module_key,source_query_id,refresh_strategy,route_template,active,created_at,updated_at)
VALUES
('rw-tasks-open','tasks.open','Open Tasks','ENTERPRISE_REPORTING','rqd-tasks-open','live','/property-operations?workOrder=:id',1,'2026-08-03T00:00:00.000Z','2026-08-03T00:00:00.000Z'),
('rw-tasks-urgent','tasks.urgent','Urgent Tasks','ENTERPRISE_REPORTING','rqd-tasks-urgent','live','/property-operations?workOrder=:id',1,'2026-08-03T00:00:00.000Z','2026-08-03T00:00:00.000Z');

