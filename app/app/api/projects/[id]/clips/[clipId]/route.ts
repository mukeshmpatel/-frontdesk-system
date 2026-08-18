import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";

async function getOwnedClip(userId: string, projectId: string, clipId: string) {
  const clip = await prisma.clip.findFirst({
    where: { id: clipId, projectId, project: { userId } }
  });
  return clip;
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string; clipId: string } }
) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clip = await getOwnedClip(userId, params.id, params.clipId);
  if (!clip) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: { trimStart?: number; trimDuration?: number | null } = {};

  if (typeof body.trimStart === "number") {
    data.trimStart = Math.max(0, Math.min(body.trimStart, clip.duration));
  }
  if (body.trimDuration === null) {
    data.trimDuration = null;
  } else if (typeof body.trimDuration === "number") {
    data.trimDuration = Math.max(0.1, Math.min(body.trimDuration, clip.duration));
  }

  const updated = await prisma.clip.update({ where: { id: clip.id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string; clipId: string } }
) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clip = await getOwnedClip(userId, params.id, params.clipId);
  if (!clip) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.clip.delete({ where: { id: clip.id } });
  return NextResponse.json({ ok: true });
}
