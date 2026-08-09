import { env } from "cloudflare:workers";
import { cookies } from "next/headers";
import { getChatGPTUser } from "../../../../../chatgpt-auth";
import { hasModuleAccess } from "../../../../../../db/access-management";
import { attachHousekeepingEvidence } from "../../../../../../db/housekeeping-departures";

async function sha256Bytes(value: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", value);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  if (!await hasModuleAccess(user.email, "AAIQ_HOUSEKEEPING")) return Response.json({ error: "Housekeeping access is required." }, { status: 403 });
  if (!env.MEDIA) return Response.json({ error: "Private media storage is not connected. A manager-observed review may be recorded, but before/after photo verification cannot be completed." }, { status: 503 });
  const { id } = await context.params, propertyId = (await cookies()).get("aaiq_active_property")?.value || null;
  try {
    const form = await request.formData(), file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "A room photo is required." }, { status: 400 });
    if (!file.type.startsWith("image/")) return Response.json({ error: "Housekeeping evidence must be an image." }, { status: 415 });
    if (file.size > 15 * 1024 * 1024) return Response.json({ error: "Room evidence must be 15MB or smaller." }, { status: 413 });
    const bytes = await file.arrayBuffer(), digest = await sha256Bytes(bytes),
      objectKey = `housekeeping/evidence/${id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    await env.MEDIA.put(objectKey, bytes, { httpMetadata: { contentType: file.type || "application/octet-stream" } });
    const result = await attachHousekeepingEvidence(user.email, id, file, objectKey, digest,
      String(form.get("area") || ""), String(form.get("stage") || ""), propertyId);
    if (!result) { await env.MEDIA.delete(objectKey); return Response.json({ error: "This evidence action is not permitted." }, { status: 403 }); }
    if (result.duplicate) await env.MEDIA.delete(objectKey);
    return Response.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Evidence upload failed." }, { status: 409 });
  }
}
