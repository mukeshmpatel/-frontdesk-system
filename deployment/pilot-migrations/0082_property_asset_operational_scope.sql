-- Batch 4: close remaining organization-only property-asset operational tables.
ALTER TABLE property_asset_audit ADD COLUMN property_id TEXT;
ALTER TABLE property_asset_imports ADD COLUMN property_id TEXT;
ALTER TABLE property_asset_attachments ADD COLUMN property_id TEXT;
ALTER TABLE cleaning_velocity_events ADD COLUMN property_id TEXT;
ALTER TABLE amenity_access_events ADD COLUMN property_id TEXT;
UPDATE property_asset_audit SET property_id=(SELECT a.property_id FROM property_assets a WHERE a.id=property_asset_audit.asset_id) WHERE property_id IS NULL;
UPDATE property_asset_attachments SET property_id=(SELECT a.property_id FROM property_assets a WHERE a.id=property_asset_attachments.asset_id) WHERE property_id IS NULL;
UPDATE property_asset_imports SET property_id=(SELECT canonical_property_id FROM canonical_workspace_profiles c WHERE c.organization_id=property_asset_imports.organization_id AND c.status='ACTIVE' LIMIT 1) WHERE property_id IS NULL;
UPDATE cleaning_velocity_events SET property_id=(SELECT a.property_id FROM property_assets a WHERE a.organization_id=cleaning_velocity_events.organization_id AND a.asset_type='ROOM' AND a.room_number=cleaning_velocity_events.room_number ORDER BY a.created_at DESC LIMIT 1) WHERE property_id IS NULL;
UPDATE amenity_access_events SET property_id=(SELECT a.property_id FROM property_assets a WHERE a.organization_id=amenity_access_events.organization_id AND a.asset_type='ROOM' AND a.room_number=amenity_access_events.room_number ORDER BY a.created_at DESC LIMIT 1) WHERE property_id IS NULL;
CREATE INDEX IF NOT EXISTS property_asset_audit_property_idx ON property_asset_audit(organization_id,property_id,asset_id,created_at);
CREATE INDEX IF NOT EXISTS property_asset_import_property_idx ON property_asset_imports(organization_id,property_id,created_at);
CREATE INDEX IF NOT EXISTS property_asset_attachment_property_idx ON property_asset_attachments(organization_id,property_id,asset_id,created_at);
CREATE INDEX IF NOT EXISTS cleaning_velocity_property_idx ON cleaning_velocity_events(organization_id,property_id,completed_at);
CREATE INDEX IF NOT EXISTS amenity_access_property_idx ON amenity_access_events(organization_id,property_id,occurred_at);
