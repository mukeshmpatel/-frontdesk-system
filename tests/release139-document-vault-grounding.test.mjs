import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("document vault grounding is honest about the missing OCR text — metadata only, no invented content", async () => {
  const service = await read("db/document-vault.ts");
  assert.match(service, /export async function documentVaultReferences/);
  assert.match(service, /Full document text is not extracted \(OCR is not configured\)/);
  assert.match(service, /never invent or quote body text/);
  assert.doesNotMatch(service, /content_text/, "must not claim to read the unpopulated content_text column");
});

test("document vault grounding only surfaces ACTIVE documents and their real metadata", async () => {
  const service = await read("db/document-vault.ts");
  const fn = service.match(/export async function documentVaultReferences[\s\S]*?\n\}/)[0];
  assert.match(fn, /r\.status === "ACTIVE"/);
  assert.match(fn, /title: r\.title/);
  assert.match(fn, /documentType: r\.document_type/);
  assert.match(fn, /classificationNote: r\.classification_evidence \|\| null/);
});

test("the search_document_vault tool is wired into agents that plausibly need policy citation", async () => {
  const registry = await read("app/server/agents/digital-employee-registry.ts");
  assert.match(registry, /const documentVaultTool = centerTool\("search_document_vault"/);
  for (const agentKey of ["executive-briefing", "assistant-general-manager", "front-desk", "housekeeping-coordinator", "compliance-inspector", "review-manager", "cash-auditor", "hiring-manager"]) {
    const block = registry.match(new RegExp(`"${agentKey}": \\{[\\s\\S]*?\\n  \\},`));
    assert.ok(block, `missing registry entry for ${agentKey}`);
    assert.match(block[0], /documentVaultTool/, `${agentKey} should have access to documentVaultTool`);
  }
});

test("the maintenance dispatcher gets its own directly-wired vault tool, matching its dedicated-agent pattern", async () => {
  const service = await read("app/server/agents/maintenance-briefing-agent.ts");
  assert.match(service, /const documentVaultTool = tool\(\{/);
  assert.match(service, /name: "search_document_vault"/);
  assert.match(service, /WARRANTY or MAINTENANCE_RECORD document/);
  assert.match(service, /tools: \[workTool, complianceTool, assetTool, documentVaultTool, proposeDispatchTool\]/);
});

test("the vault tool never claims to search — no new query parameter accepted, consistent with every other GroundedTool", async () => {
  const registry = await read("app/server/agents/digital-employee-registry.ts");
  const toolDef = registry.match(/const documentVaultTool = centerTool\("search_document_vault"[\s\S]*?documentVaultReferences\);/)[0];
  assert.doesNotMatch(toolDef, /\bquery\b/i);
});
