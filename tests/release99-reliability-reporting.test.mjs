import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");
const shell=read("app/components/aaiq-app-shell.tsx"),pilot=read("app/aaiq-pilot-launch/pilot-launch-client.tsx");
const pilotApi=read("app/api/v1/pilot-launch/route.ts"),reports=read("app/reports/pms-reporting-center.tsx"),css=read("app/globals.css");

test("header uses a compact identity mark and clean text instead of a cropped social image",()=>{
  assert.match(shell,/aaiq-social-card-strip[\s\S]*aria-hidden="true">AA<\/i>/);
  assert.ok(!shell.includes('<Image src="/og-aaiq.png"'));
  assert.match(css,/\.aaiq-social-card-strip\{[^}]*height:72px;max-height:72px/);
});

test("Pilot Launch has timeout, readable error, and retry recovery",()=>{
  for(const value of ["AbortController","setTimeout","loadFailed","Try loading again"])assert.ok(pilot.includes(value),value);
  assert.match(pilotApi,/catch\(error\)/);
  assert.match(pilotApi,/status:503/);
});

test("report source drawer is always closable above the application shell",()=>{
  for(const value of ["source-record-overlay","aria-modal=\"true\"","aria-label=\"Close source record\"","Press Escape","Close detail"])assert.ok(reports.includes(value),value);
  assert.match(css,/\.source-record-overlay\{[^}]*z-index:1000/);
});

test("reporting includes enterprise levels and all operating departments",()=>{
  for(const value of ["Enterprise roll-up","Property","Department","Employee","Room / location","Front Desk & Guest Services","Housekeeping & Laundry","Restaurant & Bar","Banquets & Events","Sales & Revenue","Inventory & Procurement","Workforce & HR","Finance & Accounting","Security & Incidents","IT & Technology","Compliance & Brand Standards"])assert.ok(reports.includes(value),value);
});
