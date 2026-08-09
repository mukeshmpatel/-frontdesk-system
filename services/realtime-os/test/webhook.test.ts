import assert from "node:assert/strict";
import test from "node:test";
import twilio from "twilio";

process.env.DATABASE_URL = "postgresql://aaiq:test@localhost:5432/aaiq";
process.env.REDIS_URL = "redis://localhost:6379";
process.env.OPENAI_API_KEY = "test-key-with-sufficient-length-for-validation";
process.env.JWT_SECRET = "test-secret-with-at-least-thirty-two-characters";
process.env.PUBLIC_BASE_URL = "https://aaiq.example.com";
process.env.TWILIO_AUTH_TOKEN = "test-twilio-auth-token-long-enough";

test("validates a canonical Twilio form signature and rejects mutation", async () => {
  const { validateTwilioWebhook } = await import("../src/middleware/verifyTwilioSignature.js");
  const url = "https://aaiq.example.com/api/v1/sms/webhook";
  const body = { From: "+17855550100", Body: "AC in room 104 is broken", MessageSid: "SM123" };
  const signature = twilio.getExpectedTwilioSignature(process.env.TWILIO_AUTH_TOKEN!, url, body);
  assert.equal(validateTwilioWebhook(signature, url, body), true);
  assert.equal(validateTwilioWebhook(signature, url, { ...body, Body: "tampered" }), false);
});

test("bounded streaming aborts when the actual body exceeds the limit", async () => {
  const { collectBoundedStream } = await import("../src/media.js");
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(6));
      controller.enqueue(new Uint8Array(6));
      controller.close();
    },
  });
  await assert.rejects(() => collectBoundedStream(stream, 10), /exceeds/);
});
