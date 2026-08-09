import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const root=new URL("../",import.meta.url);
const read=path=>readFile(new URL(path,root),"utf8");

test("technology QA covers the complete control plane",async()=>{
 const route=await read("app/api/v1/quality-center/route.ts");
 for(const marker of ["Autonomous configuration","Governed integrations","User and access control","Security and audit","Technology federation","Digital Employee control","Video intelligence"])
  assert.match(route,new RegExp(marker,"i"));
 assert.match(route,/hasMarker/);
 assert.match(route,/WARN/);
});

test("technology connector workflows and audit proof are explicit",async()=>{
 const service=await read("db/quality-center.ts");
 for(const provider of ["UNIFI","GDMS","LOREX"])assert.match(service,new RegExp(`\\"${provider}\\"`));
 assert.match(service,/inventory → health → governed action/);
 assert.match(service,/system_audit_trail/);
});
