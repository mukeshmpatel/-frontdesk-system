import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("anomaly detection reuses the existing escalation trio, not a new alert table", async () => {
  const service = await read("db/anomaly-detection.ts");
  assert.match(service, /INSERT INTO notification_escalations/);
  assert.match(service, /INSERT INTO notification_outbox/);
  assert.match(service, /INSERT INTO staff_notifications/);
  assert.doesNotMatch(service, /CREATE TABLE/i);
});

test("cash variance anomaly compares against the property's own recent baseline, not a fixed threshold", async () => {
  const service = await read("db/anomaly-detection.ts");
  assert.match(service, /export async function runCashVarianceAnomalyEscalations/);
  assert.match(service, /ORDER BY business_date DESC LIMIT 8/);
  assert.match(service, /if \(rows\.length < 5\) continue;/);
  assert.match(service, /baselineAvgAbs \* 2\.5, 5000/);
});

test("cash variance anomaly is idempotent and does not duplicate the existing threshold escalation", async () => {
  const service = await read("db/anomaly-detection.ts");
  assert.match(service, /alreadyEscalated\(property\.organization_id, "CASH_VARIANCE_ANOMALY", latest\.id\)/);
  assert.match(service, /alreadyEscalated\(property\.organization_id, "CASH_RECONCILIATION", latest\.id\)/);
});

test("review sentiment anomaly requires enough reviews in both windows before firing", async () => {
  const service = await read("db/anomaly-detection.ts");
  assert.match(service, /export async function runReviewSentimentAnomalyEscalations/);
  assert.match(service, /if \(rows\.results\.length < 8\) continue;/);
  assert.match(service, /if \(baseline\.length < 5\) continue;/);
  assert.match(service, /recentRate - baselineRate >= 0\.4/);
});

test("review sentiment anomaly escalates at most once per property per day", async () => {
  const service = await read("db/anomaly-detection.ts");
  assert.match(service, /const sourceId = `\$\{property\.id\}:\$\{today\}`;/);
  assert.match(service, /alreadyEscalated\(property\.organization_id, "REVIEW_SENTIMENT_ANOMALY", sourceId\)/);
});

test("both anomaly checks are wired into the 15-minute cron alongside the other scheduled functions", async () => {
  const worker = await read("worker/index.ts");
  assert.match(worker, /import \{ runCashVarianceAnomalyEscalations, runReviewSentimentAnomalyEscalations \} from "\.\.\/db\/anomaly-detection"/);
  assert.match(worker, /runCashVarianceAnomalyEscalations\(\),/);
  assert.match(worker, /runReviewSentimentAnomalyEscalations\(\),/);
});

test("an anomaly escalation never writes to a reconciliation, review, or any other business record", async () => {
  const service = await read("db/anomaly-detection.ts");
  assert.doesNotMatch(service, /UPDATE daily_cash_reconciliation/);
  assert.doesNotMatch(service, /UPDATE guest_review_events/);
});
