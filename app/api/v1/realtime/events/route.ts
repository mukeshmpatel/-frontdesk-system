import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../../../chatgpt-auth";
import { activeStaffContext } from "../../../../../db/staff";

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  const context = await activeStaffContext(user.email);
  if (!context || !env.DB) return Response.json({ error: "Staff access is required." }, { status: 403 });
  const cursor = new URL(request.url).searchParams.get("after") ?? new Date(Date.now() - 30_000).toISOString();
  const events = await env.DB.prepare(
    `SELECT id, event_type, entity_type, entity_id, payload_json, created_at
     FROM realtime_events WHERE organization_id=? AND created_at>?
     ORDER BY created_at ASC LIMIT 250`,
  ).bind(context.organizationId, cursor).all();
  return Response.json({ events: events.results, cursor: events.results.at(-1)?.created_at ?? cursor }, {
    headers: { "cache-control": "private, no-store" },
  });
}
