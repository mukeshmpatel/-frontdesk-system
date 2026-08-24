import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const project = await prisma.project.findFirst({ where: { id: params.id, userId } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const clipIds: unknown = body?.clipIds;
  if (!Array.isArray(clipIds) || clipIds.some((c) => typeof c !== "string")) {
    return NextResponse.json({ error: "clipIds must be an array of strings" }, { status: 400 });
  }

  const clips = await prisma.clip.findMany({ where: { projectId: project.id } });
  const validIds = new Set(clips.map((c) => c.id));
  if (clipIds.length !== clips.length || !clipIds.every((id) => validIds.has(id as string))) {
    return NextResponse.json({ error: "clipIds must match the project's clips exactly" }, { status: 400 });
  }

  await prisma.$transaction(
    (clipIds as string[]).map((id, index) => prisma.clip.update({ where: { id }, data: { order: index } }))
  );

  return NextResponse.json({ ok: true });
}
