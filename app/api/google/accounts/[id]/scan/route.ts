import { getChatGPTUser } from "../../../../../chatgpt-auth";
import { getGoogleConnection } from "../../../../../../db/google";
import { refreshGoogleAccessToken } from "../../../../../server/google";
import { decryptSecret } from "../../../../../server/secrets";
import { parseReminderText } from "../../../../../server/reminder-parser";
import { upsertInferredReminder } from "../../../../../../db/reminders";
import { ingestNotificationSource } from "../../../../../../db/notification-engine";
import { createCommunicationIntake } from "../../../../../../db/communication-center";

type GmailMessage = {
  id?: string;
  threadId?: string;
  snippet?: string;
  payload?: { headers?: Array<{ name?: string; value?: string }> };
};

function header(message: GmailMessage, name: string) {
  return message.payload?.headers?.find(
    (item) => item.name?.toLowerCase() === name.toLowerCase(),
  )?.value ?? "";
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });

  try {
    const payload = (await request.json().catch(() => ({}))) as { days?: number };
    const requestedDays = Number(payload.days ?? 14);
    const windowDays = Math.min(30, Math.max(1, Math.round(requestedDays) || 14));
    const { id } = await context.params;
    const connection = await getGoogleConnection(id, user.email);
    if (!connection) return Response.json({ error: "Account not found." }, { status: 404 });

    const accessToken = await refreshGoogleAccessToken(
      await decryptSecret(connection.encrypted_refresh_token),
    );
    const googleHeaders = { authorization: `Bearer ${accessToken}` };
    const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    listUrl.search = new URLSearchParams({
      maxResults: windowDays === 30 ? "50" : "20",
      q: `newer_than:${windowDays}d`,
    }).toString();

    const [profileResponse, inboxResponse, listResponse] = await Promise.all([
      fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: googleHeaders }),
      fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels/INBOX", { headers: googleHeaders }),
      fetch(listUrl, { headers: googleHeaders }),
    ]);
    if (!profileResponse.ok || !inboxResponse.ok || !listResponse.ok) {
      throw new Error("Gmail did not allow the inbox check.");
    }

    const profile = (await profileResponse.json()) as {
      emailAddress?: string;
      messagesTotal?: number;
    };
    const inbox = (await inboxResponse.json()) as { messagesUnread?: number };
    const listed = (await listResponse.json()) as { messages?: Array<{ id: string }> };
    const messageResponses = await Promise.all(
      (listed.messages ?? []).slice(0, windowDays === 30 ? 40 : 12).map((message) => {
        const detailUrl = new URL(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}`,
        );
        detailUrl.searchParams.set("format", "metadata");
        for (const field of ["Subject", "From", "Date"]) {
          detailUrl.searchParams.append("metadataHeaders", field);
        }
        return fetch(detailUrl, { headers: googleHeaders });
      }),
    );
    const recent = await Promise.all(
      messageResponses.filter((response) => response.ok).map(async (response) => {
        const message = (await response.json()) as GmailMessage;
        return {
          id: message.id,
          threadId: message.threadId,
          subject: header(message, "Subject") || "No subject",
          from: header(message, "From"),
          date: header(message, "Date"),
          snippet: message.snippet ?? "",
        };
      }),
    );

    let remindersCreated = 0;
    let suggestionsCreated = 0;
    let communicationsCreated = 0;
    for (const mail of recent) {
      if (!mail.id) continue;
      const communication = await createCommunicationIntake(user.email, {
        sourceKey: "GMAIL",
        sourceAccount: connection.account_email,
        sender: mail.from,
        subject: mail.subject,
        body: mail.snippet || "(No preview text was available.)",
        externalThreadId: mail.threadId || mail.id,
        externalMessageId: mail.id,
        receivedAt: new Date(mail.date || Date.now()).toISOString(),
      });
      if (communication && !communication.duplicate) communicationsCreated += 1;
      const source = await ingestNotificationSource({
        userEmail: user.email, source: "GMAIL", externalId: mail.id,
        sourceAccount: connection.account_email, sender: mail.from, subject: mail.subject,
        content: mail.snippet, receivedAt: new Date(mail.date || Date.now()).toISOString(),
      });
      const parsed = parseReminderText(mail.snippet, {
        subject: mail.subject,
        baseDate: new Date(mail.date || Date.now()),
        note: `${mail.snippet}\nFrom: ${mail.from}`,
      });
      if (!parsed) continue;
      if (source?.decision === "PENDING_APPROVAL") {
        suggestionsCreated += source.duplicate ? 0 : 1;
        continue;
      }
      const inferred = await upsertInferredReminder({
        userEmail: user.email,
        title: parsed.title,
        scheduledAt: parsed.scheduledAt,
        note: parsed.note,
        sourceType: "gmail",
        sourceLabel: connection.account_email,
        sourceMessageId: mail.id,
        confidence: parsed.confidence,
      });
      if (inferred.created) {
        remindersCreated += 1;
        if (inferred.status === "suggested") suggestionsCreated += 1;
      }
    }

    return Response.json({
      email: profile.emailAddress ?? connection.account_email,
      totalMessages: profile.messagesTotal ?? 0,
      unreadInbox: inbox.messagesUnread ?? 0,
      recent,
      remindersCreated,
      suggestionsCreated,
      communicationsCreated,
      windowDays,
      checkedCount: recent.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Inbox check failed.";
    return Response.json({ error: message }, { status: 400 });
  }
}
