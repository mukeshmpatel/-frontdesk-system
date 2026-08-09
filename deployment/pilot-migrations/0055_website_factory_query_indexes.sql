-- Deployment-owned indexes for Website Factory property selection and reconciliation queues.
CREATE INDEX IF NOT EXISTS property_reconciliation_status_idx
  ON property_reconciliation_plans(organization_id, status, created_at);
CREATE INDEX IF NOT EXISTS website_project_property_idx
  ON website_factory_projects(organization_id, property_context_id, status, updated_at);
