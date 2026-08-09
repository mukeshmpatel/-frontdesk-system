import { env } from "cloudflare:workers";

export type StoredGoogleConnection = {
  id: string;
  user_email: string;
  google_subject: string;
  account_email: string;
  display_name: string | null;
  encrypted_refresh_token: string;
  scopes: string;
  created_at: string;
  updated_at: string;
};

type StoredSetting = {
  key: string;
  encrypted_value: string;
  owner_email: string;
  updated_at: string;
};

type StoredOauthState = {
  state: string;
  user_email: string;
  code_verifier: string;
  expires_at: number;
};

function getDatabase(): D1Database {
  if (!env.DB) throw new Error("AAI Q secure storage is not available.");
  return env.DB;
}

export async function getSetting(key: string) {
  return getDatabase()
    .prepare(
      "SELECT key, encrypted_value, owner_email, updated_at FROM app_settings WHERE key = ?",
    )
    .bind(key)
    .first<StoredSetting>();
}

export async function saveSetting(
  key: string,
  encryptedValue: string,
  ownerEmail: string,
) {
  const now = new Date().toISOString();
  await getDatabase()
    .prepare(
      `INSERT INTO app_settings (key, encrypted_value, owner_email, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         encrypted_value = excluded.encrypted_value,
         updated_at = excluded.updated_at`,
    )
    .bind(key, encryptedValue, ownerEmail, now)
    .run();
}

export async function saveOauthState(
  state: string,
  userEmail: string,
  codeVerifier: string,
  expiresAt: number,
) {
  const database = getDatabase();
  await database.batch([
    database
      .prepare("DELETE FROM oauth_states WHERE expires_at < ?")
      .bind(Date.now()),
    database
      .prepare(
        "INSERT INTO oauth_states (state, user_email, code_verifier, expires_at) VALUES (?, ?, ?, ?)",
      )
      .bind(state, userEmail, codeVerifier, expiresAt),
  ]);
}

export async function consumeOauthState(state: string) {
  const database = getDatabase();
  const stored = await database
    .prepare(
      "SELECT state, user_email, code_verifier, expires_at FROM oauth_states WHERE state = ?",
    )
    .bind(state)
    .first<StoredOauthState>();

  if (stored) {
    await database.prepare("DELETE FROM oauth_states WHERE state = ?").bind(state).run();
  }
  return stored;
}

export async function listGoogleConnections(userEmail: string) {
  const result = await getDatabase()
    .prepare(
      `SELECT id, user_email, google_subject, account_email, display_name,
              encrypted_refresh_token, scopes, created_at, updated_at
       FROM google_connections
       WHERE user_email = ?
       ORDER BY created_at ASC`,
    )
    .bind(userEmail)
    .all<StoredGoogleConnection>();
  return result.results;
}

export async function getGoogleConnection(id: string, userEmail: string) {
  return getDatabase()
    .prepare(
      `SELECT id, user_email, google_subject, account_email, display_name,
              encrypted_refresh_token, scopes, created_at, updated_at
       FROM google_connections
       WHERE id = ? AND user_email = ?`,
    )
    .bind(id, userEmail)
    .first<StoredGoogleConnection>();
}

export async function findGoogleConnection(
  userEmail: string,
  googleSubject: string,
) {
  return getDatabase()
    .prepare(
      `SELECT id, user_email, google_subject, account_email, display_name,
              encrypted_refresh_token, scopes, created_at, updated_at
       FROM google_connections
       WHERE user_email = ? AND google_subject = ?`,
    )
    .bind(userEmail, googleSubject)
    .first<StoredGoogleConnection>();
}

export async function saveGoogleConnection(input: {
  id: string;
  userEmail: string;
  googleSubject: string;
  accountEmail: string;
  displayName: string | null;
  encryptedRefreshToken: string;
  scopes: string;
}) {
  const now = new Date().toISOString();
  const existing = await findGoogleConnection(input.userEmail, input.googleSubject);
  if (existing) {
    await getDatabase()
      .prepare(
        `UPDATE google_connections
         SET account_email = ?, display_name = ?, encrypted_refresh_token = ?,
             scopes = ?, updated_at = ?
         WHERE id = ? AND user_email = ?`,
      )
      .bind(
        input.accountEmail,
        input.displayName,
        input.encryptedRefreshToken,
        input.scopes,
        now,
        existing.id,
        input.userEmail,
      )
      .run();
    return existing.id;
  }

  await getDatabase()
    .prepare(
      `INSERT INTO google_connections
       (id, user_email, google_subject, account_email, display_name,
        encrypted_refresh_token, scopes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.id,
      input.userEmail,
      input.googleSubject,
      input.accountEmail,
      input.displayName,
      input.encryptedRefreshToken,
      input.scopes,
      now,
      now,
    )
    .run();
  return input.id;
}

export async function deleteGoogleConnection(id: string, userEmail: string) {
  await getDatabase()
    .prepare("DELETE FROM google_connections WHERE id = ? AND user_email = ?")
    .bind(id, userEmail)
    .run();
}
