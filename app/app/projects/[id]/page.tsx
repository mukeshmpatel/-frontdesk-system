import { redirect, notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Editor } from "./editor";

export default async function ProjectPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const project = await prisma.project.findFirst({
    where: { id: params.id, userId: session.user.id },
    include: { clips: { orderBy: { order: "asc" } } }
  });
  if (!project) notFound();

  return <Editor project={JSON.parse(JSON.stringify(project))} />;
}
