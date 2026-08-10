import { env } from "cloudflare:workers";
import { cookies } from "next/headers";
import { getChatGPTUser } from "../../../../../chatgpt-auth";
import { hasModuleAccess } from "../../../../../../db/access-management";
import { attachComplianceEvidence } from "../../../../../../db/compliance-inspections";

async function sha256Bytes(value: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", value);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  if (!await hasModuleAccess(user.email, "AAIQ_COMPLIANCE_CENTER")) return Response.json({ error: "Compliance Center access is required." }, { status: 403 });
  if (!env.MEDIA) return Response.json({ error: "Private media storage is not connected. AAIQ will not claim Compliance evidence without protected storage." }, { status: 503 });
  const { id } = await context.params, propertyId = (await cookies()).get("aaiq_active_property")?.value || null;
  let objectKey: string | null = null;
  try {
    const form = await request.formData(), file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "A Compliance evidence file is required." }, { status: 400 });
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") return Response.json({ error: "Compliance evidence must be an image or PDF certificate." }, { status: 415 });
    if (file.size > 15 * 1024 * 1024) return Response.json({ error: "Compliance evidence must be 15MB or smaller." }, { status: 413 });
    const bytes = await file.arrayBuffer(), digest = await sha256Bytes(bytes);
    objectKey = `compliance/evidence/${id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    await env.MEDIA.put(objectKey, bytes, { httpMetadata: { contentType: file.type || "application/octet-stream" } });
    const result = await attachComplianceEvidence(user.email, id, file, objectKey, digest, String(form.get("evidenceType") || ""),
      String(form.get("programItemId") || "") || null, propertyId);
    if (!result) { await env.MEDIA.delete(objectKey); return Response.json({ error: "This Compliance evidence action is not permitted." }, { status: 403 }); }
    if (result.duplicate) await env.MEDIA.delete(objectKey);
    return Response.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    if (objectKey) await env.MEDIA.delete(objectKey).catch(() => undefined);
    return Response.json({ error: error instanceof Error ? error.message : "Compliance evidence upload failed." }, { status: 409 });
  }
}
