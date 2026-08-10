CREATE TABLE `autonomous_intake_executions` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_email` text NOT NULL,
	`input_type` text NOT NULL,
	`redacted_input` text NOT NULL,
	`raw_input_checksum` text NOT NULL,
	`intent` text NOT NULL,
	`extracted_metadata_json` text NOT NULL,
	`confidence` integer NOT NULL,
	`status` text NOT NULL,
	`executed_entity_type` text,
	`executed_entity_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `realtime_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_type` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `report_drilldown_tokens` (
	`token` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_email` text NOT NULL,
	`metric_type` text NOT NULL,
	`record_ids_json` text NOT NULL,
	`from_at` text NOT NULL,
	`to_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL
);
