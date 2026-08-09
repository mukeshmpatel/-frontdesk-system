import { getChatGPTUser } from "../../../../chatgpt-auth";
import { markStaffNotificationRead } from "../../../../../db/staff";

export async function PATCH(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  const { id } = await context.params;
  const result = await markStaffNotificationRead(user.email, id);
  return result?.updated
    ? Response.json({ updated: true })
    : Response.json({ error: "Notification not found." }, { status: 404 });
}
