import { DatabaseSync } from "node:sqlite";
import { z } from "zod";

export type EdgeEvent =
  | {
    eventType: "ROOM_STATE_UPDATE";
    payload: {
      roomNumber: string;
      status: "VACANT" | "CLEAN" | "DIRTY" | "OCCUPIED" | "OUT_OF_ORDER";
      currentTemp?: number | null;
      climateProfile?: "COMFORT" | "ECO_MODE";
    };
  }
  | {
    eventType: "TASK_STATUS_UPDATE";
    payload: { taskId: string; status: "ACKNOWLEDGED" | "IN_PROGRESS" | "COMPLETED" };
  }
  | {
    eventType: "EDGE_AUDIT_EVENT";
    payload: { eventName: string; entityType: string; entityId: string; delta: Record<string, unknown> };
  };

type StoredOutboxRow = {
  event_id: string;
  property_id: string;
  correlation_id: string;
  event_type: EdgeEvent["eventType"];
  payload_json: string;
  occurred_at: string;
  attempts: number;
};

export class OfflineSyncService {
  private readonly db: DatabaseSync;
  private cloudConnected = true;

  constructor(private readonly input: {
    edgeNodeId: string;
    sqlitePath: string;
    syncApiUrl: string;
    syncApiKey: string;
  }) {
    this.db = new DatabaseSync(input.sqlitePath);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      CREATE TABLE IF NOT EXISTS room_cache (
        property_id TEXT NOT NULL,
        room_number TEXT NOT NULL,
        state_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(property_id, room_number)
      );
      CREATE TABLE IF NOT EXISTS edge_outbox (
        event_id TEXT PRIMARY KEY,
        property_id TEXT NOT NULL,
        correlation_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        last_error TEXT
      );
      CREATE INDEX IF NOT EXISTS edge_outbox_pending_idx
        ON edge_outbox(status, next_attempt_at, occurred_at);
    `);
  }

  cacheRoomState(propertyId: string, roomNumber: string, state: Record<string, unknown>, occurredAt = new Date()) {
    this.db.prepare(`
      INSERT INTO room_cache(property_id, room_number, state_json, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(property_id, room_number) DO UPDATE SET
        state_json = excluded.state_json,
        updated_at = excluded.updated_at
      WHERE excluded.updated_at >= room_cache.updated_at
    `).run(propertyId, roomNumber, JSON.stringify(state), occurredAt.toISOString());
  }

  getCachedRoomState(propertyId: string, roomNumber: string) {
    const row = this.db.prepare(`
      SELECT state_json, updated_at
      FROM room_cache
      WHERE property_id = ? AND room_number = ?
    `).get(propertyId, roomNumber) as { state_json: string; updated_at: string } | undefined;
    return row ? { state: JSON.parse(row.state_json) as Record<string, unknown>, updatedAt: row.updated_at } : null;
  }

  getLocalStatus() {
    const row = this.db.prepare(`
      SELECT
        SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status = 'SYNCED' THEN 1 ELSE 0 END) AS synced
      FROM edge_outbox
    `).get() as { pending: number | null; synced: number | null };
    return {
      cloudConnected: this.cloudConnected,
      outboxPending: row.pending ?? 0,
      outboxSynced: row.synced ?? 0,
    };
  }

  queueOperation(propertyId: string, event: EdgeEvent, correlationId: string = crypto.randomUUID(), occurredAt = new Date()) {
    const eventId = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO edge_outbox(
        event_id, property_id, correlation_id, event_type, payload_json,
        occurred_at, next_attempt_at, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
    `).run(
      eventId,
      propertyId,
      correlationId,
      event.eventType,
      JSON.stringify(event.payload),
      occurredAt.toISOString(),
      occurredAt.toISOString(),
    );
    return eventId;
  }

  async monitorCloudConnectivityLoop() {
    try {
      const health = await fetch(new URL("/healthz", this.input.syncApiUrl), {
        signal: AbortSignal.timeout(3_000),
      });
      if (!health.ok) throw new Error(`Cloud health returned HTTP ${health.status}.`);
      const recovered = !this.cloudConnected;
      this.cloudConnected = true;
      const flushed = await this.flushOutbox();
      return { connected: true, recovered, flushed };
    } catch (error) {
      const justFailed = this.cloudConnected;
      this.cloudConnected = false;
      return {
        connected: false,
        justFailed,
        error: error instanceof Error ? error.message : "Cloud connectivity failed.",
      };
    }
  }

  async flushOutbox(limit = 100) {
    const rows = this.db.prepare(`
      SELECT event_id, property_id, correlation_id, event_type, payload_json, occurred_at, attempts
      FROM edge_outbox
      WHERE status = 'PENDING' AND next_attempt_at <= ?
      ORDER BY occurred_at ASC
      LIMIT ?
    `).all(new Date().toISOString(), limit) as unknown as StoredOutboxRow[];
    let flushed = 0;
    for (const row of rows) {
      try {
        const response = await fetch(new URL("/api/v1/edge/sync", this.input.syncApiUrl), {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-edge-api-key": this.input.syncApiKey,
          },
          body: JSON.stringify({
            edgeNodeId: this.input.edgeNodeId,
            edgeEventId: row.event_id,
            propertyId: row.property_id,
            correlationId: row.correlation_id,
            occurredAt: row.occurred_at,
            eventType: row.event_type,
            payload: JSON.parse(row.payload_json),
          }),
          signal: AbortSignal.timeout(8_000),
        });
        if (!response.ok) throw new Error(`Cloud sync returned HTTP ${response.status}.`);
        this.db.prepare("UPDATE edge_outbox SET status = 'SYNCED', last_error = NULL WHERE event_id = ?")
          .run(row.event_id);
        flushed += 1;
      } catch (error) {
        const attempts = row.attempts + 1;
        const delayMs = Math.min(15 * 60_000, 2 ** Math.min(attempts, 10) * 1_000);
        this.db.prepare(`
          UPDATE edge_outbox
          SET attempts = ?, next_attempt_at = ?, last_error = ?
          WHERE event_id = ?
        `).run(
          attempts,
          new Date(Date.now() + delayMs).toISOString(),
          error instanceof Error ? error.message.slice(0, 500) : "Unknown sync error",
          row.event_id,
        );
      }
    }
    return flushed;
  }

  close() {
    this.db.close();
  }
}

export function createConfiguredOfflineSyncService() {
  const edge = z.object({
    EDGE_NODE_ID: z.string().min(3).max(100),
    EDGE_SQLITE_PATH: z.string().min(1),
    EDGE_SYNC_API_URL: z.string().url(),
    EDGE_SYNC_API_KEY: z.string().min(32),
  }).parse(process.env);
  return new OfflineSyncService({
    edgeNodeId: edge.EDGE_NODE_ID,
    sqlitePath: edge.EDGE_SQLITE_PATH,
    syncApiUrl: edge.EDGE_SYNC_API_URL,
    syncApiKey: edge.EDGE_SYNC_API_KEY,
  });
}
