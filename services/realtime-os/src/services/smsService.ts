import twilio, { type Twilio } from "twilio";
import { config } from "../config.js";

export interface SendSmsPayload {
  to: string;
  body: string;
  statusCallback?: string;
}

export type SendSmsResult =
  | { success: true; messageId: string; status: string }
  | { success: false; error: string; code?: string };

let client: Twilio | null = null;

function twilioClient() {
  if (!config.TWILIO_ACCOUNT_SID || !config.TWILIO_AUTH_TOKEN || !config.TWILIO_PHONE_NUMBER) {
    throw new Error("Twilio SMS credentials and phone number are not fully configured.");
  }
  client ??= twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);
  return client;
}

export function normalizeE164(value: string) {
  const phone = value.trim();
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new Error("Recipient must be a valid E.164 phone number.");
  return phone;
}

export async function sendRealTimeSms(payload: SendSmsPayload): Promise<SendSmsResult> {
  try {
    const to = normalizeE164(payload.to);
    const body = payload.body.trim();
    if (!body) throw new Error("Missing message body.");
    if (body.length > 1_600) throw new Error("SMS body exceeds the 1,600-character safety limit.");
    const message = await twilioClient().messages.create({
      body, from: config.TWILIO_PHONE_NUMBER!, to,
      ...(payload.statusCallback ? { statusCallback: payload.statusCallback } : {}),
    });
    return { success: true, messageId: message.sid, status: message.status };
  } catch (error: unknown) {
    const caught = error instanceof Error ? error : new Error("Unknown Twilio error.");
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : undefined;
    console.error("Critical Outbound SMS Failure", { message: caught.message, code });
    return { success: false, error: caught.message, ...(code ? { code } : {}) };
  }
}
