import { redirect } from "next/navigation";

export default async function ShareCapturePage({
  searchParams,
}: {
  searchParams: Promise<{ title?: string; text?: string; url?: string }>;
}) {
  const params = await searchParams;
  const shared = [params.title, params.text, params.url].filter(Boolean).join(" — ").slice(0, 3500);
  redirect(`/?shared=${encodeURIComponent(shared)}`);
}
