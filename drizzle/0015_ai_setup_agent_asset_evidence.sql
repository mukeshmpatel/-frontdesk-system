CREATE TABLE IF NOT EXISTS `property_asset_attachments` (
  `id` text PRIMARY KEY NOT NULL,
  `organization_id` text NOT NULL,
  `asset_id` text NOT NULL,
  `object_key` text NOT NULL,
  `file_name` text NOT NULL,
  `content_type` text NOT NULL,
  `size_bytes` integer NOT NULL,
  `attachment_type` text NOT NULL,
  `notes` text DEFAULT '' NOT NULL,
  `uploaded_by` text NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `property_asset_attachments_asset_idx` ON `property_asset_attachments` (`organization_id`,`asset_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ai_setup_sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `organization_id` text NOT NULL,
  `actor_email` text NOT NULL,
  `input_mode` text NOT NULL,
  `instruction` text NOT NULL,
  `setup_type` text NOT NULL,
  `status` text NOT NULL,
  `plan_json` text NOT NULL,
  `questions_json` text NOT NULL,
  `assumptions_json` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `approved_at` text,
  `executed_at` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ai_setup_sessions_actor_idx` ON `ai_setup_sessions` (`organization_id`,`actor_email`,`created_at`);
