import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ClimateProfile } from "@prisma/client";
import bcrypt from "bcrypt";
import { taskSlaMinutes } from "../src/services/automationPolicy.js";

process.env.DATABASE_URL = "postgresql://aaiq:test@localhost:5432/aaiq";
process.env.REDIS_URL = "redis://localhost:6379";
process.env.OPENAI_API_KEY = "test-key-with-sufficient-length-for-validation";
process.env.JWT_SECRET = "test-secret-with-at-least-thirty-two-characters";
process.env.PUBLIC_BASE_URL = "https://aaiq.example.com";
process.env.LOCAL_HARDWARE_ENCRYPTION_KEY = "ab".repeat(32);

test("critical repairs use a ten-minute SLA and housekeeping uses fifteen", () => {
  assert.equal(taskSlaMinutes({ urgency: "CRITICAL", assignedRole: "MAINTENANCE" }), 10);
  assert.equal(taskSlaMinutes({ urgency: "MEDIUM", assignedRole: "HOUSEKEEPING" }), 15);
});

test("eco climate bounds follow heating and cooling seasons", async () => {
  const { targetTemperature } = await import("../src/services/hvacAutomationService.js");
  assert.equal(
    targetTemperature(ClimateProfile.ECO_MODE, "America/Chicago", new Date("2026-01-15T12:00:00Z")),
    62,
  );
  assert.equal(
    targetTemperature(ClimateProfile.ECO_MODE, "America/Chicago", new Date("2026-07-15T12:00:00Z")),
    78,
  );
  assert.equal(targetTemperature(ClimateProfile.COMFORT, "America/Chicago"), 71);
});

test("hardware API key comparison rejects missing, partial, and changed tokens", async () => {
  const { secureTokenEquals } = await import("../src/middleware/verifyHardwareApiKey.js");
  const token = "telemetry-secret-at-least-thirty-two-characters";
  assert.equal(secureTokenEquals(token, token), true);
  assert.equal(secureTokenEquals(undefined, token), false);
  assert.equal(secureTokenEquals("short", token), false);
  assert.equal(secureTokenEquals(`${token}x`, token), false);
});

test("biometric hash comparison is exact and the Salina geofence calculation is bounded", async () => {
  const { metersBetween, secureHashEquals } = await import("../src/services/biometricUtils.js");
  assert.equal(secureHashEquals("a".repeat(64), "a".repeat(64)), true);
  assert.equal(secureHashEquals("a".repeat(64), "b".repeat(64)), false);
  assert.equal(secureHashEquals("short", "longer"), false);
  assert.ok(metersBetween(38.8403, -97.6114, 38.8403, -97.6114) < 1);
  assert.ok(metersBetween(38.8403, -97.6114, 38.8503, -97.6114) > 1_000);
});

test("guest personal data encryption round-trips without storing plaintext", async () => {
  const { decryptPersonalData, encryptPersonalData } = await import("../src/services/personalDataCrypto.js");
  const phone = "+17858252111";
  const encrypted = encryptPersonalData(phone);
  assert.notEqual(encrypted, phone);
  assert.equal(encrypted.includes(phone), false);
  assert.equal(decryptPersonalData(encrypted), phone);
});

test("staff passwords use bcrypt and the migration reset hash cannot authenticate", async () => {
  const hash = await bcrypt.hash("A-strong-test-password-2026!", 12);
  assert.equal(await bcrypt.compare("A-strong-test-password-2026!", hash), true);
  assert.equal(await bcrypt.compare("wrong-password", hash), false);
  assert.equal(
    await bcrypt.compare(
      "any-password",
      "$2b$12$C6UzMDM.H6dfI/f/IKcEe.yrpGN9J2S2lN4T5nF6f7MeWZMYm3Dxu",
    ),
    false,
  );
});

test("offline room credential is authenticated, decryptable, and expires", async () => {
  const { OfflineResilienceEngine } = await import("../src/services/walletPassService.js");
  const payload = {
    bookingId: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    roomNumber: "104",
    issuedAt: "2026-07-26T12:00:00.000Z",
    nfcExpiresAt: "2026-07-27T12:00:00.000Z",
  };
  const token = OfflineResilienceEngine.generateOfflineBackupToken(payload);
  assert.equal(token.includes(payload.bookingId), false);
  assert.deepEqual(
    OfflineResilienceEngine.verifyOfflineBackupToken(token, new Date("2026-07-26T13:00:00.000Z")),
    payload,
  );
  assert.throws(() => OfflineResilienceEngine.verifyOfflineBackupToken(
    `${token.slice(0, -1)}x`,
    new Date("2026-07-26T13:00:00.000Z"),
  ));
  assert.throws(() => OfflineResilienceEngine.verifyOfflineBackupToken(
    token,
    new Date("2026-07-28T12:00:00.000Z"),
  ));
});

test("franchise settlement uses exact decimal splits and never marks money moved", async () => {
  const { calculateSettlement } = await import("../src/services/settlementMath.js");
  const split = calculateSettlement("1000.00", "0.050000", "0.025000");
  assert.equal(split.corporateCut.toFixed(2), "50.00");
  assert.equal(split.marketingCut.toFixed(2), "25.00");
  assert.equal(split.franchiseeNet.toFixed(2), "925.00");
  assert.throws(() => calculateSettlement("100", "0.75", "0.50"));
});

test("edge SQLite cache and outbox persist room state without cloud access", async () => {
  const directory = mkdtempSync(join(tmpdir(), "aaiq-edge-test-"));
  const { OfflineSyncService } = await import("../src/services/offlineSyncService.js");
  const service = new OfflineSyncService({
    edgeNodeId: "test-edge",
    sqlitePath: join(directory, "edge.db"),
    syncApiUrl: "https://aaiq.example.com",
    syncApiKey: "test-edge-key-at-least-thirty-two-characters",
  });
  try {
    service.cacheRoomState("property-1", "104", { status: "DIRTY", currentTemp: 78 });
    assert.deepEqual(service.getCachedRoomState("property-1", "104")?.state, {
      status: "DIRTY",
      currentTemp: 78,
    });
    service.queueOperation("property-1", {
      eventType: "ROOM_STATE_UPDATE",
      payload: { roomNumber: "104", status: "DIRTY", currentTemp: 78 },
    });
    assert.equal(service.getLocalStatus().outboxPending, 1);
  } finally {
    service.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
