CREATE TABLE IF NOT EXISTS external_system_federations (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, system_key TEXT NOT NULL,
  display_name TEXT NOT NULL, base_url TEXT NOT NULL, status TEXT NOT NULL,
  trust_mode TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(organization_id, system_key)
);
CREATE TABLE IF NOT EXISTS property_federation_mappings (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, property_id TEXT NOT NULL,
  system_key TEXT NOT NULL, external_property_id TEXT NOT NULL, external_property_name TEXT NOT NULL,
  status TEXT NOT NULL, verified_by TEXT, verified_at TEXT, created_by TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(organization_id, property_id, system_key),
  UNIQUE(organization_id, system_key, external_property_id)
);
CREATE INDEX IF NOT EXISTS property_federation_scope_idx ON property_federation_mappings(organization_id,property_id,system_key,status);
