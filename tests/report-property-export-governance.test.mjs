import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {DatabaseSync} from "node:sqlite";

const read=path=>readFile(new URL(path,import.meta.url),"utf8");

test("report reads and exports are server-governed and property scoped",async()=>{
 const[layer,route,client]=await Promise.all([read("../db/reporting-layer.ts"),read("../app/api/v1/reports/exports/route.ts"),read("../app/reports/pms-reporting-center.tsx")]);
 assert.match(layer,/property_id=\?/);
 assert.match(layer,/compileGovernedReportExport/);
 assert.match(layer,/crypto\.subtle\.digest\("SHA-256"/);
 assert.match(layer,/content_sha256/);
 assert.match(route,/new Response\(result\.content/);
 assert.doesNotMatch(route,/rowCount\s*\?\?/);
 assert.doesNotMatch(client,/new Blob\(\[csv\]/);
 assert.match(client,/await response\.blob\(\)/);
});

test("report governance migration preserves rows and assigns a canonical property",async()=>{
 const migration=await read("../migrations/0047_governed_report_property_exports.sql"),db=new DatabaseSync(":memory:");
 db.exec(`CREATE TABLE property_contexts(id TEXT,organization_id TEXT,code TEXT,created_at TEXT);CREATE TABLE report_facts(id TEXT,organization_id TEXT,property_id TEXT,fact_type TEXT,occurred_at TEXT);CREATE TABLE report_events(id TEXT,organization_id TEXT,property_id TEXT);CREATE TABLE report_export_audit(id TEXT,organization_id TEXT,property_id TEXT NOT NULL DEFAULT '',user_email TEXT,report_id TEXT,format TEXT,filters_json TEXT,row_count INTEGER,content_sha256 TEXT NOT NULL DEFAULT '',content_length INTEGER NOT NULL DEFAULT 0,exported_at TEXT);INSERT INTO property_contexts VALUES('wg','org','WG-SALINA','2026-01-01');INSERT INTO report_facts VALUES('f','org','primary','incident','2026-01-02');INSERT INTO report_events VALUES('e','org','primary');`);
 db.exec(migration);
 assert.equal(db.prepare("SELECT property_id FROM report_facts WHERE id='f'").get().property_id,"wg");
 assert.equal(db.prepare("SELECT property_id FROM report_events WHERE id='e'").get().property_id,"wg");
 const columns=db.prepare("PRAGMA table_info(report_export_audit)").all().map(row=>row.name);assert.ok(columns.includes("content_sha256"));assert.ok(columns.includes("content_length"));
});
