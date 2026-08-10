import { getChatGPTUser } from "../../../chatgpt-auth";
import { ensureStaffWorkspace } from "../../../../db/staff";
import { capabilityLedger, reviewCapabilityItem } from "../../../../db/capability-ledger";

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  await ensureStaffWorkspace(user.email, user.displayName);
  const url = new URL(request.url);
  const data = await capabilityLedger(user.email, {
    itemType: url.searchParams.get("itemType") || undefined,
    owningModule: url.searchParams.get("owningModule") || undefined,
    status: url.searchParams.get("status") || undefined,
  });
  return data ? Response.json(data, { headers: { "cache-control": "private, no-store" } }) : Response.json({ error: "Workspace access is required." }, { status: 403 });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  await ensureStaffWorkspace(user.email, user.displayName);
  try {
    const result = await reviewCapabilityItem(user.email, await request.json() as Record<string, unknown>);
    return result ? Response.json(result) : Response.json({ error: "Administrator review is required." }, { status: 403 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Capability review failed." }, { status: 400 });
  }
}
