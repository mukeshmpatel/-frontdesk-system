import { env } from "cloudflare:workers";

export type StoredReminder = {
  id: string;
  user_email: string;
  title: string;
  scheduled_at: string;
  end_at: string | null;
  note: string;
  source_type: string;
  source_label: string;
  source_message_id: string | null;
  status: string;
  confidence: number;
  media_id: string | null;
  created_at: string;
  updated_at: string;
};

export type StoredMemory = {
  id: string;
  user_email: string;
  title: string;
  object_key: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
};

export type StoredIntakeSource = {
  id: string;
  user_email: string;
  name: string;
  provider: string;
  token_hash: string;
  created_at: string;
  last_received_at: string | null;
};

function database(): D1Database {
  if (!env.DB) throw new Error("AAI Q storage is not available.");
  return env.DB;
}

export function publicReminder(row: StoredReminder) {
  return {
    id: row.id,
    title: row.title,
    scheduledAt: row.scheduled_at,
    endAt: row.end_at,
    note: row.note,
    sourceType: row.source_type,
    sourceLabel: row.source_label,
    sourceMessageId: row.source_message_id,
    status: row.status,
    confidence: row.confidence,
    mediaId: row.media_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listReminders(userEmail: string) {
  const result = await database()
    .prepare(
      `SELECT id, user_email, title, scheduled_at, end_at, note, source_type,
              source_label, source_message_id, status, confidence, media_id,
              created_at, updated_at
       FROM reminders
       WHERE user_email = ? AND status != 'dismissed'
       ORDER BY scheduled_at ASC`,
    )
    .bind(userEmail)
    .all<StoredReminder>();
  return result.results;
}

export async function createReminder(input: {
  id?: string;
  userEmail: string;
  title: string;
  scheduledAt: string;
  endAt?: string | null;
  note?: string;
  sourceType: string;
  sourceLabel: string;
  sourceMessageId?: string | null;
  status?: string;
  confidence?: number;
  mediaId?: string | null;
}) {
  const id = input.id ?? crypto.randomUUID();
  const now = new Date().toISOString();
  await database()
    .prepare(
      `INSERT INTO reminders
       (id, user_email, title, scheduled_at, end_at, note, source_type,
        source_label, source_message_id, status, confidence, media_id,
        created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.userEmail,
      input.title,
      input.scheduledAt,
      input.endAt ?? null,
      input.note ?? "",
      input.sourceType,
      input.sourceLabel,
      input.sourceMessageId ?? null,
      input.status ?? "scheduled",
      input.confidence ?? 100,
      input.mediaId ?? null,
      now,
      now,
    )
    .run();
  return id;
}

export async function upsertInferredReminder(input: {
  userEmail: string;
  title: string;
  scheduledAt: string;
  note: string;
  sourceType: string;
  sourceLabel: string;
  sourceMessageId: string;
  confidence: number;
}) {
  const scheduled = new Date(input.scheduledAt);
  const windowStart = new Date(scheduled.getTime() - 12 * 60 * 60 * 1000).toISOString();
  const windowEnd = new Date(scheduled.getTime() + 12 * 60 * 60 * 1000).toISOString();
  const nearby = await database()
    .prepare(
      `SELECT id, title, status
       FROM reminders
       WHERE user_email = ? AND source_type = ?
         AND scheduled_at BETWEEN ? AND ?`,
    )
    .bind(input.userEmail, input.sourceType, windowStart, windowEnd)
    .all<{ id: string; title: string; status: string }>();
  const fingerprint = (value: string) => value
    .toLowerCase()
    .replace(/^(re|fw|fwd):\s*/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const duplicate = nearby.results.find((item) => fingerprint(item.title) === fingerprint(input.title));
  if (duplicate) {
    return { id: duplicate.id, created: false, status: duplicate.status, duplicate: true };
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const status = input.confidence >= 88 ? "scheduled" : "suggested";
  const result = await database()
    .prepare(
      `INSERT INTO reminders
       (id, user_email, title, scheduled_at, end_at, note, source_type,
        source_label, source_message_id, status, confidence, media_id,
        created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
       ON CONFLICT(user_email, source_type, source_message_id) DO NOTHING`,
    )
    .bind(
      id,
      input.userEmail,
      input.title,
      input.scheduledAt,
      input.note,
      input.sourceType,
      input.sourceLabel,
      input.sourceMessageId,
      status,
      input.confidence,
      now,
      now,
    )
    .run();
  return { id, created: (result.meta.changes ?? 0) > 0, status };
}

export async function updateReminder(
  id: string,
  userEmail: string,
  changes: {
    title?: string;
    scheduledAt?: string;
    note?: string;
    status?: string;
  },
) {
  const current = await database()
    .prepare("SELECT * FROM reminders WHERE id = ? AND user_email = ?")
    .bind(id, userEmail)
    .first<StoredReminder>();
  if (!current) return false;
  await database()
    .prepare(
      `UPDATE reminders
       SET title = ?, scheduled_at = ?, note = ?, status = ?, updated_at = ?
       WHERE id = ? AND user_email = ?`,
    )
    .bind(
      changes.title ?? current.title,
      changes.scheduledAt ?? current.scheduled_at,
      changes.note ?? current.note,
      changes.status ?? current.status,
      new Date().toISOString(),
      id,
      userEmail,
    )
    .run();
  return true;
}

export async function deleteReminder(id: string, userEmail: string) {
  const result = await database()
    .prepare("DELETE FROM reminders WHERE id = ? AND user_email = ?")
    .bind(id, userEmail)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function saveMemory(input: {
  id: string;
  userEmail: string;
  title: string;
  objectKey: string;
  contentType: string;
  sizeBytes: number;
}) {
  const now = new Date().toISOString();
  await database()
    .prepare(
      `INSERT INTO media_memories
       (id, user_email, title, object_key, content_type, size_bytes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.id,
      input.userEmail,
      input.title,
      input.objectKey,
      input.contentType,
      input.sizeBytes,
      now,
    )
    .run();
  return now;
}

export async function listMemories(userEmail: string) {
  const result = await database()
    .prepare(
      `SELECT id, user_email, title, object_key, content_type, size_bytes, created_at
       FROM media_memories WHERE user_email = ? ORDER BY created_at DESC`,
    )
    .bind(userEmail)
    .all<StoredMemory>();
  return result.results;
}

export async function getMemory(id: string, userEmail: string) {
  return database()
    .prepare(
      `SELECT id, user_email, title, object_key, content_type, size_bytes, created_at
       FROM media_memories WHERE id = ? AND user_email = ?`,
    )
    .bind(id, userEmail)
    .first<StoredMemory>();
}

export async function createIntakeSource(input: {
  id: string;
  userEmail: string;
  name: string;
  provider: string;
  tokenHash: string;
}) {
  const now = new Date().toISOString();
  await database()
    .prepare(
      `INSERT INTO intake_sources
       (id, user_email, name, provider, token_hash, created_at, last_received_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL)`,
    )
    .bind(input.id, input.userEmail, input.name, input.provider, input.tokenHash, now)
    .run();
  return now;
}

export async function listIntakeSources(userEmail: string) {
  const result = await database()
    .prepare(
      `SELECT id, user_email, name, provider, token_hash, created_at, last_received_at
       FROM intake_sources WHERE user_email = ? ORDER BY created_at DESC`,
    )
    .bind(userEmail)
    .all<StoredIntakeSource>();
  return result.results;
}

export async function findIntakeSourceByHash(tokenHash: string) {
  return database()
    .prepare(
      `SELECT id, user_email, name, provider, token_hash, created_at, last_received_at
       FROM intake_sources WHERE token_hash = ?`,
    )
    .bind(tokenHash)
    .first<StoredIntakeSource>();
}

export async function touchIntakeSource(id: string) {
  await database()
    .prepare("UPDATE intake_sources SET last_received_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), id)
    .run();
}
