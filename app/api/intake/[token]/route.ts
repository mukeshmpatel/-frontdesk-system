import { findIntakeSourceByHash, touchIntakeSource, upsertInferredReminder } from "../../../../db/reminders";
import { parseReminderText } from "../../../server/reminder-parser";
import { sha256Base64Url } from "../../../server/secrets";

type IncomingPayload = {
  id?: string;
  event_id?: string;
  subject?: string;
  title?: string;
  text?: string;
  body?: string;
  message?: string | { id?: string; text?: string };
  from?: string;
  sender?: string;
  date?: string;
  timestamp?: string;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  if (!token || token.length > 120) return Response.json({ error: "Invalid source link." }, { status: 404 });
  const source = await findIntakeSourceByHash(await sha256Base64Url(token));
  if (!source) return Response.json({ error: "Invalid source link." }, { status: 404 });
  const raw = await request.text();
  if (raw.length > 64000) return Response.json({ error: "Message is too large." }, { status: 413 });
  let payload: IncomingPayload;
  try {
    payload = JSON.parse(raw) as IncomingPayload;
  } catch {
    payload = { text: raw };
  }
  const nestedMessage = typeof payload.message === "object" ? payload.message : null;
  const body = payload.text || payload.body || (typeof payload.message === "string" ? payload.message : nestedMessage?.text) || "";
  const subject = payload.subject || payload.title || "Incoming message";
  const from = payload.from || payload.sender || source.name;
  const baseDate = new Date(payload.date || payload.timestamp || Date.now());
  const parsed = parseReminderText(body, {
    subject,
    baseDate,
    note: `${body}${from ? `\nFrom: ${from}` : ""}`,
  });
  await touchIntakeSource(source.id);
  if (!parsed) {
    return Response.json({ accepted: true, reminderCreated: false, reason: "No date or time was found." });
  }
  const messageId = payload.id || payload.event_id || nestedMessage?.id || `${source.id}:${await sha256Base64Url(`${subject}|${body}`)}`;
  const result = await upsertInferredReminder({
    userEmail: source.user_email,
    title: parsed.title,
    scheduledAt: parsed.scheduledAt,
    note: parsed.note,
    sourceType: source.provider,
    sourceLabel: source.name,
    sourceMessageId: messageId,
    confidence: parsed.confidence,
  });
  return Response.json({ accepted: true, reminderCreated: result.created, status: result.status });
}
