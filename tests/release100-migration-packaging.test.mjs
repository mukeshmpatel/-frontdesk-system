import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const plugin=readFileSync(new URL("../build/sites-vite-plugin.ts",import.meta.url),"utf8");
const shell=readFileSync(new URL("../app/components/aaiq-app-shell.tsx",import.meta.url),"utf8");

test("all numbered release migrations are packaged for Sites D1 deployment",()=>{
  assert.match(plugin,/additionalMigrations/);
  assert.match(plugin,/copyFile/);
  for(const name of ["readdir(additionalMigrations)","resolve(outputDirectory, \"drizzle\")"])assert.ok(plugin.includes(name),name);
});

test("clean header does not depend on a second raster logo request",()=>{
  const start=shell.indexOf('className="aaiq-social-card-strip"'),strip=shell.slice(start,shell.indexOf("</Link>",start));
  assert.ok(!strip.includes("<Image"));
  assert.match(strip,/aria-hidden="true">AA<\/i>/);
});
