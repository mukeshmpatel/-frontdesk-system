import { config } from "../config.js";

export interface SlackAlertPayload {
  propertyName: string;
  roomNumber: string;
  minutesOverdue: number;
  correlationId: string;
}

export class SlackAlertService {
  static async dispatchEmergencySlackAlert(data: SlackAlertPayload): Promise<string> {
    if (!config.SLACK_OPERATIONS_WEBHOOK_URL) {
      throw new Error("Slack operations webhook is not configured.");
    }
    const response = await fetch(config.SLACK_OPERATIONS_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: `Late checkout escalation for Room ${data.roomNumber}`,
        blocks: [
          { type: "header", text: { type: "plain_text", text: "Late checkout escalation", emoji: true } },
          {
            type: "section",
            fields: [
              { type: "mrkdwn", text: `*Property*\n${data.propertyName}` },
              { type: "mrkdwn", text: `*Room*\n${data.roomNumber}` },
              { type: "mrkdwn", text: `*Overdue*\n${data.minutesOverdue} minutes` },
              { type: "mrkdwn", text: `*Trace*\n${data.correlationId}` },
            ],
          },
          {
            type: "context",
            elements: [{ type: "mrkdwn", text: "Guest PII is intentionally omitted. Open AAIQ using authorized staff access." }],
          },
        ],
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`Slack webhook returned HTTP ${response.status}.`);
    return response.headers.get("x-slack-req-id") ?? `slack-${data.correlationId}`;
  }
}
