import test from"node:test";
import assert from"node:assert/strict";
import{readFile}from"node:fs/promises";
import{DatabaseSync}from"node:sqlite";

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("every pilot property receives one protected administrator and common baseline",async()=>{
 const [service,route]=await Promise.all([read("db/property-provisioning.ts"),read("app/api/v1/pilot-launch/route.ts")]);
 assert.match(service,/protected_property_administrators/);
 assert.match(service,/role_label='ADMINISTRATOR'/);
 assert.match(service,/SYSTEM_PROVISIONED_PROTECTED_ADMIN/);
 assert.match(service,/SYSTEM_PROVISIONED_REPORT_PROFILE/);
 assert.match(service,/SYSTEM_PROVISIONED_QUIET_HOURS/);
 assert.match(service,/SYSTEM_PROVISIONED_RETENTION/);
 assert.match(service,/EXCEPTION_ONLY_REMAINDER/);
 assert.match(route,/provisionCommonPilotOperations/);
});

test("a protected administrator cannot be deleted",async()=>{
 const database=new DatabaseSync(":memory:");
 database.exec(`CREATE TABLE staff_members(id TEXT PRIMARY KEY,organization_id TEXT,user_email TEXT);`);
 database.exec(await read("migrations/0061_property_provisioning_automation.sql"));
 database.prepare("INSERT INTO staff_members VALUES(?,?,?)").run("member","org","owner@example.com");
 database.prepare("INSERT INTO protected_property_administrators VALUES(?,?,?,?,?,'ACTIVE',?,?,?)").run("seat","org","property","owner@example.com","Owner","system","now","now");
 assert.throws(()=>database.prepare("DELETE FROM staff_members WHERE id='member'").run(),/cannot be deleted/);
 database.prepare("UPDATE staff_members SET user_email='new-owner@example.com' WHERE id='member'").run();
 assert.equal(database.prepare("SELECT user_email FROM staff_members WHERE id='member'").get().user_email,"new-owner@example.com");
});

test("automation preserves evidence-only gates",async()=>{
 const service=await read("db/property-provisioning.ts");
 for(const task of ["MFA","CLOCK_IN","REPRESENTATIVE_REPORTS","PARSER_REVIEW","PMS","COMMUNICATIONS","TECHNOLOGY","PAYMENTS","ESCALATION","ROLE_JOURNEYS","DENIALS","RECOVERY"])assert.match(service,new RegExp(`'${task}'`));
 assert.match(service,/financialAutonomy:false/);
 assert.match(service,/externalActionsEnabled:false/);
 const autoVerifiedBlock=service.slice(service.indexOf("const verified=["),service.indexOf("];",service.indexOf("const verified=["))+2);
 assert.doesNotMatch(autoVerifiedBlock,/MFA|CLOCK_IN|REPRESENTATIVE_REPORTS|PMS|PAYMENTS|ROLE_JOURNEYS/);
});
