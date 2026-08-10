CREATE TABLE `employee_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_email` text NOT NULL,
	`job_title` text DEFAULT '' NOT NULL,
	`department` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`extension` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`updated_by_email` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `employee_profiles_org_email_idx` ON `employee_profiles` (`organization_id`,`user_email`);--> statement-breakpoint
CREATE TABLE `employee_shifts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_email` text NOT NULL,
	`role_label` text DEFAULT '' NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`created_by_email` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `front_desk_items` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`item_type` text DEFAULT 'guest_request' NOT NULL,
	`title` text NOT NULL,
	`details` text DEFAULT '' NOT NULL,
	`room_reference` text DEFAULT '' NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`assigned_to_email` text,
	`due_at` text,
	`created_by_email` text NOT NULL,
	`completed_by_email` text,
	`completed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `operations_settings` (
	`organization_id` text PRIMARY KEY NOT NULL,
	`time_lock_enabled` integer DEFAULT 0 NOT NULL,
	`updated_by_email` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `time_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`property_id` text,
	`user_email` text NOT NULL,
	`clock_in_at` text NOT NULL,
	`clock_out_at` text,
	`clock_in_ip` text DEFAULT '' NOT NULL,
	`clock_out_ip` text DEFAULT '' NOT NULL,
	`location_name` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `work_locations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`allowed_ip` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_by_email` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `work_locations_org_ip_idx` ON `work_locations` (`organization_id`,`allowed_ip`);
