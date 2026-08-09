import { getChatGPTUser } from "../../../chatgpt-auth";
import { saveOauthState } from "../../../../db/google";
import {
  GMAIL_SCOPES,
  loadGoogleOauthConfig,
  requestOrigin,
} from "../../../server/google";
import { randomBase64Url, sha256Base64Url } from "../../../server/secrets";

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) {
    return Response.redirect(new URL("/signin-with-chatgpt?return_to=%2Faccounts", request.url));
  }

  try {
    const config = await loadGoogleOauthConfig();
    const state = randomBase64Url(24);
    const codeVerifier = randomBase64Url(48);
    await saveOauthState(state, user.email, codeVerifier, Date.now() + 10 * 60 * 1000);

    const redirectUri = `${requestOrigin(request)}/api/google/callback`;
    const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authorizationUrl.search = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: GMAIL_SCOPES.join(" "),
      access_type: "offline",
      include_granted_scopes: "true",
      prompt: "consent select_account",
      state,
      code_challenge: await sha256Base64Url(codeVerifier),
      code_challenge_method: "S256",
    }).toString();
    return Response.redirect(authorizationUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google connection could not start.";
    const destination = new URL("/accounts", request.url);
    destination.searchParams.set("error", message);
    return Response.redirect(destination);
  }
}
