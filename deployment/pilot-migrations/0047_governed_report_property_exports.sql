-- Forward-only repair: canonical property isolation and server-attested exports.
ALTER TABLE report_export_audit RENAME TO report_export_audit_legacy_0047;
CREATE TABLE report_export_audit (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL DEFAULT '',
  user_email TEXT NOT NULL,
  report_id TEXT NOT NULL,
  format TEXT NOT NULL,
  filters_json TEXT NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0,
  content_sha256 TEXT NOT NULL DEFAULT '',
  content_length INTEGER NOT NULL DEFAULT 0,
  exported_at TEXT NOT NULL
);
INSERT INTO report_export_audit
  (id,organization_id,property_id,user_email,report_id,format,filters_json,row_count,content_sha256,content_length,exported_at)
SELECT id,organization_id,COALESCE((
  SELECT p.id FROM property_contexts p
  WHERE p.organization_id=report_export_audit_legacy_0047.organization_id
  ORDER BY CASE WHEN p.code='WG-SALINA' THEN 0 ELSE 1 END,p.created_at LIMIT 1
),'UNASSIGNED'),user_email,report_id,format,filters_json,row_count,'',0,exported_at
FROM report_export_audit_legacy_0047;
DROP TABLE report_export_audit_legacy_0047;
CREATE INDEX IF NOT EXISTS report_export_audit_org_time_idx
ON report_export_audit(organization_id,exported_at);

UPDATE report_facts
SET property_id=COALESCE((
  SELECT p.id FROM property_contexts p
  WHERE p.organization_id=report_facts.organization_id
  ORDER BY CASE WHEN p.code='WG-SALINA' THEN 0 ELSE 1 END,p.created_at LIMIT 1
),'UNASSIGNED')
WHERE property_id='primary';

UPDATE report_events
SET property_id=COALESCE((
  SELECT p.id FROM property_contexts p
  WHERE p.organization_id=report_events.organization_id
  ORDER BY CASE WHEN p.code='WG-SALINA' THEN 0 ELSE 1 END,p.created_at LIMIT 1
),'UNASSIGNED')
WHERE property_id='primary';

CREATE INDEX IF NOT EXISTS report_facts_property_query_idx
ON report_facts(organization_id,property_id,fact_type,occurred_at);
CREATE INDEX IF NOT EXISTS report_export_property_time_idx
ON report_export_audit(organization_id,property_id,exported_at);
