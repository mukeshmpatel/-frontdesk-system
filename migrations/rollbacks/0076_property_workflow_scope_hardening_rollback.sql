-- Compatibility rollback for migration 0076.
-- If a code exists for multiple properties, the legacy organization-level row is preferred.

DROP INDEX IF EXISTS idx_compliance_templates_property_due;

CREATE TABLE maintenance_compliance_templates_organization_scoped (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  property_id TEXT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  frequency TEXT NOT NULL,
  required_evidence TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  next_due_at TEXT NOT NULL,
  UNIQUE(organization_id,code)
);

INSERT OR IGNORE INTO maintenance_compliance_templates_organization_scoped
  (id,organization_id,property_id,code,name,description,frequency,required_evidence,active,next_due_at)
SELECT id,organization_id,property_id,code,name,description,frequency,required_evidence,active,next_due_at
FROM maintenance_compliance_templates
ORDER BY CASE WHEN property_id IS NULL THEN 0 ELSE 1 END,id;

DROP TABLE maintenance_compliance_templates;
ALTER TABLE maintenance_compliance_templates_organization_scoped RENAME TO maintenance_compliance_templates;
