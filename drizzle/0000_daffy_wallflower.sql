CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`encrypted_value` text NOT NULL,
	`owner_email` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `google_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`user_email` text NOT NULL,
	`google_subject` text NOT NULL,
	`account_email` text NOT NULL,
	`display_name` text,
	`encrypted_refresh_token` text NOT NULL,
	`scopes` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `google_connections_user_account_idx` ON `google_connections` (`user_email`,`google_subject`);--> statement-breakpoint
CREATE TABLE `oauth_states` (
	`state` text PRIMARY KEY NOT NULL,
	`user_email` text NOT NULL,
	`code_verifier` text NOT NULL,
	`expires_at` integer NOT NULL
);
