import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("variant tracking is added additively to the existing projects table, not a parallel table", async () => {
  const migration = await read("migrations/0087_website_factory_ai_generation.sql");
  assert.match(migration, /ALTER TABLE website_factory_projects ADD COLUMN variant_group_id TEXT/);
  assert.match(migration, /ALTER TABLE website_factory_projects ADD COLUMN variant_label TEXT/);
  assert.doesNotMatch(migration, /CREATE TABLE/i);
});

test("migration 0087 applies cleanly against the website_factory_projects table shape", async () => {
  const db = new DatabaseSync(":memory:");
  const createTable = (await read("drizzle/0017_reviews_ota_website_factory.sql"))
    .match(/CREATE TABLE IF NOT EXISTS website_factory_projects \([^;]*\);/)[0];
  db.exec(createTable);
  db.exec("ALTER TABLE website_factory_projects ADD COLUMN property_context_id TEXT;");
  db.exec(await read("migrations/0087_website_factory_ai_generation.sql"));
  const columns = db.prepare("PRAGMA table_info(website_factory_projects)").all().map(c => c.name);
  for (const column of ["variant_group_id", "variant_label", "research_sources_json"]) assert.ok(columns.includes(column));
});

test("rollback drops exactly what the migration added", async () => {
  const rollback = await read("migrations/rollbacks/0087_website_factory_ai_generation_rollback.sql");
  assert.match(rollback, /DROP COLUMN variant_group_id/);
  assert.match(rollback, /DROP COLUMN variant_label/);
  assert.match(rollback, /DROP COLUMN research_sources_json/);
});

test("web research never fabricates a result: no key configured means connected:false, not invented content", async () => {
  const service = await read("db/website-factory.ts");
  assert.match(service, /export async function researchProperty/);
  assert.match(service, /if \(!apiKey\) return \{ connected: false, results: \[\] /);
  assert.match(service, /api\.search\.brave\.com/);
  assert.doesNotMatch(service, /connected:\s*true.*results:\s*\[.*fake|placeholder|example\.com/i);
});

test("createWebsiteOptionSet only blocks on an existing PUBLISHED site, not on other drafts, unlike the manual single-project flow", async () => {
  const service = await read("db/website-factory.ts");
  assert.match(service, /AND status='PUBLISHED' LIMIT 1`\)\n\s*\.bind\(context\.organizationId, profile\.property\.id\)\.first\(\);\n\s*if \(published\) throw new Error/);
});

test("choosing an option archives its siblings but never touches the PUBLISHED flow, which stays a separate human step", async () => {
  const service = await read("db/website-factory.ts");
  const fn = service.match(/export async function chooseWebsiteOption[\s\S]*?\n\}/)[0];
  assert.match(fn, /status='ARCHIVED'/);
  assert.match(fn, /status!='PUBLISHED'/);
  assert.doesNotMatch(fn, /status='PUBLISHED'[^']/);
});

test("the generation agent never invents a fact outside its own tools, and requires exactly 3 distinct options", async () => {
  const agent = await read("app/server/agents/website-generation-agent.ts");
  assert.match(agent, /z\.array\(optionSchema\)\.length\(3\)/);
  assert.match(agent, /never invent one/);
  assert.match(agent, /never 3 near-identical variants/);
  assert.match(agent, /Choose each templateId only from the supplied list/);
});

test("narrowToGeneratedOptions never lets an invented template id through — falls back to a real one", async () => {
  const agent = await read("app/server/agents/website-generation-agent.ts");
  const fn = agent.match(/export function narrowToGeneratedOptions[\s\S]*?\n\}/)[0];
  assert.match(fn, /WEBSITE_TEMPLATES\.some\(t => t\.id === option\.templateId\) \? option\.templateId : WEBSITE_TEMPLATES\[0\]\.id/);
});

test("the route persists generated options as real DRAFT projects rather than only returning ephemeral text", async () => {
  const route = await read("app/api/v1/website-factory/route.ts");
  assert.match(route, /GENERATE_WEBSITE_OPTIONS/);
  assert.match(route, /createWebsiteOptionSet/);
  assert.match(route, /CHOOSE_WEBSITE_OPTION/);
});

test("the UI surfaces the 3 generated options with a choose action, not a backend-only capability", async () => {
  const client = await read("app/aaiq-website-factory/website-factory-client.tsx");
  assert.match(client, /generateAiOptions/);
  assert.match(client, /chooseOption/);
  assert.match(client, /Choose this one/);
  assert.match(client, /grounded only in your verified property profile — no web research connector is configured\./i);
});

test("archived variant siblings no longer clutter the main portfolio view", async () => {
  const service = await read("db/website-factory.ts");
  assert.match(service, /WHERE organization_id=\? AND property_context_id=\? AND status!='ARCHIVED'/);
});

test("Brave Search credentials reuse the existing encrypted integration vault", async () => {
  const service = await read("db/open-source-integrations.ts");
  assert.match(service, /\["BRAVE_SEARCH", "Brave Search API"/);
  assert.match(service, /BRAVE_SEARCH: \["BRAVE_SEARCH_API_KEY"\]/);
});
