ALTER TABLE website_factory_projects ADD COLUMN property_context_id TEXT;
CREATE INDEX IF NOT EXISTS website_factory_property_context_idx
  ON website_factory_projects(organization_id, property_context_id, status);

CREATE INDEX IF NOT EXISTS supply_inventory_property_stock_idx
  ON supply_inventory(organization_id, property_id, category, name);
CREATE INDEX IF NOT EXISTS inventory_locations_property_idx
  ON inventory_locations(organization_id, property_id, status);
CREATE INDEX IF NOT EXISTS inventory_purchase_orders_property_status_idx
  ON inventory_purchase_orders(organization_id, property_id, status, created_at);

CREATE TABLE IF NOT EXISTS property_data_bindings (
  property_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  isolation_mode TEXT NOT NULL DEFAULT 'SHARED_SCHEMA',
  database_binding_reference TEXT,
  region TEXT NOT NULL DEFAULT 'us-central',
  migration_version TEXT NOT NULL DEFAULT '0022',
  health_status TEXT NOT NULL DEFAULT 'PENDING_CHECK',
  last_health_check TEXT,
  last_backup TEXT,
  replication_status TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS property_data_bindings_org_idx
  ON property_data_bindings(organization_id, isolation_mode, health_status);
