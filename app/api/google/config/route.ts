import { getChatGPTUser } from "../../../chatgpt-auth";
import { getSetting, saveSetting } from "../../../../db/google";
import {
  GOOGLE_CONFIG_KEY,
  parseGoogleCredentialFile,
  requestOrigin,
} from "../../../server/google";
import { encryptSecret } from "../../../server/secrets";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });

  const setting = await getSetting(GOOGLE_CONFIG_KEY);
  return Response.json({
    configured: Boolean(setting),
    canConfigure: !setting || setting.owner_email === user.email,
  });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });

  try {
    const existing = await getSetting(GOOGLE_CONFIG_KEY);
    if (existing && existing.owner_email !== user.email) {
      return Response.json(
        { error: "Only the AAI Q owner can replace this credential." },
        { status: 403 },
      );
    }

    const payload = (await request.json()) as { credential?: unknown };
    const redirectUri = `${requestOrigin(request)}/api/google/callback`;
    const config = parseGoogleCredentialFile(payload.credential, redirectUri);
    const encrypted = await encryptSecret(JSON.stringify(config));
    await saveSetting(GOOGLE_CONFIG_KEY, encrypted, user.email);
    return Response.json({ configured: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save the Google credential.";
    return Response.json({ error: message }, { status: 400 });
  }
}
