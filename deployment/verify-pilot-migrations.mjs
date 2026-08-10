import {DatabaseSync} from "node:sqlite";
import {readFileSync,readdirSync} from "node:fs";
import {join} from "node:path";

const directory="deployment/pilot-migrations";
const files=readdirSync(directory).filter(name=>name.endsWith(".sql")).sort();
const database=new DatabaseSync(":memory:");
for(const name of files){
  database.exec(readFileSync(join(directory,name),"utf8").replaceAll("--> statement-breakpoint",";"));
}
const required=["property_contexts","staff_members","pilot_rollout_profiles","eval_cases","autonomy_config"];
for(const table of required){
  const found=database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
  if(!found)throw new Error(`Pilot migration package did not create ${table}.`);
}
console.log(JSON.stringify({status:"PASS",migrations:files.length,requiredTables:required}));
