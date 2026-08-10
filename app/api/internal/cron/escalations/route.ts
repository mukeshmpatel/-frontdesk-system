import { env } from "cloudflare:workers";
import { runEscalationMatrix } from "../../../../../db/platform-controls";

export async function POST(request: Request) {
  const configured = typeof env.CRON_SECRET === "string" ? env.CRON_SECRET : "";
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!configured || supplied !== configured) {
    return Response.json({ error: "Unauthorized cron invocation." }, { status: 401 });
  }
  return Response.json(await runEscalationMatrix());
}
