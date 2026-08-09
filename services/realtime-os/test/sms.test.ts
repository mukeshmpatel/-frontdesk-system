import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL = "postgresql://aaiq:test@localhost:5432/aaiq";
process.env.REDIS_URL = "redis://localhost:6379";
process.env.OPENAI_API_KEY = "test-key-with-sufficient-length-for-validation";
process.env.JWT_SECRET = "test-secret-with-at-least-thirty-two-characters";
process.env.PUBLIC_BASE_URL = "https://aaiq.example.com";

test("normalizes strict E.164 recipients and rejects ambiguous numbers", async () => {
  const { normalizeE164 } = await import("../src/services/smsService.js");
  assert.equal(normalizeE164("+17858252111"), "+17858252111");
  assert.throws(() => normalizeE164("7858252111"));
  assert.throws(() => normalizeE164("+012345678"));
});
