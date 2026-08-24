import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";

export default async function Home() {
  const session = await getServerSession(authOptions);
  if (session) redirect("/dashboard");

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">AI Video Flow</h1>
      <p className="max-w-xl text-white/70">
        A prompt-to-video storyboard editor, modeled on tools like Google Flow: describe a shot, generate a clip,
        arrange your storyboard, trim, and export a single stitched video.
      </p>
      <p className="rounded-lg border border-white/10 bg-panel px-4 py-3 text-sm text-white/60">
        Clip generation currently uses a built-in mock renderer (no external API key required) so the full
        pipeline works out of the box. Swap in a real model in <code>lib/generate.ts</code>.
      </p>
      <div className="flex gap-4">
        <Link href="/register" className="rounded-md bg-accent px-5 py-2.5 font-medium hover:opacity-90">
          Get started
        </Link>
        <Link href="/login" className="rounded-md border border-white/20 px-5 py-2.5 font-medium hover:bg-white/5">
          Log in
        </Link>
      </div>
    </main>
  );
}
