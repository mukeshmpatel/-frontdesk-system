import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { stitchProject } from "@/lib/stitch";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const project = await prisma.project.findFirst({
    where: { id: params.id, userId },
    include: { clips: { orderBy: { order: "asc" } } }
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (project.clips.length === 0) {
    return NextResponse.json({ error: "Add at least one clip before exporting" }, { status: 400 });
  }

  try {
    const relativePath = await stitchProject(project.id, project.clips);
    return NextResponse.json({ url: `/api/media/${relativePath}` });
  } catch (err) {
    console.error("Export failed", err);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
