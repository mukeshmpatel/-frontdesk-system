import { getChatGPTUser } from "../../../chatgpt-auth";
import {
  consumeOauthState,
  findGoogleConnection,
  saveGoogleConnection,
} from "../../../../db/google";
import {
  loadGoogleOauthConfig,
  requestOrigin,
} from "../../../server/google";
import { encryptSecret } from "../../../server/secrets";

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  error_description?: string;
};

type GoogleUserInfo = {
  sub?: string;
  email?: string;
  name?: string;
};

function accountRedirect(request: Request, key: "connected" | "error", value: string) {
  const destination = new URL("/accounts", request.url);
  destination.searchParams.set(key, value);
  return Response.redirect(destination);
}

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return accountRedirect(request, "error", "Please sign in to AAI Q again.");

  const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  const oauthError = url.searchParams.get("error");
  if (oauthError) return accountRedirect(request, "error", "Google access was not approved.");
  if (!state || !code) return accountRedirect(request, "error", "Google returned an incomplete response.");

  try {
    const storedState = await consumeOauthState(state);
    if (
      !storedState ||
      storedState.user_email !== user.email ||
      storedState.expires_at < Date.now()
    ) {
      throw new Error("This Google connection expired. Please try again.");
    }

    const config = await loadGoogleOauthConfig();
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: `${requestOrigin(request)}/api/google/callback`,
        grant_type: "authorization_code",
        code_verifier: storedState.code_verifier,
      }),
    });
    const tokens = (await tokenResponse.json()) as GoogleTokenResponse;
    if (!tokenResponse.ok || !tokens.access_token) {
      throw new Error(tokens.error_description ?? "Google did not issue an access token.");
    }

    const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = (await profileResponse.json()) as GoogleUserInfo;
    if (!profileResponse.ok || !profile.sub || !profile.email) {
      throw new Error("AAI Q could not identify the connected Google account.");
    }

    const existing = await findGoogleConnection(user.email, profile.sub);
    const refreshToken = tokens.refresh_token
      ? await encryptSecret(tokens.refresh_token)
      : existing?.encrypted_refresh_token;
    if (!refreshToken) {
      throw new Error("Google did not provide long-term access. Remove AAI Q from Google permissions and reconnect.");
    }

    await saveGoogleConnection({
      id: existing?.id ?? crypto.randomUUID(),
      userEmail: user.email,
      googleSubject: profile.sub,
      accountEmail: profile.email,
      displayName: profile.name ?? null,
      encryptedRefreshToken: refreshToken,
      scopes: tokens.scope ?? "",
    });
    return accountRedirect(request, "connected", profile.email);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google connection failed.";
    return accountRedirect(request, "error", message);
  }
}
