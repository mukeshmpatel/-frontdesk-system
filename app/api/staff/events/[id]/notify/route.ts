import { getChatGPTUser } from "../../../../../chatgpt-auth";
import { sendStaffNotification } from "../../../../../../db/staff";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  const payload = (await request.json()) as { title?: string; message?: string };
  const title = payload.title?.trim().slice(0, 100) || "Staff reminder";
  const message = payload.message?.trim().slice(0, 500) ?? "";
  if (!message) return Response.json({ error: "Add a notification message." }, { status: 400 });
  const { id } = await context.params;
  const result = await sendStaffNotification(user.email, id, title, message);
  return result
    ? Response.json(result)
    : Response.json({ error: "Only the host or an admin can notify staff." }, { status: 403 });
}
