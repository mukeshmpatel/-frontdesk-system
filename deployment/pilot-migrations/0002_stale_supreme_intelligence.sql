CREATE TABLE `staff_event_attendees` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`user_email` text NOT NULL,
	`response` text,
	`reply` text DEFAULT '' NOT NULL,
	`responded_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `staff_event_attendees_event_email_idx` ON `staff_event_attendees` (`event_id`,`user_email`);--> statement-breakpoint
CREATE TABLE `staff_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`created_by_email` text NOT NULL,
	`title` text NOT NULL,
	`scheduled_at` text NOT NULL,
	`end_at` text,
	`note` text DEFAULT '' NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`response_options` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `staff_members` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_email` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text DEFAULT 'staff' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`invited_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `staff_members_org_email_idx` ON `staff_members` (`organization_id`,`user_email`);--> statement-breakpoint
CREATE TABLE `staff_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text,
	`recipient_email` text NOT NULL,
	`sender_email` text NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`status` text DEFAULT 'unread' NOT NULL,
	`created_at` text NOT NULL,
	`read_at` text
);
--> statement-breakpoint
CREATE TABLE `staff_organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner_email` text NOT NULL,
	`created_at` text NOT NULL
);
