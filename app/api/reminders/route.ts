import { getChatGPTUser } from "../../chatgpt-auth";
import { createReminder, listReminders, publicReminder } from "../../../db/reminders";

const statuses = new Set(["scheduled", "suggested", "done", "dismissed"]);

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  const reminders = await listReminders(user.email);
  return Response.json({ reminders: reminders.map(publicReminder) });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  try {
    const payload = (await request.json()) as {
      title?: string;
      scheduledAt?: string;
      note?: string;
      sourceType?: string;
      sourceLabel?: string;
      status?: string;
      mediaId?: string | null;
    };
    const title = payload.title?.trim() ?? "";
    const scheduled = new Date(payload.scheduledAt ?? "");
    const status = payload.status ?? "scheduled";
    if (!title || title.length > 160 || Number.isNaN(scheduled.getTime())) {
      return Response.json({ error: "Add a title and valid reminder time." }, { status: 400 });
    }
    if (!statuses.has(status)) {
      return Response.json({ error: "Reminder status is invalid." }, { status: 400 });
    }
    const id = await createReminder({
      userEmail: user.email,
      title,
      scheduledAt: scheduled.toISOString(),
      note: payload.note?.trim().slice(0, 2000) ?? "",
      sourceType: payload.sourceType?.slice(0, 40) || "manual",
      sourceLabel: payload.sourceLabel?.slice(0, 120) || "Quick capture",
      status,
      mediaId: payload.mediaId ?? null,
    });
    return Response.json({ id }, { status: 201 });
  } catch {
    return Response.json({ error: "Reminder could not be created." }, { status: 400 });
  }
}
