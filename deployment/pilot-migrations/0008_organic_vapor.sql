CREATE INDEX `autonomous_intake_org_created_idx` ON `autonomous_intake_executions` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `realtime_events_org_created_idx` ON `realtime_events` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `report_drilldown_scope_expiry_idx` ON `report_drilldown_tokens` (`organization_id`,`user_email`,`expires_at`);