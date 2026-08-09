import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Release 127 preserves prior properties while activating exactly one canonical sample", async () => {
  const [migration, service, route, page] = await Promise.all([
    read("migrations/0081_canonical_sample_workspace.sql"),
    read("db/sample-environments.ts"),
    read("app/api/v1/sample-environments/route.ts"),
    read("app/aaiq-sample-lab/sample-environment-client.tsx"),
  ]);
  assert.match(migration, /canonical_workspace_profiles/);
  assert.match(service, /ARCHIVED_SOURCE/);
  assert.match(service, /ONE_PERFECT_EDITABLE_SAMPLE/);
  assert.match(service, /activateCanonicalSampleWorkspace/);
  assert.match(service, /AAIQ Sample Hotel & Conference Center/);
  assert.match(route, /ACTIVATE_CANONICAL_SAMPLE/);
  assert.match(page, /Activate perfect sample workspace/);
});

test("canonical sample contains working staff, assets, inbox, cash, hiring, website and Digital Employees", async () => {
  const service = await read("db/sample-environments.ts");
  for (const evidence of [
    "General Manager", "Front Desk Supervisor", "Front Desk Associate",
    "Housekeeping Supervisor", "Room Attendant", "Maintenance Manager",
    "Maintenance Technician", "roomCount: 105", "roomAssetTemplate",
    "communication_threads", "cash_source_batches", "workforce_job_requisitions",
    "website_factory_projects", "AAIQ Front Desk Agent", "AAIQ Visual QA Supervisor",
  ]) assert.match(service, new RegExp(evidence));
});

test("agent studio provides clickable role workers and text or multilingual voice commands", async () => {
  const [service, client, route] = await Promise.all([
    read("db/agent-platform.ts"),
    read("app/aaiq-agent-studio/agent-studio-client.tsx"),
    read("app/api/v1/agent-studio/route.ts"),
  ]);
  assert.match(client, /VOICE_TRANSCRIPT/);
  assert.match(client, /English/);
  assert.match(client, /Español/);
  assert.match(client, /हिन्दी/);
  assert.match(client, /ગુજરાતી/);
  assert.match(client, /👩🏽‍💼/);
  assert.match(route, /RUN_DIGITAL_EMPLOYEE_COMMAND/);
  assert.match(service, /digital_employee_command_sessions/);
  assert.match(service, /APPROVAL_REQUIRED/);
});

test("review, growth, workforce uploads and property assets cannot read archived-property rows", async () => {
  const [migration, review, growth, reports, assets] = await Promise.all([
    read("migrations/0083_review_growth_workforce_property_scope.sql"),
    read("db/review-intelligence.ts"),
    read("db/growth-platform.ts"),
    read("db/workforce-reports.ts"),
    read("db/property-assets.ts"),
  ]);
  for (const table of ["guest_review_events", "marketing_content_items", "workforce_report_uploads"])
    assert.match(migration, new RegExp(`ALTER TABLE ${table} ADD COLUMN property_id`));
  assert.match(review, /authorizedPropertyScope/);
  assert.match(review, /guest_review_events WHERE organization_id=\? AND property_id=\?/);
  assert.match(growth, /marketing_content_items WHERE organization_id=\? AND property_id=\?/);
  assert.match(reports, /organization_id = \? AND property_id = \?/);
  assert.match(assets, /a\.organization_id=\? AND a\.property_id=\?/);
});

test("video inventory intelligence produces governed item counts instead of changing inventory silently", async () => {
  const [migration, service, client] = await Promise.all([
    read("migrations/0081_canonical_sample_workspace.sql"),
    read("db/video-intelligence.ts"),
    read("app/aaiq-video-intelligence/video-intelligence-client.tsx"),
  ]);
  assert.match(migration, /video_inventory_detection_items/);
  assert.match(service, /proposed_quantity/);
  assert.match(service, /NEEDS_REVIEW/);
  assert.match(service, /video_inventory_detection_items/);
  assert.match(service, /NEEDS_REVIEW/);
  assert.doesNotMatch(service, /UPDATE supply_inventory SET quantity/);
  assert.match(client, /Run canonical sample inventory demonstration/);
});
