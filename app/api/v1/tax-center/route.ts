import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { importTaxReport, prepareTaxWorkpaper, taxCenter, updateTaxProfile } from "../../../../db/tax-preparation";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  const data = await taxCenter(user.email);
  return data ? Response.json(data, { headers: { "cache-control": "private, no-store" } }) :
    Response.json({ error: "Staff access is required." }, { status: 403 });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  try {
    if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      if (!env.MEDIA) return Response.json({ error: "Financial report storage is unavailable." }, { status: 503 });
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return Response.json({ error: "Select a PMS revenue report." }, { status: 400 });
      if (file.size > 10 * 1024 * 1024) return Response.json({ error: "Reports must be 10MB or smaller." }, { status: 413 });
      if (!/\.(csv|txt)$/i.test(file.name)) return Response.json({ error: "Upload a CSV or delimited text report." }, { status: 415 });
      const objectKey = `tax-source-reports/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const text = await file.text();
      await env.MEDIA.put(objectKey, text, { httpMetadata: { contentType: file.type || "text/csv" } });
      const result = await importTaxReport(user.email, file, objectKey, text, {
        frequency: String(form.get("frequency") ?? "MONTHLY"),
        periodStart: String(form.get("periodStart") ?? ""),
        periodEnd: String(form.get("periodEnd") ?? ""),
      });
      if (!result) {
        await env.MEDIA.delete(objectKey);
        return Response.json({ error: "Administrator access is required." }, { status: 403 });
      }
      return Response.json(result, { status: 202 });
    }
    const body = await request.json() as Record<string, unknown>;
    const result = body.action === "profile" ? await updateTaxProfile(user.email, body)
      : body.action === "prepare" ? await prepareTaxWorkpaper(user.email, String(body.periodStart ?? ""), String(body.periodEnd ?? ""))
      : null;
    return result ? Response.json(result) : Response.json({ error: "Action is not permitted." }, { status: 403 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Tax preparation failed." }, { status: 409 });
  }
}
