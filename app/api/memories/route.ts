import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import { listMemories, saveMemory } from "../../../db/reminders";

async function ownerPrefix(email: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email));
  return Array.from(new Uint8Array(digest).slice(0, 12), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  const memories = await listMemories(user.email);
  return Response.json({
    memories: memories.map((memory) => ({
      id: memory.id,
      title: memory.title,
      contentType: memory.content_type,
      sizeBytes: memory.size_bytes,
      createdAt: memory.created_at,
      url: `/api/memories/${memory.id}`,
    })),
  });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  if (!env.MEDIA) return Response.json({ error: "Media storage is not available." }, { status: 503 });
  const form = await request.formData();
  const file = form.get("file");
  const title = String(form.get("title") ?? "Video memory").trim().slice(0, 140);
  if (!(file instanceof File) || !file.type.startsWith("video/")) {
    return Response.json({ error: "Choose or record a video file." }, { status: 400 });
  }
  if (file.size > 75 * 1024 * 1024) {
    return Response.json({ error: "Keep video memories under 75 MB." }, { status: 413 });
  }
  const id = crypto.randomUUID();
  const extension = file.type.includes("mp4") ? "mp4" : file.type.includes("quicktime") ? "mov" : "webm";
  const objectKey = `users/${await ownerPrefix(user.email)}/${id}.${extension}`;
  await env.MEDIA.put(objectKey, file.stream(), {
    httpMetadata: { contentType: file.type },
    customMetadata: { owner: await ownerPrefix(user.email), title },
  });
  const createdAt = await saveMemory({
    id,
    userEmail: user.email,
    title: title || "Video memory",
    objectKey,
    contentType: file.type,
    sizeBytes: file.size,
  });
  return Response.json({ id, title, createdAt, url: `/api/memories/${id}` }, { status: 201 });
}
