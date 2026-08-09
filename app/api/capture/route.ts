import { getChatGPTUser } from "../../chatgpt-auth";
import { createReminder } from "../../../db/reminders";
import { parseReminderText } from "../../server/reminder-parser";

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  const payload = (await request.json()) as { text?: string; sourceType?: string; sourceLabel?: string };
  const text = payload.text?.trim() ?? "";
  if (!text || text.length > 4000) {
    return Response.json({ error: "Say or paste a shorter reminder." }, { status: 400 });
  }
  const parsed = parseReminderText(text);
  if (!parsed) {
    return Response.json(
      { error: "Include a day or time, for example: Call Sam tomorrow at 3 PM." },
      { status: 400 },
    );
  }
  const id = await createReminder({
    userEmail: user.email,
    title: parsed.title,
    scheduledAt: parsed.scheduledAt,
    note: parsed.note,
    sourceType: payload.sourceType?.slice(0, 40) || "text",
    sourceLabel: payload.sourceLabel?.slice(0, 120) || "Quick capture",
    status: "scheduled",
    confidence: parsed.confidence,
  });
  return Response.json({ id, reminder: parsed }, { status: 201 });
}
