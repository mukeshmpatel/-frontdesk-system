import { getChatGPTUser } from "../../../../../chatgpt-auth";
import { ensureStaffWorkspace } from "../../../../../../db/staff";
import { getNotificationSource } from "../../../../../../db/notification-engine";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  await ensureStaffWorkspace(user.email, user.displayName);
  const { id } = await context.params;
  const source = await getNotificationSource(user.email, id);
  return source ? Response.json({ source }) : Response.json({ error: "Source not found or not authorized." }, { status: 404 });
}
