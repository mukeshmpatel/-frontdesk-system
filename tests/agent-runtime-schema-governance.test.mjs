import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {DatabaseSync} from "node:sqlite";

const read=path=>readFile(new URL(path,import.meta.url),"utf8");

test("Agent Studio never mutates schema during a request",async()=>{
 const service=await read("../db/agent-platform.ts");
 assert.doesNotMatch(service,/CREATE TABLE|CREATE INDEX|ALTER TABLE|DROP TABLE/i);
 assert.match(service,/export async function ensureAgentPlatform\(\) \{\s*database\(\);/);
});

test("Agent Studio migration owns every runtime table and preserves existing data",async()=>{
 const sql=await read("../migrations/0048_agent_runtime_schema_governance.sql"),db=new DatabaseSync(":memory:");db.exec(sql);
 const required=["ai_runtime_agent_registry","ai_agent_runs","ai_agent_tool_calls","ai_approval_cases","ai_manual_fallback_cases","digital_employee_policies","ai_agent_action_log","digital_system_capabilities","digital_employee_handoffs"];
 const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row=>row.name);for(const name of required)assert.ok(tables.includes(name),`${name} missing`);
 db.prepare("INSERT INTO ai_runtime_agent_registry(id,organization_id,agent_key,name,purpose,department,risk_level,permitted_tools_json,prohibited_actions_json,model,prompt_version,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run("a","o","front-desk","Front Desk","Help","FRONT_DESK","MEDIUM","[]","[]","model","v1","ACTIVE","now","now");
 db.exec(sql);assert.equal(db.prepare("SELECT count(*) count FROM ai_runtime_agent_registry").get().count,1);
});
