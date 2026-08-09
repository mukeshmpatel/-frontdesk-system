import { getChatGPTUser } from "../../chatgpt-auth";
import {
  createStaffEvent,
  ensureStaffWorkspace,
  sendStaffNotification,
  staffWorkspaceSummary,
} from "../../../db/staff";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  await ensureStaffWorkspace(user.email, user.displayName);
  const workspace = await staffWorkspaceSummary(user.email);
  return Response.json({ workspace });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  try {
    const payload = (await request.json()) as {
      title?: string;
      scheduledAt?: string;
      endAt?: string | null;
      note?: string;
      location?: string;
      responseOptions?: string[];
      notify?: boolean;
    };
    const title = payload.title?.trim() ?? "";
    const scheduled = new Date(payload.scheduledAt ?? "");
    const end = payload.endAt ? new Date(payload.endAt) : null;
    if (!title || title.length > 160 || Number.isNaN(scheduled.getTime())) {
      return Response.json({ error: "Add an event title and valid time." }, { status: 400 });
    }
    if (end && (Number.isNaN(end.getTime()) || end <= scheduled)) {
      return Response.json({ error: "The end time must be after the start." }, { status: 400 });
    }
    const created = await createStaffEvent(user.email, {
      title,
      scheduledAt: scheduled.toISOString(),
      endAt: end?.toISOString() ?? null,
      note: payload.note?.trim().slice(0, 2000) ?? "",
      location: payload.location?.trim().slice(0, 160) ?? "",
      responseOptions: payload.responseOptions,
    });
    if (!created) {
      return Response.json({ error: "You are not a member of this staff calendar." }, { status: 403 });
    }
    let notified = 0;
    if (payload.notify !== false) {
      const result = await sendStaffNotification(
        user.email,
        created.id,
        "New staff event",
        `${title} · ${scheduled.toLocaleString("en-US")}`,
      );
      notified = result?.sent ?? 0;
    }
    return Response.json({ id: created.id, notified }, { status: 201 });
  } catch {
    return Response.json({ error: "Staff event could not be created." }, { status: 400 });
  }
}
