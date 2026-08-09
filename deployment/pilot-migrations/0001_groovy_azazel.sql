CREATE TABLE `intake_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`user_email` text NOT NULL,
	`name` text NOT NULL,
	`provider` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`last_received_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `intake_sources_token_hash_unique` ON `intake_sources` (`token_hash`);--> statement-breakpoint
CREATE TABLE `media_memories` (
	`id` text PRIMARY KEY NOT NULL,
	`user_email` text NOT NULL,
	`title` text NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`user_email` text NOT NULL,
	`title` text NOT NULL,
	`scheduled_at` text NOT NULL,
	`end_at` text,
	`note` text DEFAULT '' NOT NULL,
	`source_type` text NOT NULL,
	`source_label` text NOT NULL,
	`source_message_id` text,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`confidence` integer DEFAULT 100 NOT NULL,
	`media_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reminders_user_source_message_idx` ON `reminders` (`user_email`,`source_type`,`source_message_id`);