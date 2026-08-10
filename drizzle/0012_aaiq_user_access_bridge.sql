CREATE TABLE IF NOT EXISTS `user_access_profiles` (
  `organization_id` text NOT NULL,
  `user_email` text NOT NULL,
  `department` text DEFAULT 'FRONT_DESK' NOT NULL,
  `role_tier` text DEFAULT 'ASSOCIATE' NOT NULL,
  `mfa_required` integer DEFAULT 0 NOT NULL,
  `mfa_status` text DEFAULT 'NOT_ENROLLED' NOT NULL,
  `mfa_methods_json` text DEFAULT '[]' NOT NULL,
  `recovery_email` text,
  `recovery_phone` text,
  `access_status` text DEFAULT 'ACTIVE' NOT NULL,
  `last_access_review_at` text,
  `updated_by_email` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `user_access_profiles_org_email_idx` ON `user_access_profiles` (`organization_id`,`user_email`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `user_access_profiles_scope_idx` ON `user_access_profiles` (`organization_id`,`department`,`role_tier`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `user_module_access` (
  `organization_id` text NOT NULL,
  `user_email` text NOT NULL,
  `module_key` text NOT NULL,
  `access_level` text DEFAULT 'USE' NOT NULL,
  `granted_by_email` text NOT NULL,
  `granted_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `user_module_access_grant_idx` ON `user_module_access` (`organization_id`,`user_email`,`module_key`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `user_module_access_module_idx` ON `user_module_access` (`organization_id`,`module_key`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `identity_recovery_requests` (
  `id` text PRIMARY KEY NOT NULL,
  `organization_id` text NOT NULL,
  `user_email` text NOT NULL,
  `recovery_type` text NOT NULL,
  `delivery_channel` text NOT NULL,
  `destination_masked` text NOT NULL,
  `status` text NOT NULL,
  `requested_by_email` text NOT NULL,
  `requested_at` text NOT NULL,
  `expires_at` text NOT NULL,
  `completed_at` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `identity_recovery_pending_idx` ON `identity_recovery_requests` (`organization_id`,`status`,`expires_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `access_audit_events` (
  `id` text PRIMARY KEY NOT NULL,
  `organization_id` text NOT NULL,
  `actor_email` text NOT NULL,
  `target_email` text NOT NULL,
  `event_type` text NOT NULL,
  `detail_json` text NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `access_audit_events_org_created_idx` ON `access_audit_events` (`organization_id`,`created_at`);
