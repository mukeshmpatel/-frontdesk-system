import { getChatGPTUser } from "../../../chatgpt-auth";
import { listStaffNotifications } from "../../../../db/staff";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  const notifications = await listStaffNotifications(user.email);
  return Response.json({ notifications: notifications ?? [] });
}
