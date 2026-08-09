import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../../../chatgpt-auth";
import { getWorkforceReportUpload } from "../../../../../db/workforce-reports";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  const { id } = await context.params;
  const report = await getWorkforceReportUpload(user.email, id);
  if (!report || !env.MEDIA) return Response.json({ error: "Report not found." }, { status: 404 });
  const object = await env.MEDIA.get(report.object_key);
  if (!object) return Response.json({ error: "Report file not found." }, { status: 404 });
  return new Response(object.body, {
    headers: {
      "content-type": report.content_type,
      "content-disposition": `attachment; filename="${report.file_name.replace(/"/g, "")}"`,
      "cache-control": "private, no-store",
    },
  });
}
