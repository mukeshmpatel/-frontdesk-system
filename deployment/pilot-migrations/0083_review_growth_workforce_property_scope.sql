-- Release 127: close remaining organization-wide operational data leaks.
-- Forward-only and additive. Existing rows are assigned to the active canonical
-- workspace when one exists; otherwise the user's active/default property wins.

ALTER TABLE review_source_connections ADD COLUMN property_id TEXT;
ALTER TABLE guest_review_events ADD COLUMN property_id TEXT;
ALTER TABLE review_response_drafts ADD COLUMN property_id TEXT;
ALTER TABLE review_recovery_cases ADD COLUMN property_id TEXT;
ALTER TABLE review_advocacy_invites ADD COLUMN property_id TEXT;

ALTER TABLE integration_credential_vault ADD COLUMN property_id TEXT;
ALTER TABLE marketing_content_items ADD COLUMN property_id TEXT;
ALTER TABLE audience_segments ADD COLUMN property_id TEXT;
ALTER TABLE platform_profile_updates ADD COLUMN property_id TEXT;
ALTER TABLE growth_platform_audit ADD COLUMN property_id TEXT;
ALTER TABLE guest_behavior_events ADD COLUMN property_id TEXT;

ALTER TABLE workforce_report_uploads ADD COLUMN property_id TEXT;

ALTER TABLE distribution_reservation_records ADD COLUMN property_id TEXT;
ALTER TABLE ota_reconciliation_runs ADD COLUMN property_id TEXT;
ALTER TABLE ota_reconciliation_exceptions ADD COLUMN property_id TEXT;

ALTER TABLE inventory_transactions ADD COLUMN property_id TEXT;
ALTER TABLE inventory_requisitions ADD COLUMN property_id TEXT;
ALTER TABLE inventory_vendors ADD COLUMN property_id TEXT;
-- amenity_access_events and cleaning_velocity_events were already scoped by
-- migration 0082. Release 127 only backfills any remaining canonical rows and
-- reuses the existing property indexes below.

UPDATE review_source_connections SET property_id=COALESCE(property_id,
 (SELECT canonical_property_id FROM canonical_workspace_profiles c
  WHERE c.organization_id=review_source_connections.organization_id AND c.status='ACTIVE' LIMIT 1));
UPDATE guest_review_events SET property_id=COALESCE(property_id,
 (SELECT canonical_property_id FROM canonical_workspace_profiles c
  WHERE c.organization_id=guest_review_events.organization_id AND c.status='ACTIVE' LIMIT 1));
UPDATE review_response_drafts SET property_id=COALESCE(property_id,
 (SELECT property_id FROM guest_review_events r WHERE r.id=review_response_drafts.review_id));
UPDATE review_recovery_cases SET property_id=COALESCE(property_id,
 (SELECT property_id FROM guest_review_events r WHERE r.id=review_recovery_cases.review_id));
UPDATE review_advocacy_invites SET property_id=COALESCE(property_id,
 (SELECT property_id FROM guest_review_events r WHERE r.id=review_advocacy_invites.review_id));

UPDATE integration_credential_vault SET property_id=COALESCE(property_id,
 (SELECT canonical_property_id FROM canonical_workspace_profiles c
  WHERE c.organization_id=integration_credential_vault.organization_id AND c.status='ACTIVE' LIMIT 1));
UPDATE marketing_content_items SET property_id=COALESCE(property_id,
 (SELECT canonical_property_id FROM canonical_workspace_profiles c
  WHERE c.organization_id=marketing_content_items.organization_id AND c.status='ACTIVE' LIMIT 1));
UPDATE audience_segments SET property_id=COALESCE(property_id,
 (SELECT canonical_property_id FROM canonical_workspace_profiles c
  WHERE c.organization_id=audience_segments.organization_id AND c.status='ACTIVE' LIMIT 1));
UPDATE platform_profile_updates SET property_id=COALESCE(property_id,
 (SELECT canonical_property_id FROM canonical_workspace_profiles c
  WHERE c.organization_id=platform_profile_updates.organization_id AND c.status='ACTIVE' LIMIT 1));
UPDATE growth_platform_audit SET property_id=COALESCE(property_id,
 (SELECT canonical_property_id FROM canonical_workspace_profiles c
  WHERE c.organization_id=growth_platform_audit.organization_id AND c.status='ACTIVE' LIMIT 1));
UPDATE guest_behavior_events SET property_id=COALESCE(property_id,
 (SELECT canonical_property_id FROM canonical_workspace_profiles c
  WHERE c.organization_id=guest_behavior_events.organization_id AND c.status='ACTIVE' LIMIT 1));
UPDATE workforce_report_uploads SET property_id=COALESCE(property_id,
 (SELECT canonical_property_id FROM canonical_workspace_profiles c
  WHERE c.organization_id=workforce_report_uploads.organization_id AND c.status='ACTIVE' LIMIT 1));

UPDATE distribution_reservation_records SET property_id=COALESCE(property_id,
 (SELECT canonical_property_id FROM canonical_workspace_profiles c
  WHERE c.organization_id=distribution_reservation_records.organization_id AND c.status='ACTIVE' LIMIT 1));
UPDATE ota_reconciliation_runs SET property_id=COALESCE(property_id,
 (SELECT canonical_property_id FROM canonical_workspace_profiles c
  WHERE c.organization_id=ota_reconciliation_runs.organization_id AND c.status='ACTIVE' LIMIT 1));
UPDATE ota_reconciliation_exceptions SET property_id=COALESCE(property_id,
 (SELECT property_id FROM ota_reconciliation_runs r WHERE r.id=ota_reconciliation_exceptions.run_id));

UPDATE inventory_transactions SET property_id=COALESCE(property_id,
 (SELECT canonical_property_id FROM canonical_workspace_profiles c
  WHERE c.organization_id=inventory_transactions.organization_id AND c.status='ACTIVE' LIMIT 1));
UPDATE inventory_requisitions SET property_id=COALESCE(property_id,
 (SELECT canonical_property_id FROM canonical_workspace_profiles c
  WHERE c.organization_id=inventory_requisitions.organization_id AND c.status='ACTIVE' LIMIT 1));
UPDATE inventory_vendors SET property_id=COALESCE(property_id,
 (SELECT canonical_property_id FROM canonical_workspace_profiles c
  WHERE c.organization_id=inventory_vendors.organization_id AND c.status='ACTIVE' LIMIT 1));
UPDATE amenity_access_events SET property_id=COALESCE(property_id,
 (SELECT canonical_property_id FROM canonical_workspace_profiles c
  WHERE c.organization_id=amenity_access_events.organization_id AND c.status='ACTIVE' LIMIT 1));
UPDATE cleaning_velocity_events SET property_id=COALESCE(property_id,
 (SELECT canonical_property_id FROM canonical_workspace_profiles c
  WHERE c.organization_id=cleaning_velocity_events.organization_id AND c.status='ACTIVE' LIMIT 1));

CREATE INDEX IF NOT EXISTS review_events_property_queue_idx ON guest_review_events(organization_id,property_id,sentiment,received_at);
CREATE INDEX IF NOT EXISTS review_drafts_property_idx ON review_response_drafts(organization_id,property_id,status,created_at);
CREATE INDEX IF NOT EXISTS review_cases_property_idx ON review_recovery_cases(organization_id,property_id,status,priority);
CREATE INDEX IF NOT EXISTS review_sources_property_idx ON review_source_connections(organization_id,property_id,source);
CREATE INDEX IF NOT EXISTS review_advocacy_property_idx ON review_advocacy_invites(organization_id,property_id,status,created_at);
CREATE INDEX IF NOT EXISTS growth_content_property_idx ON marketing_content_items(organization_id,property_id,status,created_at);
CREATE INDEX IF NOT EXISTS growth_segments_property_idx ON audience_segments(organization_id,property_id,status,created_at);
CREATE INDEX IF NOT EXISTS growth_updates_property_idx ON platform_profile_updates(organization_id,property_id,status,created_at);
CREATE INDEX IF NOT EXISTS growth_behavior_property_idx ON guest_behavior_events(organization_id,property_id,consent_status,occurred_at);
CREATE INDEX IF NOT EXISTS workforce_upload_property_idx ON workforce_report_uploads(organization_id,property_id,created_at);
CREATE INDEX IF NOT EXISTS ota_records_property_stay_idx ON distribution_reservation_records(organization_id,property_id,arrival_date,departure_date);
CREATE INDEX IF NOT EXISTS ota_runs_property_period_idx ON ota_reconciliation_runs(organization_id,property_id,period_start,period_end);
CREATE INDEX IF NOT EXISTS ota_exceptions_property_queue_idx ON ota_reconciliation_exceptions(organization_id,property_id,status,severity);
CREATE INDEX IF NOT EXISTS inventory_transaction_property_idx ON inventory_transactions(organization_id,property_id,sku,created_at);
CREATE INDEX IF NOT EXISTS inventory_requisition_property_idx ON inventory_requisitions(organization_id,property_id,status,department,created_at);
CREATE INDEX IF NOT EXISTS inventory_vendor_property_idx ON inventory_vendors(organization_id,property_id,status,name);
CREATE INDEX IF NOT EXISTS amenity_access_property_idx ON amenity_access_events(organization_id,property_id,occurred_at);
CREATE INDEX IF NOT EXISTS cleaning_velocity_property_idx ON cleaning_velocity_events(organization_id,property_id,completed_at);
