import { getChatGPTUser } from "../../../../chatgpt-auth";
import { ensureStaffWorkspace } from "../../../../../db/staff";
import { AssetConflictError, createAssetCalendarBlock, listAssetCalendarBlocks } from "../../../../../db/platform-controls";

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  await ensureStaffWorkspace(user.email, user.displayName);
  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? new Date().toISOString();
  const to = url.searchParams.get("to") ?? new Date(Date.now() + 90 * 86_400_000).toISOString();
  const blocks = await listAssetCalendarBlocks(user.email, from, to);
  return blocks ? Response.json({ blocks }) : Response.json({ error: "Access is required." }, { status: 403 });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  await ensureStaffWorkspace(user.email, user.displayName);
  try {
    const payload = await request.json() as Parameters<typeof createAssetCalendarBlock>[1];
    const result = await createAssetCalendarBlock(user.email, payload);
    return result ? Response.json(result, { status: 201 }) : Response.json({ error: "Administrator access is required." }, { status: 403 });
  } catch (error) {
    if (error instanceof AssetConflictError) {
      return Response.json({ error: {
        code: "ASSET_SCHEDULE_CONFLICT", message: error.message,
        conflictingEventId: error.conflictingEventId, assetId: error.assetId,
        requestedRange: error.requestedRange, conflictingRange: error.conflictingRange,
        traceId: error.traceId,
      } }, { status: 409 });
    }
    return Response.json({ error: error instanceof Error ? error.message : "Calendar block failed." }, { status: 400 });
  }
}
