import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const shell = readFileSync(new URL("../app/components/aaiq-app-shell.tsx", import.meta.url), "utf8");
const today = readFileSync(new URL("../app/daymark-client.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("social card is permanently placed before property information", () => {
  const socialCard = shell.indexOf('className="aaiq-social-card-strip"');
  const propertyContext = shell.indexOf('className="shell-property-context"');
  assert.ok(socialCard >= 0, "compact social card must exist in the shared shell");
  assert.ok(propertyContext > socialCard, "social card must render above property information");
  assert.match(css, /\.aaiq-social-card-strip\{position:sticky;top:0;/);
});

test("social card stays below one CSS inch and is not duplicated in Today", () => {
  assert.match(css, /\.aaiq-social-card-strip\{[^}]*height:72px;max-height:72px;/);
  assert.ok(!today.includes('className="brand-hero"'), "Today must not render the old oversized duplicate");
});
