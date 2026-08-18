import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SignOutButton } from "../sign-out-button";
import { NewProjectForm } from "./new-project-form";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const projects = await prisma.project.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { clips: true } } }
  });

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Your projects</h1>
          <p className="text-sm text-white/60">Signed in as {session.user.email}</p>
        </div>
        <SignOutButton />
      </div>

      <div className="mb-8">
        <NewProjectForm />
      </div>

      <ul className="flex flex-col gap-3">
        {projects.map((p) => (
          <li key={p.id}>
            <Link
              href={`/projects/${p.id}`}
              className="flex items-center justify-between rounded-lg border border-white/10 bg-panel px-4 py-3 hover:border-accent"
            >
              <span className="font-medium">{p.title}</span>
              <span className="text-sm text-white/50">{p._count.clips} clip(s)</span>
            </Link>
          </li>
        ))}
        {projects.length === 0 && (
          <li className="rounded-lg border border-dashed border-white/10 px-4 py-6 text-center text-white/50">
            No projects yet. Create one above to start storyboarding.
          </li>
        )}
      </ul>
    </main>
  );
}
