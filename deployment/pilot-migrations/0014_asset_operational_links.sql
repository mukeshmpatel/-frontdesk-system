ALTER TABLE `operational_work_orders` ADD COLUMN `asset_id` text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `operational_work_orders_asset_idx` ON `operational_work_orders` (`organization_id`,`asset_id`,`status`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `property_asset_imports` (
  `id` text PRIMARY KEY NOT NULL,
  `organization_id` text NOT NULL,
  `file_name` text NOT NULL,
  `row_count` integer NOT NULL,
  `created_count` integer NOT NULL,
  `skipped_count` integer NOT NULL,
  `status` text NOT NULL,
  `imported_by` text NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `property_asset_imports_org_created_idx` ON `property_asset_imports` (`organization_id`,`created_at`);
