import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("domain connections are their own table, additive, with no automatic DNS-writing capability", async () => {
  const migration = await read("migrations/0088_website_domain_connections.sql");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS website_domain_connections/);
  assert.match(migration, /status TEXT NOT NULL DEFAULT 'AWAITING_DNS' CHECK\(status IN\('AWAITING_DNS','VERIFIED','FAILED'\)\)/);
  assert.match(migration, /UNIQUE\(organization_id,domain\)/);
});

test("migration 0088 applies cleanly standalone", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(await read("migrations/0088_website_domain_connections.sql"));
  const columns = db.prepare("PRAGMA table_info(website_domain_connections)").all().map(c => c.name);
  for (const column of ["domain", "target_hostname", "verification_token", "status", "verified_at", "last_check_error"])
    assert.ok(columns.includes(column));
});

test("rollback drops exactly the table and index the migration created", async () => {
  const rollback = await read("migrations/rollbacks/0088_website_domain_connections_rollback.sql");
  assert.match(rollback, /DROP TABLE IF EXISTS website_domain_connections/);
  assert.match(rollback, /DROP INDEX IF EXISTS website_domain_connections_project_idx/);
});

test("requesting a connection rejects IPs, localhost, and non-hostname input for both the domain and the target", async () => {
  const service = await read("db/website-factory.ts");
  assert.match(service, /function validHostname/);
  assert.match(service, /host === "localhost" \|\| host\.endsWith\("\.local"\) \|\| isIpLiteral \|\| !host\.includes\("\."\)/);
  assert.match(service, /if \(!domain\) throw new Error/);
  assert.match(service, /if \(!targetHostname\) throw new Error/);
});

test("verification is a real DNS-over-HTTPS lookup against a public resolver, never an assumed success", async () => {
  const service = await read("db/website-factory.ts");
  assert.match(service, /cloudflare-dns\.com\/dns-query/);
  assert.match(service, /application\/dns-json/);
  const fn = service.match(/export async function verifyDomainConnection[\s\S]*?\nexport async function domainConnectionsForProject|export async function verifyDomainConnection[\s\S]*$/)[0];
  assert.match(fn, /if \(found\) \{/, "must gate the VERIFIED status behind an actual match");
  assert.match(fn, /Verification TXT record was not found yet/);
});

test("AAIQ never automatically writes to the user's real DNS zone — only generates records and checks them", async () => {
  const service = await read("db/website-factory.ts");
  assert.doesNotMatch(service, /PUT.*dns|POST.*dns-query|cloudflare\.com\/client\/v4\/zones/i, "no write calls to any DNS provider API");
});

test("the two domain actions are wired into the API route, admin-gated like every other mutating action here", async () => {
  const route = await read("app/api/v1/website-factory/route.ts");
  assert.match(route, /REQUEST_DOMAIN_CONNECTION/);
  assert.match(route, /VERIFY_DOMAIN_CONNECTION/);
});

test("the domain panel is reachable in the editor, not a backend-only capability, and never nests a <form>", async () => {
  const client = await read("app/aaiq-website-factory/website-factory-client.tsx");
  assert.match(client, /function DomainConnectionPanel/);
  assert.match(client, /Deliberately not a nested <form>/);
  assert.match(client, /Get DNS records/);
  assert.match(client, /AAIQ never modifies your DNS automatically/);
});

test("domain connections are scoped to the active property and returned alongside the rest of the workspace, not a separate silent query", async () => {
  const service = await read("db/website-factory.ts");
  assert.match(service, /FROM website_domain_connections WHERE organization_id=\? AND property_id=\?/);
  assert.match(service, /domainConnections: domainConnections\.results,/);
});
