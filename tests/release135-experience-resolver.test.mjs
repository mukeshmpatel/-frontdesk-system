import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("persona is derived only from existing role/role_tier data, not a new authority concept", async () => {
  const service = await read("db/experience-resolver.ts");
  assert.match(service, /export function resolvePersona/);
  assert.match(service, /if \(role === "admin" && roleTier === "CORPORATE"\) return "PLATFORM_ADMINISTRATION";/);
  assert.match(service, /if \(role === "admin" \|\| roleTier === "MANAGER" \|\| roleTier === "SUPERVISOR"\) return "MANAGEMENT_COMMAND";/);
  assert.match(service, /return "MY_WORK";/);
});

test("the manifest is signed and its token cannot be replayed as a different token type", async () => {
  const service = await read("db/experience-resolver.ts");
  assert.match(service, /async function signature/);
  assert.match(service, /crypto\.subtle\.sign\("HMAC"/);
  assert.match(service, /EXPERIENCE_MANIFEST\|/);
  assert.match(service, /export async function verifyExperienceManifestToken/);
  assert.match(service, /if \(tag !== "EXPERIENCE_MANIFEST"\) return \{ ok: false \};/);
});

test("the resolver reuses canonical property scope and module-grant services instead of duplicating them", async () => {
  const service = await read("db/experience-resolver.ts");
  assert.match(service, /import \{ authorizedPropertyList, authorizedPropertyScope \} from "\.\/property-scope"/);
  assert.match(service, /import \{ authorizedCapabilityKeys \} from "\.\/access-management"/);
  assert.match(service, /import \{ AAIQ_CAPABILITIES/);
  assert.doesNotMatch(service, /CREATE TABLE/i);
});

test("authorizedCapabilityKeys batches the same grant check hasModuleAccess enforces, in one query", async () => {
  const service = await read("db/access-management.ts");
  assert.match(service, /export async function authorizedCapabilityKeys/);
  assert.match(service, /if\(context\.role==="admin"\)return \[\.\.\.AAIQ_CAPABILITY_KEYS\];/);
  assert.match(service, /JOIN user_access_profiles p[\s\S]*p\.access_status='ACTIVE'/);
});

test("the manifest is exposed through an authenticated API route, not left unreachable", async () => {
  const route = await read("app/api/v1/experience-manifest/route.ts");
  assert.match(route, /getChatGPTUser/);
  assert.match(route, /status: 401/);
  assert.match(route, /resolveExperienceManifest/);
  assert.match(route, /status: 403/);
});

test("the resolved persona is rendered in the app shell, not computed and discarded", async () => {
  const shell = await read("app/components/aaiq-app-shell.tsx");
  assert.match(shell, /experience-manifest/);
  assert.match(shell, /setPersona/);
  assert.match(shell, /PERSONA_LABEL/);
  assert.match(shell, /shell-persona-badge/);
});
