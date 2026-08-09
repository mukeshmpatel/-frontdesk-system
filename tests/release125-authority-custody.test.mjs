import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("Release 125 authority and signal migrations are additive, replayable and reversible", async () => {
  const [migration, rollback] = await Promise.all([
    read("../migrations/0071_digital_employee_authority_signal_bus.sql"),
    read("../migrations/rollbacks/0071_digital_employee_authority_signal_bus_rollback.sql"),
  ]);
  const db = new DatabaseSync(":memory:");
  db.exec(migration);
  db.exec(migration);
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='digital_employee_authority_definitions'").get());
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='external_signal_events'").get());
  assert.throws(() => db.prepare(`INSERT INTO digital_employee_authority_definitions(id,organization_id,role_key,capability_key,description,autonomy_level,reversible,created_at,updated_at) VALUES('1','o','r','c','unsafe','AUTONOMOUS',0,'n','n')`).run());
  assert.match(rollback, /DROP TABLE IF EXISTS external_signal_events/);
});

test("Digital Employee authority is admin-governed, audited and never invents missing signals", async () => {
  const [service, api, ui, uat] = await Promise.all([
    read("../db/digital-employee-authority.ts"),
    read("../app/api/v1/signal-bus/route.ts"),
    read("../app/aaiq-agent-studio/agent-studio-client.tsx"),
    read("../lib/uat-authorization.mjs"),
  ]);
  assert.match(service, /Irreversible actions can never be autonomous/);
  assert.match(service, /UNAVAILABLE/);
  assert.match(service, /SYNTHETIC UAT — NOT LIVE/);
  assert.match(service, /recordSystemAudit/);
  assert.match(api, /hasModuleAccess\(u\.email,"AAIQ_AGENT_STUDIO"\)/);
  assert.match(ui, /What each Digital Employee can and cannot do/);
  assert.match(ui, /Signal health and truthful freshness/);
  assert.match(uat, /SAVE_AUTHORITY/);
});

test("Release 125 cash custody migration extends the preserved schema safely", async () => {
  const [base, extension, rollback] = await Promise.all([
    read("../migrations/0064_cash_check_custody.sql"),
    read("../migrations/0072_cash_check_custody_workflow.sql"),
    read("../migrations/rollbacks/0072_cash_check_custody_workflow_rollback.sql"),
  ]);
  const db = new DatabaseSync(":memory:");
  db.exec(base);
  db.exec(extension);
  db.exec(extension);
  for (const name of ["shift_cash_expected_evidence", "shift_drop_custody_receipts", "shift_manager_recount_denominations"])
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name));
  assert.match(rollback, /shift_cash_expected_evidence/);
});

test("Cash and check custody is property scoped, dual-control and never posts accounting", async () => {
  const [registry, service, api, ui] = await Promise.all([
    read("../lib/aaiq-capabilities.ts"),
    read("../db/cash-check-custody.ts"),
    read("../app/api/v1/cash-custody/route.ts"),
    read("../app/aaiq-cash-custody/cash-custody-client.tsx"),
  ]);
  assert.match(registry, /AAIQ_CASH_CUSTODY/);
  assert.match(service, /organization_id=\? AND property_id=\?/);
  assert.match(service, /Only your open shift drop can be changed/);
  assert.match(service, /\["MANAGER","CORPORATE"\]/);
  assert.match(service, /AUTHORIZED_MANAGER_REQUIRED/);
  assert.match(service, /Employees cannot verify their own submitted cash drop/);
  assert.match(service, /A factual resolution is required/);
  assert.match(service, /not a public URL/);
  assert.match(service, /accountingPosting:"DISABLED"/);
  assert.match(service, /recordSystemAudit/);
  assert.match(api, /hasModuleAccess\(u\.email,"AAIQ_CASH_CUSTODY"\)/);
  assert.match(ui, /Count bills and coins/);
  assert.match(ui, /independent manager recount/i);
  assert.match(ui, /Reports & audit/);
  assert.match(ui, /Detailed help/);
});
