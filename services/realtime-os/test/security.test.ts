import assert from "node:assert/strict";
import test from "node:test";
import { assertSafeMediaUrl, redactForModel } from "../src/security.js";
import { hospitalityAiIntentSystemPrompt } from "../src/constants/aiPrompts.js";

test("redacts payment and personal identifiers before model processing", () => {
  const output = redactForModel("Card 4111 1111 1111 1111, SSN 123-45-6789, me@example.com, 785-825-2111");
  assert.doesNotMatch(output, /4111/);
  assert.doesNotMatch(output, /123-45/);
  assert.doesNotMatch(output, /me@example/);
  assert.doesNotMatch(output, /785-825/);
  assert.match(output, /PAYMENT_DATA_REDACTED/);
});

test("rejects non-HTTPS media and credential-bearing URLs", () => {
  assert.throws(() => assertSafeMediaUrl("http://example.com/photo.jpg"));
  assert.throws(() => assertSafeMediaUrl("https://user:password@example.com/photo.jpg"));
  assert.equal(assertSafeMediaUrl("https://example.com/photo.jpg"), "https://example.com/photo.jpg");
});

test("orchestrator prompt prohibits unverified check-in and key release", () => {
  const prompt = hospitalityAiIntentSystemPrompt("America/Chicago", new Date("2026-07-26T17:00:00.000Z"));
  assert.match(prompt, /Never infer check-in/);
  assert.match(prompt, /authorize a digital key/);
});
