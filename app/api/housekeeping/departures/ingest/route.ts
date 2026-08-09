import { env } from "cloudflare:workers";
import { cookies } from "next/headers";
import { getChatGPTUser } from "../../../../chatgpt-auth";
import { hasModuleAccess } from "../../../../../db/access-management";
import { ingestDepartureReport } from "../../../../../db/housekeeping-departures";

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  if (!await hasModuleAccess(user.email, "AAIQ_HOUSEKEEPING")) return Response.json({ error: "Housekeeping access is required." }, { status: 403 });
  const propertyId = (await cookies()).get("aaiq_active_property")?.value || null;
  try {
    const type = request.headers.get("content-type") || "";
    if (type.includes("multipart/form-data")) {
      const form = await request.formData(), file = form.get("file");
      if (!(file instanceof File)) return Response.json({ error: "A CSV or text departure report is required." }, { status: 400 });
      if (file.size > 2 * 1024 * 1024) return Response.json({ error: "Departure reports must be 2MB or smaller." }, { status: 413 });
      if (!/\.(csv|txt)$/i.test(file.name)) return Response.json({ error: "Use a CSV or text departure report." }, { status: 415 });
      const text = await file.text(), objectKey = env.MEDIA ? `housekeeping/departures/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}` : null;
      if (objectKey) await env.MEDIA.put(objectKey, text, { httpMetadata: { contentType: file.type || "text/plain" } });
      const result = await ingestDepartureReport(user.email, { requestedPropertyId: propertyId,
        businessDate: String(form.get("businessDate") || ""), sourceType: "MANUAL_UPLOAD",
        sourceReference: String(form.get("sourceReference") || file.name), fileName: file.name, objectKey, text });
      if (!result) { if (objectKey) await env.MEDIA?.delete(objectKey); return Response.json({ error: "Housekeeping supervisor access is required." }, { status: 403 }); }
      return Response.json(result, { status: result.duplicate ? 200 : 201, headers: { "cache-control": "private, no-store" } });
    }
    const body = await request.json() as Record<string, unknown>;
    const result = await ingestDepartureReport(user.email, { requestedPropertyId: propertyId,
      businessDate: String(body.businessDate || ""), sourceType: "MANUAL_UPLOAD",
      sourceReference: String(body.sourceReference || "direct-content"), text: String(body.text || "") });
    return result ? Response.json(result, { status: result.duplicate ? 200 : 201 }) :
      Response.json({ error: "Housekeeping supervisor access is required." }, { status: 403 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Departure ingestion failed." }, { status: 409 });
  }
}
