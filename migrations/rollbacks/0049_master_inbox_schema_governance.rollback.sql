-- Run only after exporting communication evidence and disabling Master Inbox.
DROP INDEX IF EXISTS communication_delivery_thread_idx;
DROP INDEX IF EXISTS communication_draft_thread_idx;
DROP INDEX IF EXISTS communication_message_thread_idx;
DROP INDEX IF EXISTS communication_thread_queue_idx;
DROP TABLE IF EXISTS communication_delivery_attempts;
DROP TABLE IF EXISTS communication_status_history;
DROP TABLE IF EXISTS communication_reply_drafts;
DROP TABLE IF EXISTS communication_messages;
DROP TABLE IF EXISTS communication_threads;
DROP TABLE IF EXISTS communication_sources;
