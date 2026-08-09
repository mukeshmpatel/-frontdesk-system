import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {calculateTrustScore,demotedLevel,promotionEligibility,resolveAutonomy} from "../lib/progressive-autonomy-policy.mjs";

const read=path=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("Module 15 eval storage is property scoped and regression ready",async()=>{
  const sql=await read("migrations/0058_digital_employee_evals.sql");
  for(const table of ["eval_cases","eval_runs","shadow_audits"])assert.match(sql,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.match(sql,/organization_id TEXT NOT NULL/);
  assert.match(sql,/property_id TEXT NOT NULL/);
  assert.match(sql,/CRITICAL/);
  assert.match(sql,/run_batch_id/);
});

test("Module 16 schema makes permanent exclusions fail closed",async()=>{
  const sql=await read("migrations/0059_progressive_autonomy.sql");
  assert.match(sql,/CHECK\(\(permanent_exclusion=0\) OR \(autonomy_level='NONE' AND authority_ceiling IS NULL\)\)/);
  assert.match(sql,/autonomy_promotion_proposals/);
  assert.match(sql,/escalation_events/);
});

test("autonomy resolution denies excluded, assisted, over-ceiling, and low-confidence work",()=>{
  assert.equal(resolveAutonomy({permanentExclusion:true},{confidence:100}).execute,false);
  assert.equal(resolveAutonomy({autonomyLevel:"ASSISTED"},{confidence:100}).reason,"POLICY_REQUIRED");
  assert.equal(resolveAutonomy({autonomyLevel:"CEILING_BOUND",authorityCeiling:75},{amount:76}).reason,"CEILING_EXCEEDED");
  assert.equal(resolveAutonomy({autonomyLevel:"FULL",confidenceThreshold:95},{confidence:94}).reason,"LOW_CONFIDENCE");
  assert.equal(resolveAutonomy({autonomyLevel:"FULL",confidenceThreshold:95},{confidence:96}).execute,true);
});

test("promotion is proposed only after evidence and demotion is fail-safe",()=>{
  assert.deepEqual(promotionEligibility({level:"ASSISTED",samples:50,windowDays:30,trustScore:95,criticalFailures:0}),{eligible:true,proposedLevel:"CEILING_BOUND"});
  assert.equal(promotionEligibility({level:"ASSISTED",samples:50,windowDays:30,trustScore:99,criticalFailures:1}).eligible,false);
  assert.equal(demotedLevel("FULL"),"CEILING_BOUND");
  assert.equal(calculateTrustScore([{score:100},{score:90,critical:true}]),93.33);
});

