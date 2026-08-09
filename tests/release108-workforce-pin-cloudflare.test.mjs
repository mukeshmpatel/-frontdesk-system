import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read=path=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("Cloudflare-compatible PIN hashing never exceeds the runtime PBKDF2 ceiling",async()=>{
  const service=await read("db/workforce-kiosk.ts");
  assert.match(service,/CURRENT_PIN_ITERATIONS = 100_000/);
  assert.match(service,/iterations > CURRENT_PIN_ITERATIONS/);
  assert.doesNotMatch(service,/iterations: 120_000/);
});

test("PIN policy is migration-owned and legacy credentials fail closed",async()=>{
  const [migration,service]=await Promise.all([
    read("migrations/0060_workforce_pin_kdf_compatibility.sql"),
    read("db/workforce-kiosk.ts"),
  ]);
  assert.match(migration,/pin_iterations INTEGER NOT NULL DEFAULT 120000/);
  assert.match(service,/older security policy\. Reset the PIN/);
  assert.match(service,/pin_iterations=excluded\.pin_iterations/);
});
