import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";

test("Release 125 keeps the Vite source plugin required by Windows deployment", async () => {
  await access(new URL("../build/sites-vite-plugin.ts", import.meta.url));
  const [vite, deploy] = await Promise.all([
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../deployment/Deploy-AAIQ-Pilot.ps1", import.meta.url), "utf8"),
  ]);
  assert.match(vite, /\.\/build\/sites-vite-plugin/);
  assert.match(deploy, /Test-Path \"\$ProjectRoot\/build\/sites-vite-plugin\.ts\"/);
  assert.match(deploy, /before deploying/);
});
