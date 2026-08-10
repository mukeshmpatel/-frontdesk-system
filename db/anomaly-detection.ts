/**
 * Proactive anomaly detection between the fixed 07:00 daily briefing window.
 *
 * Reuses the exact escalation pattern already proven by
 * runCashReconciliationEscalations (notification_escalations +
 * notification_outbox + staff_notifications) rather than inventing a new
 * alert surface — a new finding here shows up the same way an overdue task
 * or a cash-reconciliation escalation already does. This module only ever
 * writes an escalation and a notification; it never changes a reconciliation
 * record, a review, or takes any other action. It runs on the same 15-minute
 * cron as every other scheduled function in worker/index.ts, so an anomaly
 * can surface within 15 minutes of the data appearing instead of waiting for
 * the next scheduled briefing.
 */
import { env } from "cloudflare:workers";
import { namedManager } from "./cash-reconciliation";
import { recordSystemAudit } from "./platform-controls";

function db(): D1Database {
  if (!env.DB) throw new Error("Anomaly detection storage is unavailable.");
  return env.DB;
}

async function activeProperties() {
  const rows = await db().prepare(`SELECT p.id,p.organization_id,p.name FROM property_contexts p
    WHERE p.status='ACTIVE' ORDER BY p.name LIMIT 50`).all<{ id: string; organization_id: string; name: string }>();
  return rows.results;
}

async function alreadyEscalated(organizationId: string, sourceType: string, sourceId: string) {
  const row = await db().prepare(`SELECT id FROM notification_escalations
    WHERE organization_id=? AND source_type=? AND source_id=? LIMIT 1`)
    .bind(organizationId, sourceType, sourceId).first();
  return Boolean(row);
}

async function escalateAnomaly(input: {
  organizationId: string; propertyId: string; sourceType: string; sourceId: string;
  subject: string; body: string; auditEventType: string; auditDelta: Record<string, unknown>;
}) {
  const manager = await namedManager(input.organizationId, input.propertyId);
  if (!manager) return false;
  const now = new Date().toISOString();
  const escalationId = crypto.randomUUID();
  const outboxId = crypto.randomUUID();
  const recipient = manager.phone?.trim() || manager.user_email;
  const route = manager.phone?.trim() ? "SMS" : "IN_APP";
  await db().batch([
    db().prepare(`INSERT INTO notification_escalations
      (id,organization_id,source_type,source_id,status,urgency_score,acknowledged_at,escalated_at,manager_recipient,created_at,updated_at)
      VALUES(?,?,?,?,'ESCALATED',80,NULL,?,?,?,?)`)
      .bind(escalationId, input.organizationId, input.sourceType, input.sourceId, now, recipient, now, now),
    db().prepare(`INSERT INTO notification_outbox
      (id,organization_id,escalation_id,route,priority,recipient,subject,body,status,attempts,provider_message_id,last_error,available_at,created_at,updated_at)
      VALUES(?,?,?,?,'HIGH',?,?,?,'PENDING',0,NULL,NULL,?,?,?)`)
      .bind(outboxId, input.organizationId, escalationId, route, recipient, input.subject, input.body, now, now, now),
    db().prepare(`INSERT INTO staff_notifications
      (id,organization_id,event_id,recipient_email,sender_email,title,message,status,created_at,read_at)
      VALUES(?,?,NULL,?,'AAIQ-ANOMALY-DETECTION',?,?,'unread',?,NULL)`)
      .bind(crypto.randomUUID(), input.organizationId, manager.user_email, input.subject, input.body, now),
  ]);
  await recordSystemAudit({
    organizationId: input.organizationId, propertyId: input.propertyId,
    eventType: input.auditEventType, entityType: "NOTIFICATION_ESCALATION", entityId: escalationId,
    authorType: "SYSTEM", authorId: "AAIQ-ANOMALY-DETECTION", correlationId: escalationId,
    delta: { ...input.auditDelta, manager: manager.user_email, route },
  });
  return true;
}

/**
 * Flags a business date whose cash variance is unusually large relative to
 * this property's own recent history — distinct from the fixed-threshold
 * escalation in runCashReconciliationEscalations, which fires only above a
 * configured dollar amount regardless of what's normal for the property. A
 * property that normally reconciles within a few dollars but suddenly shows
 * a $40 gap is worth a manager's attention even if it's under the configured
 * threshold; this catches that case.
 */
export async function runCashVarianceAnomalyEscalations() {
  const properties = await activeProperties();
  let examined = 0, escalated = 0;
  for (const property of properties) {
    const history = await db().prepare(`SELECT id,business_date,variance_cents FROM daily_cash_reconciliation
      WHERE organization_id=? AND property_id=? AND variance_cents IS NOT NULL
      ORDER BY business_date DESC LIMIT 8`)
      .bind(property.organization_id, property.id).all<{ id: string; business_date: string; variance_cents: number }>();
    const rows = history.results;
    if (rows.length < 5) continue; // not enough history for a meaningful baseline
    examined += 1;
    const [latest, ...baseline] = rows;
    const baselineAvgAbs = baseline.reduce((sum, row) => sum + Math.abs(row.variance_cents), 0) / baseline.length;
    const latestAbs = Math.abs(latest.variance_cents);
    const isAnomaly = latestAbs >= Math.max(baselineAvgAbs * 2.5, 5000); // 2.5x the recent baseline, or a $50 floor
    if (!isAnomaly) continue;
    if (await alreadyEscalated(property.organization_id, "CASH_VARIANCE_ANOMALY", latest.id)) continue;
    if (await alreadyEscalated(property.organization_id, "CASH_RECONCILIATION", latest.id)) continue; // already flagged by the threshold escalation
    const varianceLabel = `${latest.variance_cents < 0 ? "shortage" : "overage"} $${(latestAbs / 100).toFixed(2)}`;
    const baselineLabel = `$${(baselineAvgAbs / 100).toFixed(2)}`;
    const wasEscalated = await escalateAnomaly({
      organizationId: property.organization_id, propertyId: property.id,
      sourceType: "CASH_VARIANCE_ANOMALY", sourceId: latest.id,
      subject: `Unusual cash variance — ${property.name}`,
      body: `${latest.business_date}: ${varianceLabel} is well above this property's recent average variance of ${baselineLabel} (last ${baseline.length} business dates). Review AAIQ Cash & Check Custody.`,
      auditEventType: "CASH_VARIANCE_ANOMALY_DETECTED",
      auditDelta: { businessDate: latest.business_date, varianceCents: latest.variance_cents, baselineAvgAbsCents: Math.round(baselineAvgAbs) },
    });
    if (wasEscalated) escalated += 1;
  }
  return { examined, escalated, completedAt: new Date().toISOString() };
}

/**
 * Flags a sudden jump in negative/critical review sentiment relative to a
 * property's own recent baseline. Only fires with enough reviews in both
 * windows to be a real signal, not noise from one bad review.
 */
export async function runReviewSentimentAnomalyEscalations() {
  const properties = await activeProperties();
  let examined = 0, escalated = 0;
  const today = new Date().toISOString().slice(0, 10);
  for (const property of properties) {
    const rows = await db().prepare(`SELECT sentiment,received_at FROM guest_review_events
      WHERE organization_id=? AND property_id=? ORDER BY received_at DESC LIMIT 20`)
      .bind(property.organization_id, property.id).all<{ sentiment: string; received_at: string }>();
    if (rows.results.length < 8) continue; // not enough reviews for a meaningful trend
    examined += 1;
    const recent = rows.results.slice(0, 5);
    const baseline = rows.results.slice(5, 20);
    if (baseline.length < 5) continue;
    const negativeRate = (window: typeof recent) =>
      window.filter(r => r.sentiment === "NEGATIVE" || r.sentiment === "CRITICAL").length / window.length;
    const recentRate = negativeRate(recent);
    const baselineRate = negativeRate(baseline);
    const isAnomaly = recentRate - baselineRate >= 0.4; // a 40-point jump in negative/critical share
    if (!isAnomaly) continue;
    const sourceId = `${property.id}:${today}`;
    if (await alreadyEscalated(property.organization_id, "REVIEW_SENTIMENT_ANOMALY", sourceId)) continue;
    const wasEscalated = await escalateAnomaly({
      organizationId: property.organization_id, propertyId: property.id,
      sourceType: "REVIEW_SENTIMENT_ANOMALY", sourceId,
      subject: `Guest sentiment drop — ${property.name}`,
      body: `${Math.round(recentRate * 100)}% of the last ${recent.length} reviews were negative or critical, versus ${Math.round(baselineRate * 100)}% of the prior ${baseline.length}. Review AAIQ Review Intelligence for recurring themes.`,
      auditEventType: "REVIEW_SENTIMENT_ANOMALY_DETECTED",
      auditDelta: { recentNegativeRate: recentRate, baselineNegativeRate: baselineRate, recentCount: recent.length, baselineCount: baseline.length },
    });
    if (wasEscalated) escalated += 1;
  }
  return { examined, escalated, completedAt: new Date().toISOString() };
}
