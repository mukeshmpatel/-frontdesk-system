import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  encryptedValue: text("encrypted_value").notNull(),
  ownerEmail: text("owner_email").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const oauthStates = sqliteTable("oauth_states", {
  state: text("state").primaryKey(),
  userEmail: text("user_email").notNull(),
  codeVerifier: text("code_verifier").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export const googleConnections = sqliteTable(
  "google_connections",
  {
    id: text("id").primaryKey(),
    userEmail: text("user_email").notNull(),
    googleSubject: text("google_subject").notNull(),
    accountEmail: text("account_email").notNull(),
    displayName: text("display_name"),
    encryptedRefreshToken: text("encrypted_refresh_token").notNull(),
    scopes: text("scopes").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("google_connections_user_account_idx").on(
      table.userEmail,
      table.googleSubject,
    ),
  ],
);

export const reminders = sqliteTable(
  "reminders",
  {
    id: text("id").primaryKey(),
    userEmail: text("user_email").notNull(),
    title: text("title").notNull(),
    scheduledAt: text("scheduled_at").notNull(),
    endAt: text("end_at"),
    note: text("note").notNull().default(""),
    sourceType: text("source_type").notNull(),
    sourceLabel: text("source_label").notNull(),
    sourceMessageId: text("source_message_id"),
    status: text("status").notNull().default("scheduled"),
    confidence: integer("confidence").notNull().default(100),
    mediaId: text("media_id"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("reminders_user_source_message_idx").on(
      table.userEmail,
      table.sourceType,
      table.sourceMessageId,
    ),
  ],
);

export const mediaMemories = sqliteTable("media_memories", {
  id: text("id").primaryKey(),
  userEmail: text("user_email").notNull(),
  title: text("title").notNull(),
  objectKey: text("object_key").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  createdAt: text("created_at").notNull(),
});

export const intakeSources = sqliteTable("intake_sources", {
  id: text("id").primaryKey(),
  userEmail: text("user_email").notNull(),
  name: text("name").notNull(),
  provider: text("provider").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: text("created_at").notNull(),
  lastReceivedAt: text("last_received_at"),
});

export const staffOrganizations = sqliteTable("staff_organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ownerEmail: text("owner_email").notNull(),
  createdAt: text("created_at").notNull(),
});

export const staffMembers = sqliteTable(
  "staff_members",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    userEmail: text("user_email").notNull(),
    displayName: text("display_name").notNull(),
    role: text("role").notNull().default("staff"),
    status: text("status").notNull().default("pending"),
    invitedBy: text("invited_by").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("staff_members_org_email_idx").on(
      table.organizationId,
      table.userEmail,
    ),
  ],
);

export const staffEvents = sqliteTable("staff_events", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  createdByEmail: text("created_by_email").notNull(),
  title: text("title").notNull(),
  scheduledAt: text("scheduled_at").notNull(),
  endAt: text("end_at"),
  note: text("note").notNull().default(""),
  location: text("location").notNull().default(""),
  responseOptions: text("response_options").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const staffEventAttendees = sqliteTable(
  "staff_event_attendees",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id").notNull(),
    userEmail: text("user_email").notNull(),
    response: text("response"),
    reply: text("reply").notNull().default(""),
    respondedAt: text("responded_at"),
  },
  (table) => [
    uniqueIndex("staff_event_attendees_event_email_idx").on(
      table.eventId,
      table.userEmail,
    ),
  ],
);

export const staffNotifications = sqliteTable("staff_notifications", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  eventId: text("event_id"),
  recipientEmail: text("recipient_email").notNull(),
  senderEmail: text("sender_email").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull().default("unread"),
  createdAt: text("created_at").notNull(),
  readAt: text("read_at"),
});

export const operationsSettings = sqliteTable("operations_settings", {
  organizationId: text("organization_id").primaryKey(),
  timeLockEnabled: integer("time_lock_enabled").notNull().default(0),
  updatedByEmail: text("updated_by_email").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const workLocations = sqliteTable(
  "work_locations",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    name: text("name").notNull(),
    allowedIp: text("allowed_ip").notNull(),
    active: integer("active").notNull().default(1),
    createdByEmail: text("created_by_email").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("work_locations_org_ip_idx").on(table.organizationId, table.allowedIp),
  ],
);

export const employeeProfiles = sqliteTable(
  "employee_profiles",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    userEmail: text("user_email").notNull(),
    jobTitle: text("job_title").notNull().default(""),
    department: text("department").notNull().default(""),
    phone: text("phone").notNull().default(""),
    extension: text("extension").notNull().default(""),
    notes: text("notes").notNull().default(""),
    updatedByEmail: text("updated_by_email").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("employee_profiles_org_email_idx").on(table.organizationId, table.userEmail),
  ],
);

export const employeeShifts = sqliteTable("employee_shifts", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  userEmail: text("user_email").notNull(),
  roleLabel: text("role_label").notNull().default(""),
  location: text("location").notNull().default(""),
  startsAt: text("starts_at").notNull(),
  endsAt: text("ends_at").notNull(),
  notes: text("notes").notNull().default(""),
  status: text("status").notNull().default("scheduled"),
  createdByEmail: text("created_by_email").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const timeEntries = sqliteTable("time_entries", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  propertyId: text("property_id"),
  userEmail: text("user_email").notNull(),
  clockInAt: text("clock_in_at").notNull(),
  clockOutAt: text("clock_out_at"),
  clockInIp: text("clock_in_ip").notNull().default(""),
  clockOutIp: text("clock_out_ip").notNull().default(""),
  locationName: text("location_name").notNull().default(""),
  note: text("note").notNull().default(""),
  status: text("status").notNull().default("open"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const frontDeskItems = sqliteTable("front_desk_items", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  itemType: text("item_type").notNull().default("guest_request"),
  title: text("title").notNull(),
  details: text("details").notNull().default(""),
  roomReference: text("room_reference").notNull().default(""),
  priority: text("priority").notNull().default("normal"),
  status: text("status").notNull().default("open"),
  assignedToEmail: text("assigned_to_email"),
  dueAt: text("due_at"),
  createdByEmail: text("created_by_email").notNull(),
  completedByEmail: text("completed_by_email"),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const workforceReportUploads = sqliteTable("workforce_report_uploads", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  uploadedByEmail: text("uploaded_by_email").notNull(),
  title: text("title").notNull(),
  sourceType: text("source_type").notNull(),
  objectKey: text("object_key").notNull(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  createdAt: text("created_at").notNull(),
});

export const systemAuditTrail = sqliteTable("system_audit_trail", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  propertyId: text("property_id").notNull(),
  eventType: text("event_type").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  authorType: text("author_type").notNull(),
  authorId: text("author_id").notNull(),
  correlationId: text("correlation_id").notNull(),
  beforeJson: text("before_json"),
  afterJson: text("after_json"),
  deltaJson: text("delta_json").notNull(),
  metadataJson: text("metadata_json").notNull(),
  checksum: text("checksum").notNull(),
  occurredAt: text("occurred_at").notNull(),
}, (table) => [
  uniqueIndex("system_audit_checksum_idx").on(table.checksum),
]);

export const assetCalendarBlocks = sqliteTable("asset_calendar_blocks", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  propertyId: text("property_id").notNull(),
  assetType: text("asset_type").notNull(),
  assetId: text("asset_id").notNull(),
  blockType: text("block_type").notNull(),
  title: text("title").notNull(),
  startsAt: text("starts_at").notNull(),
  endsAt: text("ends_at").notNull(),
  status: text("status").notNull().default("active"),
  createdByEmail: text("created_by_email").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("asset_calendar_identity_idx").on(table.organizationId, table.propertyId, table.assetType, table.assetId, table.startsAt, table.endsAt),
]);

export const notificationEscalations = sqliteTable("notification_escalations", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  sourceType: text("source_type").notNull(),
  sourceId: text("source_id").notNull(),
  status: text("status").notNull().default("PENDING"),
  urgencyScore: integer("urgency_score").notNull().default(0),
  acknowledgedAt: text("acknowledged_at"),
  escalatedAt: text("escalated_at"),
  managerRecipient: text("manager_recipient"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("notification_escalation_source_idx").on(table.organizationId, table.sourceType, table.sourceId),
]);

export const notificationOutbox = sqliteTable("notification_outbox", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  escalationId: text("escalation_id"),
  route: text("route").notNull(),
  priority: text("priority").notNull(),
  recipient: text("recipient").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull().default("PENDING"),
  attempts: integer("attempts").notNull().default(0),
  providerMessageId: text("provider_message_id"),
  lastError: text("last_error"),
  availableAt: text("available_at").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const reportDrilldownTokens = sqliteTable("report_drilldown_tokens", {
  token: text("token").primaryKey(),
  organizationId: text("organization_id").notNull(),
  propertyId: text("property_id").notNull().default("UNASSIGNED"),
  userEmail: text("user_email").notNull(),
  metricType: text("metric_type").notNull(),
  recordIdsJson: text("record_ids_json").notNull(),
  fromAt: text("from_at").notNull(),
  toAt: text("to_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("report_drilldown_scope_expiry_idx").on(table.organizationId, table.propertyId, table.userEmail, table.expiresAt),
]);

export const autonomousIntakeExecutions = sqliteTable("autonomous_intake_executions", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  userEmail: text("user_email").notNull(),
  inputType: text("input_type").notNull(),
  redactedInput: text("redacted_input").notNull(),
  rawInputChecksum: text("raw_input_checksum").notNull(),
  intent: text("intent").notNull(),
  extractedMetadataJson: text("extracted_metadata_json").notNull(),
  confidence: integer("confidence").notNull(),
  status: text("status").notNull(),
  executedEntityType: text("executed_entity_type"),
  executedEntityId: text("executed_entity_id"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("autonomous_intake_org_created_idx").on(table.organizationId, table.createdAt),
]);

export const realtimeEvents = sqliteTable("realtime_events", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  eventType: text("event_type").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  payloadJson: text("payload_json").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("realtime_events_org_created_idx").on(table.organizationId, table.createdAt),
]);

export const reportEvents = sqliteTable("report_events", {
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull(),
  propertyId: text("property_id").notNull().default("UNASSIGNED"), sourceModule: text("source_module").notNull(),
  eventType: text("event_type").notNull(), entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(), correlationId: text("correlation_id").notNull(),
  idempotencyKey: text("idempotency_key").notNull(), schemaVersion: integer("schema_version").notNull().default(1),
  payloadJson: text("payload_json").notNull(), occurredAt: text("occurred_at").notNull(), ingestedAt: text("ingested_at").notNull(),
}, (table) => [
  uniqueIndex("report_events_idempotency_idx").on(table.organizationId, table.idempotencyKey),
  index("report_events_entity_idx").on(table.organizationId, table.entityType, table.entityId, table.occurredAt),
  index("report_events_cursor_idx").on(table.organizationId, table.ingestedAt, table.id),
]);

export const reportFacts = sqliteTable("report_facts", {
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull(),
  propertyId: text("property_id").notNull().default("UNASSIGNED"), eventId: text("event_id").notNull(),
  factType: text("fact_type").notNull(), entityType: text("entity_type").notNull(), entityId: text("entity_id").notNull(),
  numericValue: real("numeric_value").notNull().default(1), unit: text("unit").notNull().default("count"),
  department: text("department"), employeeEmail: text("employee_email"), roomReference: text("room_reference"),
  status: text("status"), sourceTable: text("source_table").notNull(), sourceRecordId: text("source_record_id").notNull(),
  occurredAt: text("occurred_at").notNull(), dimensionsJson: text("dimensions_json").notNull().default("{}"),
}, (table) => [
  uniqueIndex("report_facts_property_source_idx").on(table.organizationId, table.propertyId, table.sourceTable, table.sourceRecordId, table.factType),
  index("report_facts_query_idx").on(table.organizationId, table.factType, table.occurredAt),
]);

export const reportSavedViews = sqliteTable("report_saved_views", {
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull(), userEmail: text("user_email").notNull(),
  propertyId: text("property_id").notNull().default("UNASSIGNED"),
  name: text("name").notNull(), reportId: text("report_id").notNull(), filtersJson: text("filters_json").notNull(),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("report_saved_views_owner_property_name_idx").on(table.organizationId, table.propertyId, table.userEmail, table.name)]);

export const reportRunReceipts = sqliteTable("report_run_receipts", {
  id:text("id").primaryKey(),organizationId:text("organization_id").notNull(),propertyId:text("property_id").notNull(),
  userEmail:text("user_email").notNull(),reportId:text("report_id").notNull(),filtersJson:text("filters_json").notNull(),
  sourceCoverageJson:text("source_coverage_json").notNull(),resultRowCount:integer("result_row_count").notNull(),
  resultSha256:text("result_sha256").notNull(),durationMs:integer("duration_ms").notNull(),createdAt:text("created_at").notNull(),
},table=>[index("report_run_receipts_scope_idx").on(table.organizationId,table.propertyId,table.createdAt)]);

export const reportExportAudit = sqliteTable("report_export_audit", {
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull(), userEmail: text("user_email").notNull(),
  reportId: text("report_id").notNull(), format: text("format").notNull(), filtersJson: text("filters_json").notNull(),
  rowCount: integer("row_count").notNull().default(0), propertyId:text("property_id").notNull().default(""),
  contentSha256:text("content_sha256").notNull().default(""),contentLength:integer("content_length").notNull().default(0),exportedAt: text("exported_at").notNull(),
});

export const notificationSourceEvents = sqliteTable("notification_source_events", {
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull(), ownerEmail: text("owner_email").notNull(),
  source: text("source").notNull(), externalId: text("external_id").notNull(), sourceAccount: text("source_account").notNull(),
  senderLabel: text("sender_label").notNull().default(""), subject: text("subject").notNull().default(""),
  rawContent: text("raw_content").notNull(), receivedAt: text("received_at").notNull(), processedAt: text("processed_at"),
  accessScope: text("access_scope").notNull().default("OWNER_ADMIN"), createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("notification_source_external_idx").on(table.organizationId, table.source, table.externalId)]);

export const notificationActionCandidates = sqliteTable("notification_action_candidates", {
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull(), sourceEventId: text("source_event_id").notNull(),
  actionType: text("action_type").notNull(), urgency: text("urgency").notNull(), suggestedOwner: text("suggested_owner").notNull(),
  dueAt: text("due_at"), confidence: integer("confidence").notNull(), classifier: text("classifier").notNull(),
  reasoningSummary: text("reasoning_summary").notNull(), decision: text("decision").notNull().default("PENDING_APPROVAL"),
  createdEntityType: text("created_entity_type"), createdEntityId: text("created_entity_id"),
  createdAt: text("created_at").notNull(), decidedAt: text("decided_at"), decidedBy: text("decided_by"),
}, (table) => [uniqueIndex("notification_candidate_source_idx").on(table.sourceEventId)]);

export const aiAutomationRules = sqliteTable("ai_automation_rules", {
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull(),
  name: text("name").notNull(), description: text("description").notNull().default(""),
  triggerSource: text("trigger_source").notNull(), triggerCondition: text("trigger_condition").notNull(),
  actionType: text("action_type").notNull(), targetDepartment: text("target_department").notNull(),
  minimumConfidence: integer("minimum_confidence").notNull().default(90),
  approvalMode: text("approval_mode").notNull().default("REQUIRE_APPROVAL"),
  urgency: text("urgency").notNull().default("MEDIUM"), enabled: integer("enabled").notNull().default(1),
  createdByEmail: text("created_by_email").notNull(), createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("ai_automation_rules_org_name_idx").on(table.organizationId, table.name),
  index("ai_automation_rules_trigger_idx").on(table.organizationId, table.triggerSource, table.enabled),
]);

export const briefingPolicies = sqliteTable("briefing_policies", {
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull(),
  name: text("name").notNull(), department: text("department").notNull(), roleLevel: text("role_level").notNull(),
  deliveryTime: text("delivery_time").notNull().default("07:00"), timezone: text("timezone").notNull().default("America/Chicago"),
  channelsJson: text("channels_json").notNull().default("[\"IN_APP\"]"),
  includeSectionsJson: text("include_sections_json").notNull(),
  hierarchyRollup: integer("hierarchy_rollup").notNull().default(0),
  enabled: integer("enabled").notNull().default(1), createdByEmail: text("created_by_email").notNull(),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (table) => [index("briefing_policies_scope_idx").on(table.organizationId, table.department, table.roleLevel)]);

export const dailyBriefings = sqliteTable("daily_briefings", {
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull(),
  recipientEmail: text("recipient_email").notNull(), recipientName: text("recipient_name").notNull(),
  department: text("department").notNull(), roleLevel: text("role_level").notNull(),
  briefingDate: text("briefing_date").notNull(), title: text("title").notNull(),
  summary: text("summary").notNull(), sectionsJson: text("sections_json").notNull(),
  deliveryStatus: text("delivery_status").notNull().default("READY"),
  generatedAt: text("generated_at").notNull(), acknowledgedAt: text("acknowledged_at"),
}, (table) => [
  uniqueIndex("daily_briefings_recipient_date_idx").on(table.organizationId, table.recipientEmail, table.briefingDate),
  index("daily_briefings_scope_idx").on(table.organizationId, table.department, table.briefingDate),
]);

export const briefingPreferences = sqliteTable("briefing_preferences", {
  organizationId: text("organization_id").notNull(), userEmail: text("user_email").notNull(),
  timingMode: text("timing_mode").notNull().default("SHIFT_OFFSET"),
  shiftOffsetMinutes: integer("shift_offset_minutes").notNull().default(15),
  fixedTime: text("fixed_time"), timezone: text("timezone").notNull().default("America/Chicago"),
  summaryOnly: integer("summary_only").notNull().default(0), updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("briefing_preferences_user_idx").on(table.organizationId, table.userEmail)]);

export const agentMemories = sqliteTable("agent_memories", {
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull(),
  ownerEmail: text("owner_email").notNull(), title: text("title").notNull(), content: text("content").notNull(),
  sourceType: text("source_type").notNull(), sourceAccount: text("source_account").notNull().default(""),
  sourceRecordId: text("source_record_id"), occurredAt: text("occurred_at").notNull(),
  retentionUntil: text("retention_until").notNull(), tagsJson: text("tags_json").notNull().default("[]"),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("agent_memories_recall_idx").on(table.organizationId, table.ownerEmail, table.occurredAt),
  index("agent_memories_source_idx").on(table.organizationId, table.sourceType, table.sourceAccount),
]);

export const userAccessProfiles = sqliteTable("user_access_profiles", {
  organizationId: text("organization_id").notNull(), userEmail: text("user_email").notNull(),
  department: text("department").notNull().default("FRONT_DESK"), roleTier: text("role_tier").notNull().default("ASSOCIATE"),
  mfaRequired: integer("mfa_required").notNull().default(0), mfaStatus: text("mfa_status").notNull().default("NOT_ENROLLED"),
  mfaMethodsJson: text("mfa_methods_json").notNull().default("[]"), recoveryEmail: text("recovery_email"),
  recoveryPhone: text("recovery_phone"), accessStatus: text("access_status").notNull().default("ACTIVE"),
  lastAccessReviewAt: text("last_access_review_at"), updatedByEmail: text("updated_by_email").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("user_access_profiles_org_email_idx").on(table.organizationId, table.userEmail),
  index("user_access_profiles_scope_idx").on(table.organizationId, table.department, table.roleTier),
]);

export const userModuleAccess = sqliteTable("user_module_access", {
  organizationId: text("organization_id").notNull(), userEmail: text("user_email").notNull(),
  moduleKey: text("module_key").notNull(), accessLevel: text("access_level").notNull().default("USE"),
  grantedByEmail: text("granted_by_email").notNull(), grantedAt: text("granted_at").notNull(),
}, (table) => [
  uniqueIndex("user_module_access_grant_idx").on(table.organizationId, table.userEmail, table.moduleKey),
  index("user_module_access_module_idx").on(table.organizationId, table.moduleKey),
]);

export const identityRecoveryRequests = sqliteTable("identity_recovery_requests", {
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull(), userEmail: text("user_email").notNull(),
  recoveryType: text("recovery_type").notNull(), deliveryChannel: text("delivery_channel").notNull(),
  destinationMasked: text("destination_masked").notNull(), status: text("status").notNull(),
  requestedByEmail: text("requested_by_email").notNull(), requestedAt: text("requested_at").notNull(),
  expiresAt: text("expires_at").notNull(), completedAt: text("completed_at"),
}, (table) => [index("identity_recovery_pending_idx").on(table.organizationId, table.status, table.expiresAt)]);

export const accessAuditEvents = sqliteTable("access_audit_events", {
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull(),
  actorEmail: text("actor_email").notNull(), targetEmail: text("target_email").notNull(),
  eventType: text("event_type").notNull(), detailJson: text("detail_json").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [index("access_audit_events_org_created_idx").on(table.organizationId, table.createdAt)]);

export const propertyAssets = sqliteTable("property_assets", {
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull(),
  parentId: text("parent_id"), assetType: text("asset_type").notNull(), code: text("code").notNull(),
  name: text("name").notNull(), description: text("description").notNull().default(""),
  status: text("status").notNull().default("ACTIVE"), floorNumber: integer("floor_number"),
  roomNumber: text("room_number"), roomType: text("room_type"), capacity: integer("capacity"),
  areaSqFt: real("area_sq_ft"), manufacturer: text("manufacturer"), model: text("model"),
  serialNumber: text("serial_number"), installDate: text("install_date"), warrantyExpiresAt: text("warranty_expires_at"),
  metadataJson: text("metadata_json").notNull().default("{}"), createdByEmail: text("created_by_email").notNull(),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("property_assets_org_type_code_idx").on(table.organizationId, table.assetType, table.code),
  index("property_assets_hierarchy_idx").on(table.organizationId, table.parentId, table.assetType),
]);

export const propertyAssetAudit = sqliteTable("property_asset_audit", {
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull(),
  assetId: text("asset_id").notNull(), actorEmail: text("actor_email").notNull(),
  eventType: text("event_type").notNull(), detailJson: text("detail_json").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [index("property_asset_audit_idx").on(table.organizationId, table.assetId, table.createdAt)]);

export const propertyAssetImports = sqliteTable("property_asset_imports", {
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull(),
  fileName: text("file_name").notNull(), rowCount: integer("row_count").notNull(),
  createdCount: integer("created_count").notNull(), skippedCount: integer("skipped_count").notNull(),
  status: text("status").notNull(), importedBy: text("imported_by").notNull(), createdAt: text("created_at").notNull(),
}, (table) => [index("property_asset_imports_org_created_idx").on(table.organizationId, table.createdAt)]);

export const propertyAssetAttachments = sqliteTable("property_asset_attachments", {
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull(),
  assetId: text("asset_id").notNull(), objectKey: text("object_key").notNull(),
  fileName: text("file_name").notNull(), contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(), attachmentType: text("attachment_type").notNull(),
  notes: text("notes").notNull().default(""), uploadedBy: text("uploaded_by").notNull(), createdAt: text("created_at").notNull(),
}, (table) => [index("property_asset_attachments_asset_idx").on(table.organizationId, table.assetId, table.createdAt)]);

export const aiSetupSessions = sqliteTable("ai_setup_sessions", {
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull(),
  actorEmail: text("actor_email").notNull(), inputMode: text("input_mode").notNull(),
  instruction: text("instruction").notNull(), setupType: text("setup_type").notNull(),
  status: text("status").notNull(), planJson: text("plan_json").notNull(),
  questionsJson: text("questions_json").notNull(), assumptionsJson: text("assumptions_json").notNull(),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
  approvedAt: text("approved_at"), executedAt: text("executed_at"),
}, (table) => [index("ai_setup_sessions_actor_idx").on(table.organizationId, table.actorEmail, table.createdAt)]);

export const taxPreparationProfiles = sqliteTable("tax_preparation_profiles", {
  organizationId: text("organization_id").primaryKey(), accountingMethod: text("accounting_method").notNull(),
  accountingMethodConfirmed: integer("accounting_method_confirmed").notNull().default(0),
  grossIncludesTax: integer("gross_includes_tax"), salesTaxRate: real("sales_tax_rate"),
  lodgingTaxRate: real("lodging_tax_rate"), liquorTaxRate:real("liquor_tax_rate"),
  consumerCompensatingTaxRate:real("consumer_compensating_tax_rate"), jurisdictionLabel: text("jurisdiction_label"),
  verifiedBy: text("verified_by"), verifiedAt: text("verified_at"), updatedAt: text("updated_at").notNull(),
});

export const taxSourceImports = sqliteTable("tax_source_imports", {
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull(),
  objectKey: text("object_key").notNull(), fileName: text("file_name").notNull(),
  frequency: text("frequency").notNull(), periodStart: text("period_start").notNull(),
  periodEnd: text("period_end").notNull(), rowCount: integer("row_count").notNull(),
  mappedRows: integer("mapped_rows").notNull(), exceptionsJson: text("exceptions_json").notNull(),
  importedBy: text("imported_by").notNull(), importedAt: text("imported_at").notNull(),
}, (table) => [index("tax_source_imports_period_idx").on(table.organizationId, table.periodStart, table.periodEnd)]);

export const taxFinancialFacts = sqliteTable("tax_financial_facts", {
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull(),
  importId: text("import_id").notNull(), businessDate: text("business_date").notNull(),
  sourceReference: text("source_reference"), grossRevenue: real("gross_revenue").notNull().default(0),
  taxableRoomRevenue: real("taxable_room_revenue").notNull().default(0),
  taxableOtherSales: real("taxable_other_sales").notNull().default(0),
  exemptRevenue: real("exempt_revenue").notNull().default(0), refunds: real("refunds").notNull().default(0),
  discounts: real("discounts").notNull().default(0), adjustments: real("adjustments").notNull().default(0),
  operatingExpenses: real("operating_expenses").notNull().default(0),
  salesTaxCollected: real("sales_tax_collected").notNull().default(0),
  lodgingTaxCollected: real("lodging_tax_collected").notNull().default(0), createdAt: text("created_at").notNull(),
  liquorSales:real("liquor_sales").notNull().default(0),liquorTaxCollected:real("liquor_tax_collected").notNull().default(0),
  taxableOutOfStatePurchases:real("taxable_out_of_state_purchases").notNull().default(0),
  consumerCompensatingTaxPaid:real("consumer_compensating_tax_paid").notNull().default(0),
}, (table) => [index("tax_financial_facts_date_idx").on(table.organizationId, table.businessDate)]);

export const taxReturnWorkpapers = sqliteTable("tax_return_workpapers", {
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull(),
  periodStart: text("period_start").notNull(), periodEnd: text("period_end").notNull(),
  accountingMethod: text("accounting_method").notNull(), calculationJson: text("calculation_json").notNull(),
  status: text("status").notNull(), exceptionsJson: text("exceptions_json").notNull(),
  preparedBy: text("prepared_by").notNull(), preparedAt: text("prepared_at").notNull(),
  approvedBy: text("approved_by"), approvedAt: text("approved_at"),
}, (table) => [uniqueIndex("tax_return_workpapers_period_idx").on(table.organizationId, table.periodStart, table.periodEnd)]);

export const workEvidenceReviews = sqliteTable("work_evidence_reviews", {
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull(),
  workOrderId: text("work_order_id").notNull(), attachmentId: text("attachment_id").notNull().unique(),
  evidenceArea: text("evidence_area").notNull(), evidenceStage: text("evidence_stage").notNull(),
  reviewStatus: text("review_status").notNull(), qualityScore: integer("quality_score"),
  deficienciesJson: text("deficiencies_json").notNull(), providerLabel: text("provider_label").notNull(),
  reviewerEmail: text("reviewer_email"), reviewerNote: text("reviewer_note"),
  reviewedAt: text("reviewed_at"), createdAt: text("created_at").notNull(),
}, (table) => [index("work_evidence_reviews_order_idx").on(table.organizationId, table.workOrderId)]);

export const guestReviewEvents = sqliteTable("guest_review_events", {
  id:text("id").primaryKey(), organizationId:text("organization_id").notNull(), source:text("source").notNull(),
  sourceAccount:text("source_account").notNull(), externalId:text("external_id").notNull(), guestName:text("guest_name").notNull(),
  rating:real("rating"), reviewTitle:text("review_title"), reviewText:text("review_text").notNull(), stayDate:text("stay_date"),
  receivedAt:text("received_at").notNull(), sentiment:text("sentiment").notNull(), urgency:text("urgency").notNull(),
  themesJson:text("themes_json").notNull(), status:text("status").notNull(), createdAt:text("created_at").notNull(),
}, table=>[
  uniqueIndex("guest_review_events_source_idx").on(table.organizationId,table.source,table.sourceAccount,table.externalId),
  index("guest_review_events_queue_idx").on(table.organizationId,table.sentiment,table.receivedAt),
]);
export const reviewResponseDrafts=sqliteTable("review_response_drafts",{
  id:text("id").primaryKey(),organizationId:text("organization_id").notNull(),reviewId:text("review_id").notNull().unique(),
  responseText:text("response_text").notNull(),responseTone:text("response_tone").notNull(),modelLabel:text("model_label").notNull(),
  status:text("status").notNull(),approvedBy:text("approved_by"),approvedAt:text("approved_at"),
  createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull(),
});
export const reviewRecoveryCases=sqliteTable("review_recovery_cases",{
  id:text("id").primaryKey(),organizationId:text("organization_id").notNull(),reviewId:text("review_id").notNull().unique(),
  priority:text("priority").notNull(),department:text("department").notNull(),summary:text("summary").notNull(),
  status:text("status").notNull(),ownerEmail:text("owner_email"),createdAt:text("created_at").notNull(),
},table=>[index("review_recovery_queue_idx").on(table.organizationId,table.status,table.priority)]);
export const reviewAdvocacyInvites=sqliteTable("review_advocacy_invites",{id:text("id").primaryKey(),organizationId:text("organization_id").notNull(),reviewId:text("review_id").notNull().unique(),guestName:text("guest_name").notNull(),googleUrl:text("google_url"),tripadvisorUrl:text("tripadvisor_url"),facebookUrl:text("facebook_url"),status:text("status").notNull(),createdAt:text("created_at").notNull()});

export const distributionReservationRecords=sqliteTable("distribution_reservation_records",{
  id:text("id").primaryKey(),organizationId:text("organization_id").notNull(),source:text("source").notNull(),
  externalId:text("external_id").notNull(),confirmationNumber:text("confirmation_number").notNull(),guestName:text("guest_name").notNull(),
  arrivalDate:text("arrival_date").notNull(),departureDate:text("departure_date").notNull(),roomType:text("room_type").notNull(),
  status:text("status").notNull(),grossAmount:real("gross_amount").notNull(),commissionAmount:real("commission_amount").notNull(),
  currency:text("currency").notNull(),sourceFile:text("source_file").notNull(),importedBy:text("imported_by").notNull(),importedAt:text("imported_at").notNull(),
},table=>[
  uniqueIndex("distribution_reservation_source_idx").on(table.organizationId,table.source,table.externalId),
  index("distribution_reservation_stay_idx").on(table.organizationId,table.arrivalDate,table.departureDate),
]);
export const otaReconciliationRuns=sqliteTable("ota_reconciliation_runs",{
  id:text("id").primaryKey(),organizationId:text("organization_id").notNull(),periodStart:text("period_start").notNull(),
  periodEnd:text("period_end").notNull(),pmsCount:integer("pms_count").notNull(),otaCount:integer("ota_count").notNull(),
  matchedCount:integer("matched_count").notNull(),exceptionCount:integer("exception_count").notNull(),
  grossAmount:real("gross_amount").notNull(),commissionAmount:real("commission_amount").notNull(),netAmount:real("net_amount").notNull(),
  status:text("status").notNull(),runBy:text("run_by").notNull(),runAt:text("run_at").notNull(),
},table=>[index("ota_reconciliation_period_idx").on(table.organizationId,table.periodStart,table.periodEnd)]);
export const otaReconciliationExceptions=sqliteTable("ota_reconciliation_exceptions",{
  id:text("id").primaryKey(),organizationId:text("organization_id").notNull(),runId:text("run_id").notNull(),
  exceptionType:text("exception_type").notNull(),severity:text("severity").notNull(),source:text("source").notNull(),
  externalId:text("external_id"),confirmationNumber:text("confirmation_number"),summary:text("summary").notNull(),
  detailJson:text("detail_json").notNull(),status:text("status").notNull(),assignedTo:text("assigned_to"),
  resolutionNote:text("resolution_note"),createdAt:text("created_at").notNull(),resolvedAt:text("resolved_at"),resolvedBy:text("resolved_by"),
},table=>[index("ota_exception_queue_idx").on(table.organizationId,table.status,table.severity)]);

export const websiteFactoryProjects=sqliteTable("website_factory_projects",{
  id:text("id").primaryKey(),organizationId:text("organization_id").notNull(),propertyAssetId:text("property_asset_id").notNull(),
  name:text("name").notNull(),slug:text("slug").notNull(),theme:text("theme").notNull(),status:text("status").notNull(),
  contentJson:text("content_json").notNull(),seoJson:text("seo_json").notNull(),missingFieldsJson:text("missing_fields_json").notNull(),
  createdBy:text("created_by").notNull(),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull(),publishedAt:text("published_at"),
},table=>[uniqueIndex("website_factory_slug_idx").on(table.organizationId,table.slug)]);
export const websiteFactoryAudit=sqliteTable("website_factory_audit",{
  id:text("id").primaryKey(),organizationId:text("organization_id").notNull(),projectId:text("project_id").notNull(),
  actorEmail:text("actor_email").notNull(),eventType:text("event_type").notNull(),detailJson:text("detail_json").notNull(),createdAt:text("created_at").notNull(),
},table=>[index("website_factory_audit_idx").on(table.organizationId,table.projectId,table.createdAt)]);
export const integrationCredentialVault=sqliteTable("integration_credential_vault",{id:text("id").primaryKey(),organizationId:text("organization_id").notNull(),provider:text("provider").notNull(),accountLabel:text("account_label").notNull(),credentialType:text("credential_type").notNull(),encryptedSecret:text("encrypted_secret").notNull(),scopesJson:text("scopes_json").notNull(),status:text("status").notNull(),lastSyncAt:text("last_sync_at"),lastError:text("last_error"),createdBy:text("created_by").notNull(),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull()},t=>[uniqueIndex("integration_vault_account_idx").on(t.organizationId,t.provider,t.accountLabel)]);
export const marketingContentItems=sqliteTable("marketing_content_items",{id:text("id").primaryKey(),organizationId:text("organization_id").notNull(),title:text("title").notNull(),contentType:text("content_type").notNull(),body:text("body").notNull(),mediaUrl:text("media_url"),channelsJson:text("channels_json").notNull(),status:text("status").notNull(),scheduledAt:text("scheduled_at"),approvalRequired:integer("approval_required").notNull(),approvedBy:text("approved_by"),createdBy:text("created_by").notNull(),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull()});
export const guestBehaviorEvents=sqliteTable("guest_behavior_events",{id:text("id").primaryKey(),organizationId:text("organization_id").notNull(),anonymousId:text("anonymous_id").notNull(),eventType:text("event_type").notNull(),source:text("source").notNull(),propertyAssetId:text("property_asset_id"),consentStatus:text("consent_status").notNull(),metadataJson:text("metadata_json").notNull(),occurredAt:text("occurred_at").notNull()},t=>[index("guest_behavior_consent_idx").on(t.organizationId,t.consentStatus,t.eventType,t.occurredAt)]);
export const audienceSegments=sqliteTable("audience_segments",{id:text("id").primaryKey(),organizationId:text("organization_id").notNull(),name:text("name").notNull(),ruleJson:text("rule_json").notNull(),channel:text("channel").notNull(),offerTitle:text("offer_title").notNull(),offerUrl:text("offer_url").notNull(),status:text("status").notNull(),createdBy:text("created_by").notNull(),createdAt:text("created_at").notNull()});
export const platformProfileUpdates=sqliteTable("platform_profile_updates",{id:text("id").primaryKey(),organizationId:text("organization_id").notNull(),title:text("title").notNull(),description:text("description").notNull(),photoUrl:text("photo_url"),platformsJson:text("platforms_json").notNull(),status:text("status").notNull(),approvedBy:text("approved_by"),createdBy:text("created_by").notNull(),createdAt:text("created_at").notNull()});
export const inventoryTransactions=sqliteTable("inventory_transactions",{id:text("id").primaryKey(),organizationId:text("organization_id").notNull(),sku:text("sku").notNull(),transactionType:text("transaction_type").notNull(),quantity:integer("quantity").notNull(),balanceAfter:integer("balance_after").notNull(),reason:text("reason").notNull(),referenceId:text("reference_id"),actorEmail:text("actor_email").notNull(),createdAt:text("created_at").notNull()},t=>[index("inventory_transaction_ledger_idx").on(t.organizationId,t.sku,t.createdAt)]);
export const inventoryRequisitions=sqliteTable("inventory_requisitions",{id:text("id").primaryKey(),organizationId:text("organization_id").notNull(),department:text("department").notNull(),sku:text("sku").notNull(),quantity:integer("quantity").notNull(),reason:text("reason").notNull(),status:text("status").notNull(),requestedBy:text("requested_by").notNull(),approvedBy:text("approved_by"),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull()},t=>[index("inventory_requisition_queue_idx").on(t.organizationId,t.status,t.department,t.createdAt)]);
export const inventoryVendors=sqliteTable("inventory_vendors",{id:text("id").primaryKey(),organizationId:text("organization_id").notNull(),name:text("name").notNull(),contactEmail:text("contact_email"),leadTimeDays:integer("lead_time_days").notNull(),minimumOrderCents:integer("minimum_order_cents").notNull(),status:text("status").notNull(),createdAt:text("created_at").notNull()});

export const propertyContexts=sqliteTable("property_contexts",{
  id:text("id").primaryKey(),organizationId:text("organization_id").notNull(),code:text("code").notNull(),
  name:text("name").notNull(),address:text("address").notNull(),timezone:text("timezone").notNull(),
  databaseMode:text("database_mode").notNull(),databaseBinding:text("database_binding"),
  status:text("status").notNull(),createdBy:text("created_by").notNull(),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull(),
},table=>[uniqueIndex("property_context_code_idx").on(table.organizationId,table.code)]);
export const propertyAssignments=sqliteTable("property_assignments",{
  id:text("id").primaryKey(),organizationId:text("organization_id").notNull(),propertyId:text("property_id").notNull(),
  userEmail:text("user_email").notNull(),department:text("department").notNull(),roleLabel:text("role_label").notNull(),
  isDefault:integer("is_default").notNull(),status:text("status").notNull(),createdAt:text("created_at").notNull(),
},table=>[uniqueIndex("property_assignment_idx").on(table.organizationId,table.propertyId,table.userEmail)]);
export const userContextPreferences=sqliteTable("user_context_preferences",{
  id:text("id").primaryKey(),organizationId:text("organization_id").notNull(),userEmail:text("user_email").notNull(),
  activePropertyId:text("active_property_id").notNull(),activeLocationType:text("active_location_type"),
  activeLocationId:text("active_location_id"),updatedAt:text("updated_at").notNull(),
},table=>[uniqueIndex("user_context_preference_identity_idx").on(table.organizationId,table.userEmail)]);
export const frontDeskOperationalRecords=sqliteTable("front_desk_operational_records",{
  id:text("id").primaryKey(),organizationId:text("organization_id").notNull(),propertyId:text("property_id").notNull(),
  correlationId:text("correlation_id").notNull(),recordType:text("record_type").notNull(),category:text("category").notNull(),
  title:text("title").notNull(),description:text("description").notNull(),roomNumber:text("room_number"),
  guestReference:text("guest_reference"),reservationReference:text("reservation_reference"),priority:text("priority").notNull(),
  status:text("status").notNull(),assignedDepartment:text("assigned_department"),assignedTo:text("assigned_to"),
  quantity:integer("quantity"),unitCostCents:integer("unit_cost_cents"),feeCents:integer("fee_cents"),
  dueAt:text("due_at"),acknowledgedAt:text("acknowledged_at"),startedAt:text("started_at"),
  completedAt:text("completed_at"),verifiedAt:text("verified_at"),closedAt:text("closed_at"),
  sourceType:text("source_type").notNull(),sourceReference:text("source_reference"),detailsJson:text("details_json").notNull(),
  aiStatus:text("ai_status").notNull(),aiConfidence:real("ai_confidence"),aiExplanation:text("ai_explanation"),
  createdBy:text("created_by").notNull(),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull(),
},table=>[
  index("front_desk_record_queue_idx").on(table.organizationId,table.propertyId,table.recordType,table.status,table.dueAt),
  uniqueIndex("front_desk_record_correlation_idx").on(table.organizationId,table.correlationId),
]);
export const operationalStatusHistory=sqliteTable("operational_status_history",{
  id:text("id").primaryKey(),organizationId:text("organization_id").notNull(),propertyId:text("property_id").notNull(),
  entityType:text("entity_type").notNull(),entityId:text("entity_id").notNull(),fromStatus:text("from_status"),
  toStatus:text("to_status").notNull(),reasonCode:text("reason_code"),note:text("note").notNull(),
  actorEmail:text("actor_email").notNull(),createdAt:text("created_at").notNull(),
},table=>[index("operational_status_history_idx").on(table.organizationId,table.entityType,table.entityId,table.createdAt)]);
export const domainOutboxEvents=sqliteTable("domain_outbox_events",{
  id:text("id").primaryKey(),organizationId:text("organization_id").notNull(),propertyId:text("property_id").notNull(),
  eventType:text("event_type").notNull(),entityType:text("entity_type").notNull(),entityId:text("entity_id").notNull(),
  idempotencyKey:text("idempotency_key").notNull(),payloadJson:text("payload_json").notNull(),
  status:text("status").notNull(),occurredAt:text("occurred_at").notNull(),processedAt:text("processed_at"),
},table=>[
  uniqueIndex("domain_outbox_idempotency_idx").on(table.organizationId,table.idempotencyKey),
  index("domain_outbox_delivery_idx").on(table.organizationId,table.status,table.occurredAt),
]);
export const automationExceptions=sqliteTable("automation_exceptions",{
  id:text("id").primaryKey(),organizationId:text("organization_id").notNull(),propertyId:text("property_id").notNull(),
  sourceType:text("source_type").notNull(),sourceId:text("source_id"),exceptionState:text("exception_state").notNull(),
  severity:text("severity").notNull(),title:text("title").notNull(),detail:text("detail").notNull(),
  extractedJson:text("extracted_json").notNull(),missingFieldsJson:text("missing_fields_json").notNull(),
  recommendedAction:text("recommended_action").notNull(),ownerEmail:text("owner_email"),status:text("status").notNull(),
  retryCount:integer("retry_count").notNull(),nextRetryAt:text("next_retry_at"),
  createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull(),
},table=>[index("automation_exception_queue_idx").on(table.organizationId,table.propertyId,table.status,table.severity,table.createdAt)]);
export const inventoryLocations=sqliteTable("inventory_locations",{
  id:text("id").primaryKey(),organizationId:text("organization_id").notNull(),propertyId:text("property_id").notNull(),
  code:text("code").notNull(),name:text("name").notNull(),department:text("department").notNull(),
  locationType:text("location_type").notNull(),status:text("status").notNull(),createdAt:text("created_at").notNull(),
},table=>[uniqueIndex("inventory_location_code_idx").on(table.organizationId,table.propertyId,table.code)]);
export const inventoryPurchaseOrders=sqliteTable("inventory_purchase_orders",{
  id:text("id").primaryKey(),organizationId:text("organization_id").notNull(),propertyId:text("property_id").notNull(),
  poNumber:text("po_number").notNull(),vendorId:text("vendor_id").notNull(),status:text("status").notNull(),
  subtotalCents:integer("subtotal_cents").notNull(),taxCents:integer("tax_cents").notNull(),freightCents:integer("freight_cents").notNull(),
  totalCents:integer("total_cents").notNull(),expectedAt:text("expected_at"),submittedAt:text("submitted_at"),
  receivedAt:text("received_at"),createdBy:text("created_by").notNull(),approvedBy:text("approved_by"),
  createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull(),
},table=>[uniqueIndex("inventory_po_number_idx").on(table.organizationId,table.poNumber),index("inventory_po_queue_idx").on(table.organizationId,table.propertyId,table.status,table.createdAt)]);
export const inventoryPurchaseOrderLines=sqliteTable("inventory_purchase_order_lines",{
  id:text("id").primaryKey(),organizationId:text("organization_id").notNull(),purchaseOrderId:text("purchase_order_id").notNull(),
  sku:text("sku").notNull(),orderedQuantity:integer("ordered_quantity").notNull(),receivedQuantity:integer("received_quantity").notNull(),
  unitCostCents:integer("unit_cost_cents").notNull(),status:text("status").notNull(),createdAt:text("created_at").notNull(),
},table=>[index("inventory_po_line_idx").on(table.organizationId,table.purchaseOrderId,table.sku)]);
