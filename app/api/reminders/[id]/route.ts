import { getChatGPTUser } from "../../../chatgpt-auth";
import { deleteReminder, updateReminder } from "../../../../db/reminders";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  const payload = (await request.json()) as {
    title?: string;
    scheduledAt?: string;
    note?: string;
    status?: string;
  };
  if (payload.scheduledAt && Number.isNaN(new Date(payload.scheduledAt).getTime())) {
    return Response.json({ error: "Reminder time is invalid." }, { status: 400 });
  }
  const { id } = await context.params;
  const updated = await updateReminder(id, user.email, {
    title: payload.title?.trim().slice(0, 160),
    scheduledAt: payload.scheduledAt ? new Date(payload.scheduledAt).toISOString() : undefined,
    note: payload.note?.trim().slice(0, 2000),
    status: payload.status,
  });
  return updated
    ? Response.json({ updated: true })
    : Response.json({ error: "Reminder not found." }, { status: 404 });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  const { id } = await context.params;
  const deleted = await deleteReminder(id, user.email);
  return deleted
    ? Response.json({ deleted: true })
    : Response.json({ error: "Reminder not found." }, { status: 404 });
}
