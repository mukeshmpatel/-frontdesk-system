import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { generateClip } from "@/lib/generate";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const project = await prisma.project.findFirst({ where: { id: params.id, userId } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return NextResponse.json({ error: "A prompt is required" }, { status: 400 });

  const last = await prisma.clip.findFirst({ where: { projectId: project.id }, orderBy: { order: "desc" } });
  const nextOrder = (last?.order ?? -1) + 1;

  try {
    const generated = await generateClip(prompt);
    const clip = await prisma.clip.create({
      data: {
        projectId: project.id,
        prompt,
        order: nextOrder,
        filePath: generated.relativePath,
        duration: generated.duration,
        status: "ready"
      }
    });
    await prisma.project.update({ where: { id: project.id }, data: { updatedAt: new Date() } });
    return NextResponse.json(clip, { status: 201 });
  } catch (err) {
    console.error("Clip generation failed", err);
    return NextResponse.json({ error: "Clip generation failed" }, { status: 500 });
  }
}
