CREATE TABLE `report_events` (
  `id` text PRIMARY KEY NOT NULL,
  `organization_id` text NOT NULL,
  `property_id` text NOT NULL DEFAULT 'primary',
  `source_module` text NOT NULL,
  `event_type` text NOT NULL,
  `entity_type` text NOT NULL,
  `entity_id` text NOT NULL,
  `correlation_id` text NOT NULL,
  `idempotency_key` text NOT NULL,
  `schema_version` integer NOT NULL DEFAULT 1,
  `payload_json` text NOT NULL,
  `occurred_at` text NOT NULL,
  `ingested_at` text NOT NULL
);
CREATE UNIQUE INDEX `report_events_idempotency_idx` ON `report_events` (`organization_id`,`idempotency_key`);
CREATE INDEX `report_events_entity_idx` ON `report_events` (`organization_id`,`entity_type`,`entity_id`,`occurred_at`);
CREATE INDEX `report_events_cursor_idx` ON `report_events` (`organization_id`,`ingested_at`,`id`);

CREATE TABLE `report_facts` (
  `id` text PRIMARY KEY NOT NULL,
  `organization_id` text NOT NULL,
  `property_id` text NOT NULL DEFAULT 'primary',
  `event_id` text NOT NULL,
  `fact_type` text NOT NULL,
  `entity_type` text NOT NULL,
  `entity_id` text NOT NULL,
  `numeric_value` real NOT NULL DEFAULT 1,
  `unit` text NOT NULL DEFAULT 'count',
  `department` text,
  `employee_email` text,
  `room_reference` text,
  `status` text,
  `source_table` text NOT NULL,
  `source_record_id` text NOT NULL,
  `occurred_at` text NOT NULL,
  `dimensions_json` text NOT NULL DEFAULT '{}'
);
CREATE UNIQUE INDEX `report_facts_source_idx` ON `report_facts` (`organization_id`,`source_table`,`source_record_id`,`fact_type`);
CREATE INDEX `report_facts_query_idx` ON `report_facts` (`organization_id`,`fact_type`,`occurred_at`);
CREATE INDEX `report_facts_department_idx` ON `report_facts` (`organization_id`,`department`,`occurred_at`);
CREATE INDEX `report_facts_employee_idx` ON `report_facts` (`organization_id`,`employee_email`,`occurred_at`);

CREATE TABLE `report_saved_views` (
  `id` text PRIMARY KEY NOT NULL,
  `organization_id` text NOT NULL,
  `user_email` text NOT NULL,
  `name` text NOT NULL,
  `report_id` text NOT NULL,
  `filters_json` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
CREATE UNIQUE INDEX `report_saved_views_owner_name_idx` ON `report_saved_views` (`organization_id`,`user_email`,`name`);

CREATE TABLE `report_export_audit` (
  `id` text PRIMARY KEY NOT NULL,
  `organization_id` text NOT NULL,
  `property_id` text NOT NULL DEFAULT '',
  `user_email` text NOT NULL,
  `report_id` text NOT NULL,
  `format` text NOT NULL,
  `filters_json` text NOT NULL,
  `row_count` integer NOT NULL DEFAULT 0,
  `content_sha256` text NOT NULL DEFAULT '',
  `content_length` integer NOT NULL DEFAULT 0,
  `exported_at` text NOT NULL
);
CREATE INDEX `report_export_audit_org_time_idx` ON `report_export_audit` (`organization_id`,`exported_at`);

CREATE TABLE `report_query_metrics` (
  `id` text PRIMARY KEY NOT NULL,
  `organization_id` text NOT NULL,
  `report_id` text NOT NULL,
  `duration_ms` integer NOT NULL,
  `query_signature` text NOT NULL,
  `explain_plan_json` text,
  `created_at` text NOT NULL
);
CREATE INDEX `report_query_metrics_slow_idx` ON `report_query_metrics` (`organization_id`,`duration_ms`,`created_at`);

CREATE TABLE `notification_source_events` (
  `id` text PRIMARY KEY NOT NULL,
  `organization_id` text NOT NULL,
  `owner_email` text NOT NULL,
  `source` text NOT NULL,
  `external_id` text NOT NULL,
  `source_account` text NOT NULL,
  `sender_label` text NOT NULL DEFAULT '',
  `subject` text NOT NULL DEFAULT '',
  `raw_content` text NOT NULL,
  `received_at` text NOT NULL,
  `processed_at` text,
  `access_scope` text NOT NULL DEFAULT 'OWNER_ADMIN',
  `created_at` text NOT NULL
);
CREATE UNIQUE INDEX `notification_source_external_idx` ON `notification_source_events` (`organization_id`,`source`,`external_id`);
CREATE INDEX `notification_source_queue_idx` ON `notification_source_events` (`organization_id`,`processed_at`,`received_at`);

CREATE TABLE `notification_action_candidates` (
  `id` text PRIMARY KEY NOT NULL,
  `organization_id` text NOT NULL,
  `source_event_id` text NOT NULL,
  `action_type` text NOT NULL,
  `urgency` text NOT NULL,
  `suggested_owner` text NOT NULL,
  `due_at` text,
  `confidence` integer NOT NULL,
  `classifier` text NOT NULL,
  `reasoning_summary` text NOT NULL,
  `decision` text NOT NULL DEFAULT 'PENDING_APPROVAL',
  `created_entity_type` text,
  `created_entity_id` text,
  `created_at` text NOT NULL,
  `decided_at` text,
  `decided_by` text
);
CREATE UNIQUE INDEX `notification_candidate_source_idx` ON `notification_action_candidates` (`source_event_id`);
CREATE INDEX `notification_candidate_queue_idx` ON `notification_action_candidates` (`organization_id`,`decision`,`created_at`);

CREATE TABLE `notification_automation_policies` (
  `id` text PRIMARY KEY NOT NULL,
  `organization_id` text NOT NULL,
  `action_type` text NOT NULL,
  `minimum_confidence` integer NOT NULL DEFAULT 90,
  `auto_create_enabled` integer NOT NULL DEFAULT 0,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
CREATE UNIQUE INDEX `notification_policy_type_idx` ON `notification_automation_policies` (`organization_id`,`action_type`);
