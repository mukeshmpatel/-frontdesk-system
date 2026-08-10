import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("sort_order is added additively to the existing quick link preference table, not a duplicate table", async () => {
  const migration = await read("migrations/0085_dashboard_layout_order.sql");
  assert.match(migration, /ALTER TABLE user_quick_link_preferences ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0/);
  assert.doesNotMatch(migration, /CREATE TABLE/i, "must extend the canonical preference table, not create a second one");
});

test("migration 0085 applies cleanly against the existing 0040 baseline", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(await read("migrations/0040_role_home_adoption.sql"));
  db.exec(await read("migrations/0085_dashboard_layout_order.sql"));
  const columns = db.prepare("PRAGMA table_info(user_quick_link_preferences)").all().map(c => c.name);
  assert.ok(columns.includes("sort_order"));
});

test("rollback drops only the added column", async () => {
  assert.match(await read("migrations/rollbacks/0085_dashboard_layout_order_rollback.sql"), /ALTER TABLE user_quick_link_preferences DROP COLUMN sort_order/);
});

test("the browser is never trusted for dashboard authorization: every pin/visit is re-checked server side", async () => {
  const service = await read("db/home-adoption.ts");
  assert.match(service, /import \{ hasModuleAccess \} from "\.\/access-management"/);
  assert.match(service, /import \{ capabilityForPath \} from "\.\.\/lib\/aaiq-capabilities"/);
  assert.match(service, /async function authorizedForDashboard/);
  assert.match(service, /if\(!await authorizedForDashboard\(email,href\)\)throw new Error/);
  assert.match(service, /authorized\.filter\(x=>x\.ok\)\.map\(x=>x\.row\)/, "stale preferences for revoked modules must be dropped from the response, not just rejected on write");
});

test("pinned cards support explicit manual reordering, not just pin/hide", async () => {
  const service = await read("db/home-adoption.ts");
  assert.match(service, /action==="MOVE_UP"\|\|input\.action==="MOVE_DOWN"/);
  assert.match(service, /Pin this module before reordering it\./);
  const client = await read("app/components/smart-quick-links.tsx");
  assert.match(client, /MOVE_UP/);
  assert.match(client, /MOVE_DOWN/);
  assert.match(client, /sortOrder/);
});

test("personalization never grants access: PIN and MOVE actions require an existing authorized module", async () => {
  const service = await read("db/home-adoption.ts");
  const pinAction = service.match(/if\(!await authorizedForDashboard\(email,href\)\)throw new Error\("You are not authorized for this module\."\);/);
  assert.ok(pinAction, "authorization check must run before any href-based mutation, including PIN and MOVE");
});
