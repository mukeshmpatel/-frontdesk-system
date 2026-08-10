import { getChatGPTUser } from "../../chatgpt-auth";
import { createIntakeSource, listIntakeSources } from "../../../db/reminders";
import { randomBase64Url, sha256Base64Url } from "../../server/secrets";

const providers = new Set(["outlook", "text", "whatsapp", "slack", "teams", "telegram", "other"]);

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  const sources = await listIntakeSources(user.email);
  return Response.json({
    sources: sources.map((source) => ({
      id: source.id,
      name: source.name,
      provider: source.provider,
      createdAt: source.created_at,
      lastReceivedAt: source.last_received_at,
    })),
  });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  const payload = (await request.json()) as { provider?: string; name?: string };
  const provider = payload.provider?.toLowerCase() ?? "";
  const name = payload.name?.trim().slice(0, 100) ?? "";
  if (!providers.has(provider) || !name) {
    return Response.json({ error: "Choose a source and give it a name." }, { status: 400 });
  }
  const token = randomBase64Url(32);
  const id = crypto.randomUUID();
  const createdAt = await createIntakeSource({
    id,
    userEmail: user.email,
    name,
    provider,
    tokenHash: await sha256Base64Url(token),
  });
  const url = new URL(request.url);
  const intakeUrl = `${url.origin}/api/intake/${token}`;
  return Response.json({ id, name, provider, createdAt, intakeUrl }, { status: 201 });
}
