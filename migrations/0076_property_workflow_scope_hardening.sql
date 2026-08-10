-- Batch 3 Workflow 2 follow-up: make compliance templates truly property-scoped.
-- Existing rows are preserved; the prior organization-wide uniqueness constraint is replaced.

CREATE TABLE maintenance_compliance_templates_property_scoped (
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
  UNIQUE(organization_id,property_id,code)
);

INSERT INTO maintenance_compliance_templates_property_scoped
  (id,organization_id,property_id,code,name,description,frequency,required_evidence,active,next_due_at)
SELECT id,organization_id,property_id,code,name,description,frequency,required_evidence,active,next_due_at
FROM maintenance_compliance_templates;

DROP TABLE maintenance_compliance_templates;
ALTER TABLE maintenance_compliance_templates_property_scoped RENAME TO maintenance_compliance_templates;

CREATE INDEX idx_compliance_templates_property_due
  ON maintenance_compliance_templates(organization_id,property_id,active,next_due_at);
