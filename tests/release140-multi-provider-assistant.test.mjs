import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Google Gemini is wired through a real, documented OpenAI-compatible endpoint, not a fabricated one", async () => {
  const runtime = await read("app/server/agents/agent-runtime.ts");
  assert.match(runtime, /export async function resolveModelConnection/);
  assert.match(runtime, /https:\/\/generativelanguage\.googleapis\.com\/v1beta\/openai\//);
  assert.match(runtime, /useResponses: false, providerLabel: "Google Gemini"/);
});

test("Anthropic is explicitly not wired, and the comment says why, rather than silently omitting it", async () => {
  const runtime = await read("app/server/agents/agent-runtime.ts");
  assert.match(runtime, /Anthropic is intentionally not offered here/);
  assert.match(runtime, /publishes no OpenAI-compatible endpoint/);
});

test("model resolution falls back to Gemini only when OpenAI is not configured, preserving existing OpenAI-first behavior", async () => {
  const runtime = await read("app/server/agents/agent-runtime.ts");
  const fn = runtime.match(/export async function resolveModelConnection[\s\S]*?\n\}/)[0];
  const openaiIdx = fn.indexOf('providerLabel: "OpenAI"');
  const googleIdx = fn.indexOf('providerLabel: "Google Gemini"');
  assert.ok(openaiIdx > -1 && googleIdx > -1 && openaiIdx < googleIdx, "OpenAI must be checked before Google");
});

test("both runGroundedOperationsAgent and the maintenance dispatcher use the shared resolver instead of an OpenAI-only inline check", async () => {
  const [runtime, maintenance] = await Promise.all([
    read("app/server/agents/agent-runtime.ts"),
    read("app/server/agents/maintenance-briefing-agent.ts"),
  ]);
  assert.match(runtime, /const connection = await resolveModelConnection\(run\.context\.organizationId\);/);
  assert.match(runtime, /modelProvider: new OpenAIProvider\(\{ apiKey: connection\.apiKey, baseURL: connection\.baseURL, useResponses: connection\.useResponses \}\)/);
  assert.match(maintenance, /const connection = await resolveModelConnection\(run\.context\.organizationId\);/);
  assert.match(maintenance, /model: connection\.model,/);
});

test("Google AI credentials reuse the existing encrypted integration vault, not a new storage mechanism", async () => {
  const service = await read("db/open-source-integrations.ts");
  assert.match(service, /\["GOOGLE_AI", "Google AI \(Gemini\)"/);
  assert.match(service, /GOOGLE_AI: \["GOOGLE_AI_API_KEY"\]/);
  assert.doesNotMatch(service, /CREATE TABLE/i);
});

test("the ask-aaiq agent is registered in the roster and reuses the standard runtime, not a bespoke code path", async () => {
  const [platform, registry] = await Promise.all([
    read("db/agent-platform.ts"),
    read("app/server/agents/digital-employee-registry.ts"),
  ]);
  assert.match(platform, /\["ask-aaiq", "AAIQ Assistant"/);
  assert.match(registry, /"ask-aaiq": \{/);
  assert.match(registry, /begin that part of your answer with "General knowledge \(not verified against AAIQ records\):"/);
});

test("ask-aaiq is never special-cased outside the shared registry dispatch path", async () => {
  const command = await read("app/server/agents/digital-employee-command.ts");
  assert.doesNotMatch(command, /ask-aaiq/);
});

test("the home page Ask AAIQ assistant reuses the same authenticated command API every other Digital Employee uses", async () => {
  const component = await read("app/components/aaiq-assistant.tsx");
  assert.match(component, /action: "RUN_DIGITAL_EMPLOYEE_COMMAND", agentKey: "ask-aaiq"/);
  const daymark = await read("app/daymark-client.tsx");
  assert.match(daymark, /import AaiqAssistant from "\.\/components\/aaiq-assistant"/);
  assert.match(daymark, /<AaiqAssistant \/>/);
});
