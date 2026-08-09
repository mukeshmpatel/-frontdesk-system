import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const db=new DatabaseSync(":memory:");
const baseline="migrations/baselines/release68_operational_work_orders.sql";
db.exec(readFileSync(baseline,"utf8"));
db.exec(`INSERT INTO operational_work_orders(id,organization_id,department,work_type,title,description,status,progress,priority,created_by,created_at,updated_at) VALUES('release68-preservation','release68-org','MAINTENANCE','REPAIR','Preserve me','Populated baseline','OPEN',0,'HIGH','migration-test','2026-01-01','2026-01-01')`);
const files=[...readdirSync("drizzle").filter(x=>x.endsWith(".sql")).sort().map(x=>join("drizzle",x)),...readdirSync("migrations").filter(x=>/^\d+.*\.sql$/.test(x)).sort().map(x=>join("migrations",x))];
const created=new Set(["operational_work_orders","work_order_attachments","maintenance_compliance_templates","supply_inventory","work_order_steps","night_room_report_imports","work_evidence_reviews"]);
for(const file of files){const sql=readFileSync(file,"utf8");for(const m of sql.matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+[`"[]?([a-zA-Z0-9_]+)/gi))created.add(m[1].toLowerCase());for(const m of sql.matchAll(/ALTER TABLE\s+[`"[]?([a-zA-Z0-9_]+)/gi)){const table=m[1].toLowerCase();if(!created.has(table))throw new Error(`${file} references ${table} before a verified prior definition`);}db.exec(sql.replaceAll("--> statement-breakpoint",";"));}
const preserved=db.prepare("SELECT id,asset_id FROM operational_work_orders WHERE id='release68-preservation'").get();if(!preserved)throw new Error("Populated Release 68 work order was not preserved.");
console.log(JSON.stringify({baseline,sourceCommit:"d048dbf",migrationsApplied:files.length,preservedRecord:preserved.id}));
