import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { getMemory } from "../../../../db/reminders";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getChatGPTUser();
  if (!user) return new Response("Sign in is required.", { status: 401 });
  const { id } = await context.params;
  const memory = await getMemory(id, user.email);
  if (!memory || !env.MEDIA) return new Response("Memory not found.", { status: 404 });
  const object = await env.MEDIA.get(memory.object_key);
  if (!object) return new Response("Memory not found.", { status: 404 });
  return new Response(object.body, {
    headers: {
      "content-type": memory.content_type,
      "content-length": String(memory.size_bytes),
      "cache-control": "private, max-age=3600",
      "content-disposition": `inline; filename="daymark-memory-${memory.id}"`,
    },
  });
}
