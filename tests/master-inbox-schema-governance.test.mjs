import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {DatabaseSync} from "node:sqlite";
const read=path=>readFile(new URL(path,import.meta.url),"utf8");
test("Master Inbox never mutates schema during a request",async()=>{const service=await read("../db/communication-center.ts");assert.doesNotMatch(service,/CREATE TABLE|CREATE INDEX|ALTER TABLE|DROP TABLE/i);assert.match(service,/ensureCommunicationCenter\(\) \{\s*db\(\);/)});
test("Master Inbox migrations own all communication storage and are repeatable",async()=>{const certification=await read("../migrations/0036_master_inbox_certification.sql"),sql=await read("../migrations/0049_master_inbox_schema_governance.sql"),db=new DatabaseSync(":memory:");db.exec(certification);db.exec(sql);const required=["communication_sources","communication_threads","communication_messages","communication_reply_drafts","communication_status_history","communication_delivery_attempts","communication_governance_profiles","communication_delivery_events","communication_certification_runs"],tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row=>row.name);for(const name of required)assert.ok(tables.includes(name),`${name} missing`);db.exec(certification);db.exec(sql);assert.equal(required.filter(name=>tables.includes(name)).length,required.length)});
