CREATE TABLE IF NOT EXISTS `property_assets` (
  `id` text PRIMARY KEY NOT NULL,
  `organization_id` text NOT NULL,
  `property_id` text,
  `parent_id` text,
  `asset_type` text NOT NULL,
  `code` text NOT NULL,
  `name` text NOT NULL,
  `description` text DEFAULT '' NOT NULL,
  `status` text DEFAULT 'ACTIVE' NOT NULL,
  `floor_number` integer,
  `room_number` text,
  `room_type` text,
  `capacity` integer,
  `area_sq_ft` real,
  `manufacturer` text,
  `model` text,
  `serial_number` text,
  `install_date` text,
  `warranty_expires_at` text,
  `metadata_json` text DEFAULT '{}' NOT NULL,
  `created_by_email` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `property_assets_org_type_code_idx` ON `property_assets` (`organization_id`,`asset_type`,`code`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `property_assets_hierarchy_idx` ON `property_assets` (`organization_id`,`parent_id`,`asset_type`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `property_asset_audit` (
  `id` text PRIMARY KEY NOT NULL,
  `organization_id` text NOT NULL,
  `asset_id` text NOT NULL,
  `actor_email` text NOT NULL,
  `event_type` text NOT NULL,
  `detail_json` text NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `property_asset_audit_idx` ON `property_asset_audit` (`organization_id`,`asset_id`,`created_at`);
