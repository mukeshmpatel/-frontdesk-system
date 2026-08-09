import { getChatGPTUser } from "../../../../chatgpt-auth";
import { ensureStaffWorkspace } from "../../../../../db/staff";
import { listNotificationCandidates } from "../../../../../db/notification-engine";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  await ensureStaffWorkspace(user.email, user.displayName);
  const result = await listNotificationCandidates(user.email);
  return result ? Response.json({ candidates: result.results }) : Response.json({ error: "Staff access is required." }, { status: 403 });
}
