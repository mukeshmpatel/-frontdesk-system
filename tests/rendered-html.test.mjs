import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("server-renders the AAIQ Home workspace inside the canonical application shell", async () => {
  const [page, client, layout, navigation] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/daymark-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/aaiq-capabilities.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /requireChatGPTUser/);
  assert.match(layout, /AAI Q — Everything important, remembered/);
  assert.match(layout, /manifest:\s*"\/manifest\.webmanifest"/);
  assert.match(client, /home-view-tabs/);
  assert.doesNotMatch(client, /className="side-rail"/);
  assert.match(client, /Tell AAI Q what to remember/);
  assert.match(client, /Smart inbox/);
  assert.match(client, /Memories/);
  assert.match(client, /Sources/);
  assert.match(client, /\["home", "Today"\]/);
  assert.match(client, /\["calendar", "Calendar"\]/);
  assert.match(client, /\["inbox", "Smart Inbox"\]/);
  assert.match(client, />Guest Journey<\/a>/);
  assert.match(navigation, /Team Operations/);
});

test("ships durable reminders, universal intake, voice, and video", async () => {
  const [client, scanRoute, parser, schema, hosting, manifest, serviceWorker] = await Promise.all([
    readFile(new URL("../app/daymark-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/google/accounts/[id]/scan/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/server/reminder-parser.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
  ]);
  assert.match(client, /SpeechRecognition|webkitSpeechRecognition/);
  assert.match(client, /getUserMedia/);
  assert.match(client, /MediaRecorder/);
  assert.match(client, /\/api\/memories/);
  assert.match(scanRoute, /upsertInferredReminder/);
  assert.match(parser, /parseReminderText/);
  assert.match(schema, /media_memories/);
  assert.match(schema, /intake_sources/);
  assert.match(hosting, /"r2": "MEDIA"/);
  assert.match(manifest, /"share_target"/);
  assert.match(serviceWorker, /pathname\.startsWith\("\/api\/"\)/);
});

test("ships easy phone setup, configurable snooze, and rich alerts", async () => {
  const [client, accounts, serviceWorker] = await Promise.all([
    readFile(new URL("../app/daymark-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/accounts/accounts-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
  ]);
  assert.match(accounts, /Add your mobile number/);
  assert.match(accounts, /phoneMode/);
  assert.match(accounts, /Share → AAI Q/);
  assert.match(client, /snoozeReminder/);
  assert.match(client, /Quick snooze buttons/);
  assert.match(client, /You have an important message/);
  assert.match(client, /SpeechSynthesisUtterance/);
  assert.match(client, /Video reminder prompt/);
  assert.match(serviceWorker, /snooze-/);
});

test("ships 30-day recovery, preferred staff responses, and private host alerts", async () => {
  const [client, staffClient, staffDb, schema, scanRoute, serviceWorker] = await Promise.all([
    readFile(new URL("../app/daymark-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/staff-calendar.tsx", import.meta.url), "utf8"),
    readFile(new URL("../db/staff.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/google/accounts/[id]/scan/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
  ]);
  assert.match(client, /Recover 30 days/);
  assert.match(scanRoute, /Math\.min\(30/);
  assert.match(staffClient, /Preferred response buttons/);
  assert.match(staffClient, /Host\/admin alert/);
  assert.match(staffDb, /context\.role !== "admin"/);
  assert.match(schema, /staff_event_attendees/);
  assert.match(schema, /staff_notifications/);
  assert.match(serviceWorker, /staffEventId/);
});

test("ships explainable AI review, noise filtering, and duplicate protection", async () => {
  const [client, parser, remindersDb, accounts] = await Promise.all([
    readFile(new URL("../app/daymark-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/server/reminder-parser.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/reminders.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/accounts/accounts-client.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(client, /AAI Q assistant/);
  assert.match(client, /AI confidence/);
  assert.match(client, /Duplicate protection on/);
  assert.match(client, /Draft reply/);
  assert.match(client, /will never send a message automatically/);
  assert.match(parser, /lowValueMessage/);
  assert.match(parser, /report subscription/);
  assert.match(remindersDb, /duplicate: true/);
  assert.match(accounts, /waiting for first test message/);
});

test("ships private staff operations with server-enforced local IP time locking", async () => {
  const [client, operationsClient, operationsDb, schema, clientIp, timeRoute] = await Promise.all([
    readFile(new URL("../app/daymark-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/staff-operations.tsx", import.meta.url), "utf8"),
    readFile(new URL("../db/operations.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/server/client-ip.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/operations/time/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(client, /StaffOperations/);
  assert.match(operationsClient, /Create a shift/);
  assert.match(operationsClient, /Clock in/);
  assert.match(operationsClient, /Employee directory/);
  assert.match(operationsClient, /Digital front desk/);
  assert.match(operationsClient, /Local IP lock/);
  assert.match(operationsDb, /time_lock_enabled/);
  assert.match(operationsDb, /allowed_ip/);
  assert.match(operationsDb, /context\.role !== "admin"/);
  assert.match(clientIp, /cf-connecting-ip/);
  assert.match(timeRoute, /punchTime/);
  assert.match(schema, /work_locations/);
  assert.match(schema, /time_entries/);
  assert.match(schema, /employee_profiles/);
  assert.match(schema, /employee_shifts/);
  assert.match(schema, /front_desk_items/);
});

test("ships property-scoped customer intelligence with consented approval activation", async () => {
  const [page, client, db, route, service, guide] = await Promise.all([
    readFile(new URL("../app/aaiq-customer-intelligence/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/aaiq-customer-intelligence/customer-intelligence-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../db/customer-intelligence.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/v1/customer-intelligence/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../services/customer-intelligence/app/marketing_activation.py", import.meta.url), "utf8"),
    readFile(new URL("../services/customer-intelligence/IMPLEMENTATION_GUIDE.md", import.meta.url), "utf8"),
  ]);
  assert.match(page, /requireChatGPTUser/);
  assert.match(client, /Understand every consented guest journey/);
  assert.match(client, /DRY-RUN ACTIVATION/);
  assert.match(client, /Consent blocked|CONSENT BLOCKED/);
  assert.match(db, /cdp_tracking_events/);
  assert.match(db, /cdp_activation_requests/);
  assert.match(db, /organization_id=\? AND property_id=\?/);
  assert.match(route, /customerIntelligenceAction/);
  assert.match(service, /graph\.facebook\.com/);
  assert.match(service, /OfflineUserDataJob/);
  assert.match(service, /api\.sendgrid\.com\/v3\/mail\/send/);
  assert.match(guide, /does not access or modify HNE/);
});

test("ships persistent housekeeping, maintenance, evidence, and compliance workflows", async () => {
  const [home, navigation, client, workflowDb, route] = await Promise.all([
    readFile(new URL("../app/daymark-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/aaiq-capabilities.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/property-operations/property-operations-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../db/property-workflows.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/operations/workflows/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(navigation, /href: "\/property-operations"/);
  assert.match(client, /Housekeeping, maintenance & compliance/);
  assert.match(client, /capture="environment"/);
  assert.match(client, /Create maintenance ticket/);
  assert.match(client, /Generate due assignments/);
  assert.match(workflowDb, /operational_work_orders/);
  assert.match(workflowDb, /maintenance_compliance_templates/);
  assert.match(route, /15\*1024\*1024/);
  assert.match(route, /env\.MEDIA\.put/);
  assert.match(home, /SmartQuickLinks/);
  assert.match(client, /Upload the previous-night room report/);
  assert.match(client, /Complete each step in order/);
  assert.match(workflowDb, /GUESTROOM-PMI/);
  assert.match(workflowDb, /importNightRoomReport/);
});

test("ships approval-only AI scheduling and minute-specific digital front desk plans", async () => {
  const [client, page] = await Promise.all([
    readFile(new URL("../app/digital-front-desk/workforce-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/digital-front-desk/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page, /requireChatGPTUser/);
  assert.match(client, /Nothing is published until approved/);
  assert.match(client, /Approve shift/);
  assert.match(client, /Minute-by-minute operating plan/);
  assert.match(client, /Run night audit readiness gate/);
  assert.match(client, /Approval inbox/);
  assert.match(client, /Payroll intelligence/);
});

test("ships downloadable payroll reports, comparisons, uploads, and OPERA readiness", async () => {
  const [client, schema, uploadRoute, reportDb] = await Promise.all([
    readFile(new URL("../app/digital-front-desk/workforce-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/workforce/reports/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/workforce-reports.ts", import.meta.url), "utf8"),
  ]);
  assert.match(client, /Individual time card/);
  assert.match(client, /Overtime and threshold report/);
  assert.match(client, /Payroll-period comparison/);
  assert.match(client, /AI payroll forecast/);
  assert.match(client, /Download CSV|>CSV</);
  assert.match(client, /Compile report/);
  assert.match(client, /OPERA Cloud \/ OHIP/);
  assert.match(schema, /workforce_report_uploads/);
  assert.match(uploadRoute, /25 \* 1024 \* 1024/);
  assert.match(reportDb, /context\.role === "admin"/);
});

test("enforces user-private shift calendars at the server query boundary", async () => {
  const [client, operationsDb] = await Promise.all([
    readFile(new URL("../app/digital-front-desk/workforce-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../db/operations.ts", import.meta.url), "utf8"),
  ]);
  assert.match(client, /My Private Calendar/);
  assert.match(client, /User-private by default/);
  assert.match(operationsDb, /shiftScope/);
  assert.match(operationsDb, /lower\(s\.user_email\) = \?/);
});

test("ships enterprise report compilation, collision protection, audit, and escalation controls", async () => {
  const [client, report, controls, schema, calendarRoute, worker] = await Promise.all([
    readFile(new URL("../app/digital-front-desk/workforce-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/server/report-generator.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/platform-controls.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/v1/calendar/blocks/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
  ]);
  assert.match(client, /Choose any reporting period/);
  assert.match(client, /Quarter to date/);
  assert.match(report, /SHA-256/);
  assert.match(report, /page-break-inside:avoid/);
  assert.match(report, /#1A365D/);
  assert.match(controls, /AssetConflictError/);
  assert.match(controls, /urgency_score/);
  assert.match(calendarRoute, /status: 409/);
  assert.match(schema, /system_audit_trail/);
  assert.match(schema, /notification_outbox/);
  assert.match(worker, /runEscalationMatrix/);
});

test("exposes reports directly and ships tenant-bound drilldowns plus autonomous intake", async () => {
  const [home, reportsPage, client, summary, drilldown, intake, schema] = await Promise.all([
    readFile(new URL("../app/daymark-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/reports/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/report-drilldown-table.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/v1/reports/summary/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/reporting-insights.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/server/autonomous-intake.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
  ]);
  assert.match(home, /href="\/reports"/);
  assert.match(reportsPage, /PmsReportingCenter/);
  assert.match(client, /Transactional drill-down/);
  assert.match(summary, /reportDashboardSummary/);
  assert.match(drilldown, /report_drilldown_tokens/);
  assert.match(intake, /PAYMENT_DATA_REDACTED/);
  assert.match(intake, /AUTONOMOUS_INTAKE_PROCESSED/);
  assert.match(schema, /autonomous_intake_executions/);
  assert.match(schema, /realtime_events/);
  assert.match(client, /Export CSV/);
  assert.match(drilldown, /housekeeping-work/);
  assert.match(drilldown, /compliance-work/);
});

test("ships canonical assets, passports, floor maps, imports, quality review, and role command", async () => {
  const [client, assetDb, workflowDb, command, home, schema] = await Promise.all([
    readFile(new URL("../app/aaiq-asset-registry/asset-registry-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../db/property-assets.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/property-workflows.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/v1/command-center/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/daymark-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
  ]);
  assert.match(client, /Live floor map/);
  assert.match(client, /Room & asset passports/);
  assert.match(client, /Approve and import validated rows/);
  assert.match(client, /AI data-quality advisor/);
  assert.match(client, /Integration readiness center/);
  assert.match(assetDb, /asset_id/);
  assert.match(assetDb, /Duplicate equipment serial number/);
  assert.match(workflowDb, /GUESTROOM-PMI/);
  assert.match(workflowDb, /asset_id/);
  assert.match(command, /primaryAction/);
  assert.match(home, /AaiqCommandStrip/);
  assert.match(schema, /propertyAssetImports/);
});

test("ships immutable full-enterprise samples with clone-only real environments", async () => {
  const [page, client, sampleDb, route, navigation, sampleSchema] = await Promise.all([
    readFile(new URL("../app/aaiq-sample-lab/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/aaiq-sample-lab/sample-environment-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../db/sample-environments.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/v1/sample-environments/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/aaiq-capabilities.ts", import.meta.url), "utf8"),
    readFile(new URL("../migrations/0056_sample_environment_schema_governance.sql", import.meta.url), "utf8"),
  ]);
  assert.match(page, /requireChatGPTUser/);
  assert.match(client, /Sample Environment Library/);
  assert.match(client, /Create editable copy/);
  assert.doesNotMatch(sampleDb, /CREATE TABLE|CREATE INDEX|ALTER TABLE|DROP TABLE/i);
  assert.match(sampleSchema, /CHECK\(is_locked=1\)/);
  assert.match(sampleDb, /Protected AAIQ sample templates cannot be edited or deleted/);
  assert.match(sampleDb, /roomAssetTemplate/);
  assert.match(sampleDb, /ai_agent_registry/);
  assert.match(sampleDb, /sample_social_accounts/);
  assert.match(sampleDb, /sample_report_facts/);
  assert.match(route, /status: 423/);
  assert.match(navigation, /Sample Environments/);
});

test("ships approval-gated conversational setup and mobile asset evidence", async () => {
  const [setupClient, setupDb, assetClient, assetDb, home, globalCss, schema] =
    await Promise.all([
      readFile(
        new URL("../app/aaiq-setup-agent/setup-agent-client.tsx", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../db/setup-agent.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../app/aaiq-asset-registry/asset-registry-client.tsx", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../db/property-assets.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/daymark-client.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
      readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    ]);
  assert.match(setupClient, /Prepare AI plan/);
  assert.match(setupClient, /Approve and build/);
  assert.match(setupClient, /Speak instruction/);
  assert.match(setupClient, /narrated video/i);
  assert.match(setupDb, /ai_setup_sessions/);
  assert.match(setupDb, /READY_FOR_APPROVAL/);
  assert.match(setupDb, /HVAC \/ PTAC/);
  assert.match(setupDb, /Coffee Maker/);
  assert.match(assetClient, /Take photo/);
  assert.match(assetClient, /Serial plate/);
  assert.match(assetDb, /property_asset_attachments/);
  assert.match(assetDb, /SERIAL_PLATE/);
  assert.match(home, /\/aaiq-setup-agent/);
  assert.match(globalCss, /overflow-x:\s*auto/);
  assert.match(schema, /aiSetupSessions/);
  assert.match(schema, /propertyAssetAttachments/);
});

test("ships review-gated tax preparation and visual work evidence controls", async () => {
  const [taxClient, taxDb, taxRoute, workflowClient, workflowDb, schema, home, migration] =
    await Promise.all([
      readFile(new URL("../app/aaiq-tax-center/tax-center-client.tsx", import.meta.url), "utf8"),
      readFile(new URL("../db/tax-preparation.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/v1/tax-center/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/property-operations/property-operations-client.tsx", import.meta.url), "utf8"),
      readFile(new URL("../db/property-workflows.ts", import.meta.url), "utf8"),
      readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/daymark-client.tsx", import.meta.url), "utf8"),
      readFile(new URL("../drizzle/0016_tax_and_evidence_intelligence.sql", import.meta.url), "utf8"),
    ]);
  assert.match(taxClient, /Cash basis/);
  assert.match(taxClient, /Accrual basis/);
  assert.match(taxClient, /daily, weekly or monthly/i);
  assert.match(taxClient, /Provisional net operating income/);
  assert.match(taxClient, /does not file a return/i);
  assert.match(taxDb, /tax_financial_facts/);
  assert.match(taxDb, /computedLodgingTax/);
  assert.match(taxDb, /Collected-versus-computed tax variance/);
  assert.match(taxDb, /already imported/);
  assert.match(taxRoute, /tax-source-reports/);
  assert.match(workflowClient, /Required photo coverage/);
  assert.match(workflowClient, /Require rework/);
  assert.match(workflowClient, /Entry & door/);
  assert.match(workflowDb, /Completion blocked/);
  assert.match(workflowDb, /AWAITING_EVIDENCE_REVIEW/);
  assert.match(workflowDb, /work_evidence_reviews/);
  assert.match(schema, /taxPreparationProfiles/);
  assert.match(schema, /workEvidenceReviews/);
  assert.match(home, /SmartQuickLinks/);
  assert.match(
    await readFile(new URL("../lib/aaiq-capabilities.ts", import.meta.url), "utf8"),
    /href: "\/aaiq-tax-center"/,
  );
  assert.match(migration, /tax_return_workpapers/);
});

test("ships property-scoped enterprise front desk records with workflow, outbox, reporting, and manual fallback", async () => {
  const [client, service, route, schema, migration, shell, css] = await Promise.all([
    readFile(new URL("../app/digital-front-desk/enterprise-operations-center.tsx", import.meta.url), "utf8"),
    readFile(new URL("../db/enterprise-operations.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/operations/front-desk/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0020_enterprise_operations_foundation.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/components/aaiq-app-shell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(client, /Incident/);
  assert.match(client, /Pet registry/);
  assert.match(client, /Guest \/ additional-item request/);
  assert.match(client, /Automation exceptions/);
  assert.match(client, /Export filtered CSV/);
  assert.match(service, /front_desk\.incident\.created/);
  assert.match(service, /domain_outbox_events/);
  assert.match(service, /operational_status_history/);
  assert.match(service, /Cannot move/);
  assert.match(route, /CREATE_OPERATIONAL_RECORD/);
  assert.match(schema, /frontDeskOperationalRecords/);
  assert.match(schema, /automationExceptions/);
  assert.match(migration, /property_contexts/);
  assert.match(shell, /shell-property-context/);
  assert.match(css, /AAIQ readability standard/);
});

test("ships governed inventory item master, department tally, approval, procurement, partial receipts, and immutable ledger", async () => {
  const [client, countClient, catalog, inventoryDb, schema, migration, countMigration] = await Promise.all([
    readFile(new URL("../app/property-intelligence/property-intelligence-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/property-intelligence/inventory-count-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../db/aaiq-inventory-catalog.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/property-intelligence.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0020_enterprise_operations_foundation.sql", import.meta.url), "utf8"),
    readFile(new URL("../migrations/0044_inventory_count_workflow.sql", import.meta.url), "utf8"),
  ]);
  assert.match(client, /Create governed inventory item/);
  assert.match(client, /Create approval-controlled purchase order/);
  assert.match(client, /Receive against approved purchase order/);
  assert.match(client, /Issue inventory to department/);
  assert.match(inventoryDb, /create_purchase_order/);
  assert.match(inventoryDb, /receive_purchase_order/);
  assert.match(inventoryDb, /PARTIALLY_RECEIVED/);
  assert.match(inventoryDb, /PO_RECEIPT/);
  assert.match(client, /count & tally/);
  assert.match(countClient, /Full Qty means unopened units/);
  assert.match(countClient, /Submit .* counted items for review/);
  assert.match(countClient, /Approve & create replenishment/);
  assert.match(catalog, /AAIQ_INVENTORY_ITEM_COUNT/);
  assert.match(inventoryDb, /submit_inventory_count/);
  assert.match(inventoryDb, /approve_inventory_count/);
  assert.match(inventoryDb, /Auto-created from approved count/);
  assert.match(countMigration, /inventory_count_sessions/);
  assert.match(countMigration, /partial_quantity REAL/);
  assert.match(schema, /inventoryPurchaseOrders/);
  assert.match(migration, /inventory_purchase_order_lines/);
});

test("ships secured property switching and purpose-built department applications", async () => {
  const [shell, navigation, route, service, schema, migration, housekeeping, maintenance, compliance] = await Promise.all([
    readFile(new URL("../app/components/aaiq-app-shell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/aaiq-capabilities.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/operations/front-desk/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/enterprise-operations.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0021_property_context_department_apps.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/housekeeping/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/maintenance/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/compliance-center/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(shell, /Choose a property/);
  assert.match(shell, /AAIQ Apps/);
  assert.match(navigation, /href:\s*"\/housekeeping",\s*label:\s*"AAIQ Housekeeping"/);
  assert.match(navigation, /href:\s*"\/maintenance",\s*label:\s*"AAIQ Maintenance"/);
  assert.match(route, /SWITCH_PROPERTY/);
  assert.match(route, /aaiq_active_property/);
  assert.match(service, /switchPropertyContext/);
  assert.match(service, /user\.property_context\.changed/);
  assert.match(schema, /userContextPreferences/);
  assert.match(migration, /user_context_preferences/);
  assert.match(housekeeping, /HousekeepingDepartureClient/);
  assert.doesNotMatch(housekeeping, /PropertyOperationsClient/);
  assert.match(maintenance, /MaintenanceRepairClient/);
  assert.doesNotMatch(maintenance, /PropertyOperationsClient/);
  assert.match(compliance, /ComplianceInspectionClient/);
  assert.doesNotMatch(compliance, /PropertyOperationsClient/);
});

test("repairs canonical team operations, property-scoped inventory, and private website previews", async () => {
  const [teamPage, teamClient, inventoryRoute, inventoryDb, websiteDb, preview, migration] = await Promise.all([
    readFile(new URL("../app/property-operations/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/property-operations/team-operations-command-center.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/operations/intelligence/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/property-intelligence.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/website-factory.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/site-preview/[slug]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0022_website_property_inventory_scope.sql", import.meta.url), "utf8"),
  ]);
  assert.match(teamPage, /TeamOperationsCommandCenter/);
  assert.match(teamClient, /Manager command center/);
  assert.match(teamClient, /department-command-grid/);
  assert.match(inventoryRoute, /aaiq_active_property/);
  assert.match(inventoryDb, /Inventory access to the selected property is not permitted/);
  assert.match(inventoryDb, /property_id=\?/);
  assert.match(websiteDb, /CANONICAL_PROPERTY_RECONCILED/);
  assert.match(websiteDb, /websitePreview/);
  assert.match(preview, /Private draft preview/);
  assert.match(migration, /property_data_bindings/);
});

test("ships explicit property reconciliation and a professional approval-controlled website editor", async () => {
  const [service, route, client, migration, foundation, boundary] = await Promise.all([
    readFile(new URL("../db/website-factory.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/v1/website-factory/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/aaiq-website-factory/website-factory-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0023_property_reconciliation_scope.sql", import.meta.url), "utf8"),
    readFile(new URL("../migrations/baselines/release68_operational_work_orders.sql", import.meta.url), "utf8"),
    readFile(new URL("../docs/AAIQ_HNE_INTEGRATION_BOUNDARY.md", import.meta.url), "utf8"),
  ]);
  assert.match(service, /property_reconciliation_plans/);
  assert.match(service, /DRAFT_REVIEW/);
  assert.match(service, /DI-SALINA-SOUTH/);
  assert.match(service, /website_factory_revisions/);
  assert.match(route, /APPLY_RECONCILIATION_PLAN/);
  assert.match(client, /Digital presence command center/);
  assert.match(client, /Approve & reconcile/);
  assert.match(client, /Request approval/);
  assert.match(client, /Publication blocked/);
  assert.match(migration, /property_scope_migration_exceptions/);
  assert.match(foundation, /operational_work_orders \(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,property_id TEXT/);
  assert.match(boundary, /AAIQ does not silently redefine HNE states/);
});

test("embeds the real GrapesJS hospitality editor with governed persistence and sanitized publishing", async () => {
  const [pkg, editor, client, preview] = await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/aaiq-website-factory/grapes-hospitality-editor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/aaiq-website-factory/website-factory-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/site-preview/[slug]/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(pkg, /"grapesjs": "\^0\.23\.3"/);
  assert.match(editor, /grapesjs\.init/);
  assert.match(editor, /Booking bar/);
  assert.match(editor, /Amenity grid/);
  assert.match(client, /builderProjectData/);
  assert.match(preview, /safeBuilderHtml/);
  assert.match(preview, /javascript/);
});

test("adds a governed, property-scoped Agent Studio and maintenance briefing runtime", async () => {
  const [platform, runtime, route, client, navigation, pkg] = await Promise.all([
    readFile(new URL("../db/agent-platform.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/server/agents/maintenance-briefing-agent.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/v1/agent-studio/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/aaiq-agent-studio/agent-studio-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/aaiq-capabilities.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  for (const table of ["ai_agent_runs", "ai_agent_tool_calls",
    "ai_approval_cases", "ai_manual_fallback_cases"]) assert.match(platform, new RegExp(table));
  assert.match(platform, /ai_runtime_agent_registry/);
  assert.match(platform, /user_context_preferences/);
  assert.doesNotMatch(platform, /user_property_context/);
  assert.match(platform, /maintenance-dispatcher/);
  assert.match(platform, /property_id=\?/);
  assert.match(runtime, /new Agent/);
  assert.match(runtime, /modelProvider: new OpenAIProvider/);
  assert.match(runtime, /runner\.run\(agent/);
  assert.match(runtime, /read_maintenance_work/);
  assert.match(runtime, /read_compliance_due/);
  assert.match(runtime, /read_asset_context/);
  assert.match(runtime, /outputType: briefingSchema/);
  assert.match(runtime, /INTEGRATION_UNAVAILABLE/);
  assert.match(route, /RUN_MAINTENANCE_BRIEFING/);
  assert.match(client, /Maintenance Briefing Agent/);
  assert.match(client, /Automation exception queue/);
  assert.match(navigation, /Digital Employees/);
  assert.equal(JSON.parse(pkg).dependencies["@openai/agents"], "^0.13.5");
});

test("renders one canonical shell and a usage-ranked module launcher", async () => {
  const [layout, vault, launcher, navigation] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/aaiq-document-vault/document-vault-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/smart-quick-links.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/aaiq-capabilities.ts", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /<AaiqAppShell>/);
  assert.doesNotMatch(vault, /AaiqAppShell/);
  assert.match(launcher, /api\/v1\/command-center/);
  assert.match(launcher, /action:"VISIT"/);
  assert.doesNotMatch(launcher, /localStorage/);
  assert.match(launcher, /View all modules/);
  assert.match(launcher, /item\.label/);
  assert.match(navigation, /label: "AAIQ Digital Employees"/);
});

test("enforces audited geofence and IP policy with an administrator bypass", async () => {
  const [boundary, route, middleware, admin, migration] = await Promise.all([
    readFile(new URL("../db/access-boundary.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/v1/access-boundary/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../proxy.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/aaiq-security/security-boundary-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0024_access_ai_integrations.sql", import.meta.url), "utf8"),
  ]);
  assert.match(boundary, /property_access_policies/);
  assert.match(boundary, /access_boundary_events/);
  assert.match(boundary, /ADMIN_BYPASS/);
  assert.match(boundary, /ipInCidr/);
  assert.match(boundary, /distanceMeters/);
  assert.match(route, /HttpOnly; Secure; SameSite=Strict/);
  assert.match(middleware, /ACCESS_BOUNDARY_REQUIRED/);
  assert.match(middleware, /staff\.role === "admin"/);
  assert.match(admin, /Location & Network Security/);
  assert.match(migration, /trusted_ipv4_cidrs_json/);
});

test("ships governed LangGraph, Qdrant, Postiz, Superset, and Chatwoot adapters", async () => {
  const [service, runtime, route, client, pkg, migration] = await Promise.all([
    readFile(new URL("../db/open-source-integrations.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/server/integrations/governed-open-source.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/v1/integration-center/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/aaiq-integration-center/integration-center-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0024_access_ai_integrations.sql", import.meta.url), "utf8"),
  ]);
  for (const provider of ["OPENAI_AGENTS", "LANGGRAPH", "QDRANT", "POSTIZ", "SUPERSET", "CHATWOOT", "META_CAPI"]) {
    assert.match(service, new RegExp(provider));
  }
  assert.match(runtime, /new StateGraph/);
  assert.match(runtime, /new QdrantClient/);
  assert.match(runtime, /text-embedding-3-small/);
  assert.match(runtime, /https:\/\/api\.app\.preset\.io\/v1\/auth\//);
  assert.match(runtime, /body\.payload\?\.access_token/);
  assert.match(service, /SUPERSET_API_TOKEN/);
  assert.match(client, /Send safe Meta diagnostic/);
  assert.match(service, /SUPERSET_API_SECRET/);
  assert.match(service, /SITES_SECRET_VAULT/);
  assert.match(runtime, /process\.env\.SUPERSET_BASE_URL/);
  assert.match(client, /Preset API token name/);
  assert.match(client, /Preset API secret/);
  assert.match(runtime, /\/posts/);
  assert.match(route, /APPROVE_SOCIAL_DRAFT/);
  assert.match(client, /Governed Integration Center/);
  assert.match(client, /CONFIGURATION REQUIRED/);
  assert.match(client, /Platform connection registry/);
  for (const platform of ["Facebook Pages", "Instagram Business", "TikTok", "YouTube", "Google Business Profile", "Tripadvisor", "Google Ads & Customer Match"]) {
    assert.match(service, new RegExp(platform.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(runtime, /READY_FOR_TEST_EVENT/);
  assert.match(runtime, /AAIQIntegrationVerification/);
  assert.match(runtime, /test_event_code/);
  assert.match(route, /META_CAPI_TEST_EVENT/);
  assert.match(client, /Meta Test Event Code/);
  assert.match(client, /Send safe Meta diagnostic/);
  const dependencies = JSON.parse(pkg).dependencies;
  assert.equal(dependencies["@langchain/langgraph"], "^1.4.8");
  assert.equal(dependencies["@qdrant/js-client-rest"], "^1.18.0");
  assert.match(migration, /organizational_memory_records/);
});

test("ships a property-scoped native communication center with governed manual fallback", async () => {
  const [service, route, client, navigation, schema] = await Promise.all([
    readFile(new URL("../db/communication-center.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/v1/communication-center/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/aaiq-communication-center/communication-center-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/aaiq-capabilities.ts", import.meta.url), "utf8"),
    readFile(new URL("../migrations/0049_master_inbox_schema_governance.sql", import.meta.url), "utf8"),
  ]);
  assert.match(service, /communication_threads/);
  assert.doesNotMatch(service, /CREATE TABLE|CREATE INDEX|ALTER TABLE|DROP TABLE/i);
  assert.match(schema, /organization_id TEXT NOT NULL,\s*property_id TEXT NOT NULL/);
  assert.match(service, /communication_reply_drafts/);
  assert.match(service, /COMMUNICATION_RECEIVED/);
  assert.match(service, /APPROVED_MANUAL_SEND/);
  assert.match(route, /CREATE_INTAKE/);
  assert.match(route, /CREATE_REPLY_DRAFT/);
  assert.match(route, /APPROVE_REPLY_DRAFT/);
  assert.match(client, /AAIQ NATIVE COMMUNICATIONS/);
  assert.match(client, /Nothing is sent automatically/);
  assert.match(client, /MANUAL FALLBACK/);
  assert.match(navigation, /Master Inbox/);
});

test("ships property configuration and a truthful persisted verification center", async () => {
  const [navigation, setupDb, assetDb, qaDb, qaRoute, qaClient] = await Promise.all([
    readFile(new URL("../lib/aaiq-capabilities.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/setup-agent.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/property-assets.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/quality-center.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/v1/quality-center/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/aaiq-quality-center/quality-center-client.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(navigation, /Autonomous Configuration/);
  assert.match(navigation, /Truth & Verification Center/);
  assert.match(setupDb, /createPropertyContext/);
  assert.match(assetDb, /property_id/);
  assert.match(qaDb, /autonomous_qa_runs/);
  assert.match(qaDb, /autonomous_qa_checks/);
  assert.match(qaRoute, /const ROUTES=/);
  assert.match(qaClient, /STRUCTURAL CHECKS — NOT FUNCTIONAL PROOF/);
  assert.match(qaClient, /Stored seven-question verification runs/);
  assert.doesNotMatch(qaClient, /RELEASE SCORE/);
});

test("routes approved Gmail scans into the native communication center without duplicates", async () => {
  const [scan, center] = await Promise.all([
    readFile(new URL("../app/api/google/accounts/[id]/scan/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/communication-center.ts", import.meta.url), "utf8"),
  ]);
  assert.match(scan, /createCommunicationIntake/);
  assert.match(scan, /communicationsCreated/);
  assert.match(center, /googleAccounts/);
  assert.match(center, /duplicate: true/);
  assert.match(center, /status='CONNECTED'/);
});

test("restores the property-scoped AAIQ Workforce kiosk with secure punch lifecycle", async () => {
  const [service, route, client, navigation, migration] = await Promise.all([
    readFile(new URL("../db/workforce-kiosk.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/v1/workforce/kiosk/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/workforce-time-clock/time-clock-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/aaiq-capabilities.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0025_workforce_kiosk.sql", import.meta.url), "utf8"),
  ]);
  assert.match(navigation, /Workforce & Time Clock/);
  assert.match(client, /Tap your name/);
  assert.match(client, /CLOCK_IN/);
  assert.match(client, /START_BREAK/);
  assert.match(client, /CLOCK_OUT/);
  assert.match(service, /PBKDF2/);
  assert.match(service, /120_000/);
  assert.match(service, /locked_until/);
  assert.match(service, /property_id/);
  assert.match(service, /TIME_ENTRY_OPENED/);
  assert.match(service, /TIME_ENTRY_CLOSED/);
  assert.match(route, /requestClientIp/);
  assert.match(route, /allowedActions/);
  assert.match(migration, /time_clock_credentials/);
  assert.match(migration, /time_breaks/);
});

test("ships a same-source master inbox with named channels, delivery audit, and OTA coverage", async () => {
  const [service, route, client, migration] = await Promise.all([
    readFile(new URL("../db/communication-center.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/v1/communication-center/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/aaiq-communication-center/communication-center-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0026_master_inbox_digital_workforce.sql", import.meta.url), "utf8"),
  ]);
  assert.match(client, /AAIQ MASTER INBOX/);
  assert.match(client, /same-source/i);
  assert.match(service, /communication_delivery_attempts/);
  assert.match(service, /sendApprovedReply/);
  assert.match(service, /renameCommunicationSource/);
  assert.match(service, /GOOGLE_REVIEWS/);
  assert.match(service, /TRIPADVISOR/);
  assert.match(service, /BOOKING_COM/);
  assert.match(service, /EXPEDIA/);
  assert.match(route, /SEND_APPROVED_REPLY/);
  assert.match(route, /RENAME_SOURCE/);
  assert.match(migration, /communication_delivery_attempts/);
});

test("ships six governed digital employees with thresholds, approvals, and executive action feed", async () => {
  const [service, route, client, migration] = await Promise.all([
    readFile(new URL("../db/agent-platform.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/v1/agent-studio/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/aaiq-agent-studio/agent-studio-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0026_master_inbox_digital_workforce.sql", import.meta.url), "utf8"),
  ]);
  for (const role of [
    "Digital General Manager",
    "Digital Assistant General Manager",
    "Digital Front Desk Agent",
    "Digital F&B & Inventory Director",
    "Digital Maintenance & Engineering Supervisor",
    "Digital Revenue & Pricing Manager",
  ]) assert.match(service, new RegExp(role.replace(/[&]/g, "\\&")));
  assert.match(service, /digital_employee_policies/);
  assert.match(service, /ai_agent_action_log/);
  assert.match(route, /UPDATE_POLICY/);
  assert.match(route, /DECIDE_APPROVAL/);
  assert.match(client, /Action required/i);
  assert.match(client, /Executive feed/i);
  assert.match(migration, /digital_employee_policies/);
  assert.match(migration, /ai_agent_action_log/);
  assert.match(service, /digital_system_capabilities/);
  assert.match(service, /digital_employee_handoffs/);
  assert.match(service, /teachSystemCapability/);
  assert.match(service, /decideSystemCapability/);
  assert.match(service, /executeSystemNeutralTask/);
  assert.match(route, /TEACH_SYSTEM_CAPABILITY/);
  assert.match(route, /DECIDE_SYSTEM_CAPABILITY/);
  assert.match(route, /RUN_SYSTEM_TASK/);
  assert.match(client, /Teach any PMS, POS, accounting, or banking workflow/);
  assert.match(client, /Physical human handoffs/);
});

test("ships a governed end-to-end video intelligence operations module", async () => {
  const [service, route, client, navigation, foundationMigration, operationsMigration, qa] = await Promise.all([
    readFile(new URL("../db/video-intelligence.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/v1/video-intelligence/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/aaiq-video-intelligence/video-intelligence-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/aaiq-capabilities.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0027_video_intelligence_foundation.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0029_video_intelligence_operations.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/api/v1/quality-center/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(navigation, /Video Intelligence/);
  assert.match(qa, /VIDEO_INTELLIGENCE/);
  assert.match(client, /GOVERNED MULTIMODAL OPERATIONS/);
  assert.match(client, /No accusation, enforcement/);
  assert.match(client, /EXPRESS CHECK-IN/);
  assert.match(client, /ACTION APPROVALS/);
  assert.match(client, /EVIDENCE REVIEW/);
  assert.match(client, /RULES & PROVIDERS/);
  assert.match(client, /INVENTORY VISION/);
  assert.match(client, /EMPLOYEE VERIFICATION/);
  assert.match(client, /EVIDENCE & RETENTION/);
  assert.match(client, /Purpose → audit → evidence → decision → work/);
  assert.match(service, /PENDING_PRIVACY_REVIEW/);
  assert.match(service, /CONSENTED_ONE_TO_ONE_ONLY/);
  assert.match(service, /FRONT_DESK_ASSISTED/);
  assert.match(service, /noPmsWrite:true/);
  assert.match(service, /video_evidence_checks/);
  assert.match(service, /video_action_proposals/);
  assert.match(service, /video_analysis_rules/);
  assert.match(service, /decideVideoProposal/);
  assert.match(service, /configureVideoProvider/);
  assert.match(service, /video_inventory_observations/);
  assert.match(service, /video_edge_nodes/);
  assert.match(service, /identity_verification_cases/);
  assert.match(service, /express_checkin_steps/);
  assert.match(service, /ONE_TO_ONE_BIOMETRIC/);
  assert.match(service, /LEGAL_HOLD_APPLIED/);
  assert.match(service, /A matching observation already exists/);
  assert.match(route, /audioProcessing:"disabled"/);
  assert.match(route, /100\*1024\*1024/);
  assert.match(route, /DECIDE_PROPOSAL/);
  assert.match(route, /CONFIGURE_PROVIDER/);
  assert.match(route, /CREATE_INVENTORY_OBSERVATION/);
  assert.match(route, /CREATE_IDENTITY_VERIFICATION/);
  assert.match(route, /APPLY_EVIDENCE_HOLD/);
  assert.match(foundationMigration, /video_camera_registry/);
  assert.match(foundationMigration, /express_checkin_sessions/);
  assert.match(foundationMigration, /video_provider_adapters/);
  assert.match(operationsMigration, /video_job_events/);
  assert.match(operationsMigration, /video_evidence_checks/);
  assert.match(operationsMigration, /video_action_proposals/);
  assert.match(operationsMigration, /video_analysis_rules/);
  const enterpriseMigration = await readFile(new URL("../migrations/0030_video_intelligence_enterprise.sql", import.meta.url), "utf8");
  assert.match(enterpriseMigration, /video_inventory_observations/);
  assert.match(enterpriseMigration, /identity_verification_cases/);
  assert.match(enterpriseMigration, /express_checkin_steps/);
  assert.match(enterpriseMigration, /video_evidence_objects/);
});

test("ships one canonical property-scoped intelligent document vault with custody and lifecycle controls", async () => {
  const [service, route, download, client, navigation, migration] = await Promise.all([
    readFile(new URL("../db/document-vault.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/v1/document-vault/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/v1/document-vault/[id]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/aaiq-document-vault/document-vault-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/aaiq-capabilities.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0028_intelligent_document_vault.sql", import.meta.url), "utf8"),
  ]);
  assert.match(navigation, /Document Vault/);
  assert.match(client, /AAIQ Intelligent Document Vault/);
  assert.match(client, /exact original/i);
  assert.match(client, /RETENTION & HOLDS/);
  assert.match(client, /AUDIT & JOBS/);
  assert.match(service, /QUARANTINED_PENDING_SCAN/);
  assert.match(service, /SHA-256/);
  assert.match(service, /document_ai_decisions/);
  assert.match(service, /document_legal_holds/);
  assert.match(service, /document_access_events/);
  assert.match(service, /property_id=\\?/);
  assert.match(service, /exact original already exists/i);
  assert.match(route, /RECORD_SCAN/);
  assert.match(route, /REVIEW_CLASSIFICATION/);
  assert.match(route, /PLACE_HOLD/);
  assert.match(download, /downloadableDocument/);
  assert.match(download, /content-disposition/i);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS document_blob_hash_idx/);
  assert.match(migration, /document_retention_policies/);
});
