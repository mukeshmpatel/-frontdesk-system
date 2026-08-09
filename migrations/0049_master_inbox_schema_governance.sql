-- Master Inbox schema is deployment-owned. Runtime requests must never create it.
CREATE TABLE IF NOT EXISTS communication_sources (
 id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,property_id TEXT NOT NULL,source_key TEXT NOT NULL,
 display_name TEXT NOT NULL,connection_mode TEXT NOT NULL,status TEXT NOT NULL,credential_reference TEXT,
 last_sync_at TEXT,last_error TEXT,enabled INTEGER NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
 UNIQUE(organization_id,property_id,source_key));
CREATE TABLE IF NOT EXISTS communication_threads (
 id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,property_id TEXT NOT NULL,correlation_id TEXT NOT NULL,
 source_key TEXT NOT NULL,source_account TEXT NOT NULL,external_thread_id TEXT,guest_reference TEXT,room_reference TEXT,
 subject TEXT NOT NULL,status TEXT NOT NULL,priority TEXT NOT NULL,category TEXT NOT NULL,assigned_department TEXT NOT NULL,
 assigned_user TEXT,confidence INTEGER NOT NULL,reasoning_summary TEXT NOT NULL,approval_status TEXT NOT NULL,
 latest_message_at TEXT NOT NULL,due_at TEXT,acknowledged_at TEXT,closed_at TEXT,created_by TEXT NOT NULL,
 created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(organization_id,property_id,source_key,external_thread_id));
CREATE TABLE IF NOT EXISTS communication_messages (
 id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,property_id TEXT NOT NULL,thread_id TEXT NOT NULL,
 external_message_id TEXT,direction TEXT NOT NULL,sender_label TEXT NOT NULL,recipient_label TEXT,body TEXT NOT NULL,
 attachment_count INTEGER NOT NULL,sensitivity TEXT NOT NULL,received_at TEXT NOT NULL,created_by TEXT NOT NULL,
 created_at TEXT NOT NULL,UNIQUE(organization_id,property_id,thread_id,external_message_id));
CREATE TABLE IF NOT EXISTS communication_reply_drafts (
 id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,property_id TEXT NOT NULL,thread_id TEXT NOT NULL,body TEXT NOT NULL,
 status TEXT NOT NULL,risk_level TEXT NOT NULL,confidence INTEGER NOT NULL,model_or_rule TEXT NOT NULL,evidence_json TEXT NOT NULL,
 approved_by TEXT,approved_at TEXT,external_delivery_id TEXT,delivery_status TEXT,created_by TEXT NOT NULL,
 created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS communication_status_history (
 id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,property_id TEXT NOT NULL,thread_id TEXT NOT NULL,
 from_status TEXT,to_status TEXT NOT NULL,reason TEXT NOT NULL,changed_by TEXT NOT NULL,changed_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS communication_delivery_attempts (
 id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,property_id TEXT NOT NULL,thread_id TEXT NOT NULL,draft_id TEXT NOT NULL,
 requested_source_key TEXT NOT NULL,requested_source_account TEXT NOT NULL,original_source_key TEXT NOT NULL,
 original_source_account TEXT NOT NULL,override_reason TEXT,status TEXT NOT NULL,external_delivery_id TEXT,error_message TEXT,
 attempted_by TEXT NOT NULL,attempted_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS communication_thread_queue_idx ON communication_threads(organization_id,property_id,status,priority,latest_message_at);
CREATE INDEX IF NOT EXISTS communication_message_thread_idx ON communication_messages(organization_id,property_id,thread_id,received_at);
CREATE INDEX IF NOT EXISTS communication_draft_thread_idx ON communication_reply_drafts(organization_id,property_id,thread_id,status);
CREATE INDEX IF NOT EXISTS communication_delivery_thread_idx ON communication_delivery_attempts(organization_id,property_id,thread_id,attempted_at);
