import { getSetting } from "../../db/google";
import { decryptSecret } from "./secrets";

export const GOOGLE_CONFIG_KEY = "google_oauth_config";
export const GMAIL_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
];

export async function sendGmailMessage(input: {
  refreshToken: string;
  to: string;
  subject: string;
  body: string;
  threadId?: string | null;
}) {
  const accessToken = await refreshGoogleAccessToken(input.refreshToken);
  const mime = [
    `To: ${input.to}`,
    `Subject: ${input.subject.startsWith("Re:") ? input.subject : `Re: ${input.subject}`}`,
    "Content-Type: text/plain; charset=UTF-8",
    "MIME-Version: 1.0",
    "",
    input.body,
  ].join("\r\n");
  const raw = btoa(unescape(encodeURIComponent(mime)))
    .replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ raw, ...(input.threadId ? { threadId: input.threadId } : {}) }),
  });
  const payload = await response.json() as { id?: string; threadId?: string; error?: { message?: string } };
  if (!response.ok || !payload.id) {
    throw new Error(payload.error?.message ?? "Gmail did not accept the reply.");
  }
  return { externalDeliveryId: payload.id, externalThreadId: payload.threadId ?? input.threadId ?? null };
}

export type GoogleOauthConfig = {
  clientId: string;
  clientSecret: string;
};

type GoogleCredentialFile = {
  web?: {
    client_id?: string;
    client_secret?: string;
    redirect_uris?: string[];
  };
};

export function parseGoogleCredentialFile(
  input: unknown,
  expectedRedirectUri: string,
): GoogleOauthConfig {
  const data = input as GoogleCredentialFile;
  const clientId = data?.web?.client_id?.trim() ?? "";
  const clientSecret = data?.web?.client_secret?.trim() ?? "";
  const redirectUris = data?.web?.redirect_uris ?? [];

  if (!clientId.endsWith(".apps.googleusercontent.com") || !clientSecret) {
    throw new Error("Choose the OAuth JSON file downloaded for the AAI Q web app.");
  }
  if (!redirectUris.includes(expectedRedirectUri)) {
    throw new Error(
      `The Google client must include this redirect URL: ${expectedRedirectUri}`,
    );
  }
  return { clientId, clientSecret };
}

export async function loadGoogleOauthConfig(): Promise<GoogleOauthConfig> {
  const setting = await getSetting(GOOGLE_CONFIG_KEY);
  if (!setting) throw new Error("Google has not been configured for AAI Q yet.");
  return JSON.parse(await decryptSecret(setting.encrypted_value)) as GoogleOauthConfig;
}

export function requestOrigin(request: Request) {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedHost) return `${forwardedProto ?? "https"}://${forwardedHost}`;
  return url.origin;
}

export async function refreshGoogleAccessToken(refreshToken: string) {
  const config = await loadGoogleOauthConfig();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const payload = (await response.json()) as {
    access_token?: string;
    error_description?: string;
  };
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description ?? "Google access needs to be reconnected.");
  }
  return payload.access_token;
}
