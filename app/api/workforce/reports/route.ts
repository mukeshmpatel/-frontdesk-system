import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { ensureStaffWorkspace } from "../../../../db/staff";
import { listWorkforceReportUploads, saveWorkforceReportUpload } from "../../../../db/workforce-reports";

async function ownerPrefix(email: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email));
  return Array.from(new Uint8Array(digest).slice(0, 12), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  await ensureStaffWorkspace(user.email, user.displayName);
  const reports = await listWorkforceReportUploads(user.email);
  if (!reports) return Response.json({ error: "Staff access is required." }, { status: 403 });
  return Response.json({ reports });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  await ensureStaffWorkspace(user.email, user.displayName);
  if (!env.MEDIA) return Response.json({ error: "Report storage is unavailable." }, { status: 503 });
  const form = await request.formData();
  const file = form.get("file");
  const title = String(form.get("title") ?? "").trim().slice(0, 160);
  const sourceType = String(form.get("sourceType") ?? "Other").trim().slice(0, 60);
  if (!(file instanceof File)) return Response.json({ error: "Choose a report file." }, { status: 400 });
  const allowed = new Set(["text/csv", "application/pdf", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]);
  if (!allowed.has(file.type) && !/\.(csv|pdf|xls|xlsx)$/i.test(file.name)) {
    return Response.json({ error: "Upload a CSV, Excel or PDF report." }, { status: 400 });
  }
  if (file.size > 25 * 1024 * 1024) return Response.json({ error: "Keep report files under 25 MB." }, { status: 413 });
  const id = crypto.randomUUID();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
  const objectKey = `workforce/${await ownerPrefix(user.email)}/${id}-${safeName}`;
  await env.MEDIA.put(objectKey, file.stream(), { httpMetadata: { contentType: file.type || "application/octet-stream" } });
  const saved = await saveWorkforceReportUpload(user.email, {
    id, title: title || file.name, sourceType, objectKey, fileName: file.name,
    contentType: file.type || "application/octet-stream", sizeBytes: file.size,
  });
  if (!saved) {
    await env.MEDIA.delete(objectKey);
    return Response.json({ error: "Administrator access is required." }, { status: 403 });
  }
  return Response.json({ id, title: title || file.name, sourceType, fileName: file.name, sizeBytes: file.size, createdAt: saved.createdAt }, { status: 201 });
}
