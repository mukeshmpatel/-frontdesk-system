import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import websocket from "@fastify/websocket";
import formbody from "@fastify/formbody";
import cookie from "@fastify/cookie";
import { z } from "zod";
import { config } from "./config.js";
import { intakeRequestSchema, type AuthUser } from "./contracts.js";
import { processIntake } from "./intake.js";
import { correlationDrilldown, drilldown, summary } from "./reporting.js";
import { registerSocket } from "./realtime.js";
import { renderReportPdf } from "./pdf.js";
import { closeInfrastructure, feedbackQueue, prisma, propertyAutomationQueue, receiptDeliveryQueue, redis, settlementQueue, stateReconciliationQueue } from "./infrastructure.js";
import { closeWorkers } from "./workers.js";
import { handleInboundSmsWebhook, handleSmsStatusWebhook } from "./smsWebhook.js";
import { verifyTwilioSignatureFastify } from "./middleware/verifyTwilioSignature.js";
import { systemHealth } from "./health.js";
import { authenticateStaffJwt } from "./middleware/authenticateJwt.js";
import { authorizeRole } from "./middleware/authorizeRole.js";
import { Department, RoleTier } from "@prisma/client";
import { getNextActionToken, updateTaskAction } from "./controllers/dispatchController.js";
import { handleLockTelemetryWebhook } from "./controllers/roomTelemetryController.js";
import { verifyHardwareApiKey } from "./middleware/verifyHardwareApiKey.js";
import { getPropertyLiveGrid } from "./controllers/propertyGridController.js";
import { verifyGuestBiometrics } from "./controllers/biometricCheckInController.js";
import { authenticateGuestSession } from "./middleware/authenticateGuestSession.js";
import { reconcileFolioController } from "./controllers/folioAuditController.js";
import { acceptGuestFeedback } from "./controllers/guestFeedbackController.js";
import { getGlobalLedgers } from "./controllers/franchisorLedgerController.js";
import { synchronizeEdgeEvent } from "./controllers/edgeSyncController.js";
import { verifyEdgeApiKey } from "./middleware/verifyEdgeApiKey.js";
import { loginStaffMemberController } from "./controllers/authController.js";
import { requestLateCheckoutExtension, showLateCheckoutExtension } from "./controllers/lateCheckoutController.js";

declare module "fastify" {
  interface FastifyRequest { authUser: AuthUser }
}

const app = Fastify({ logger: { level: config.NODE_ENV === "production" ? "info" : "debug", redact: ["req.headers.authorization", "req.headers.cookie", "body.password", "body.text", "body.chat_history_chunk"] }, bodyLimit: 25 * 1024 * 1024 });
await app.register(cors, { origin: config.PUBLIC_BASE_URL, credentials: true });
await app.register(cookie);
await app.register(jwt, { secret: config.JWT_SECRET, cookie: { cookieName: "aaiq_session_token", signed: false } });
await app.register(websocket);
await app.register(formbody);

app.decorateRequest("authUser", undefined as unknown as AuthUser);
app.addHook("preHandler", async (request, reply) => {
  if (
    request.url === "/health"
    || request.url === "/healthz"
    || request.url.startsWith("/api/v1/sms/")
    || request.url.startsWith("/api/v1/room-telemetry/")
    || request.url === "/api/v1/guest/biometric-verify"
    || request.url === "/api/v1/guest/feedback-intake"
    || request.url === "/api/v1/edge/sync"
    || request.url === "/api/v1/auth/login"
    || request.url.startsWith("/guest/late-checkout")
    || (request.method === "GET" && request.url.startsWith("/api/v1/realtime"))
  ) return;
  return authenticateStaffJwt(request, reply);
});
const executiveManagerGuard = authorizeRole([Department.EXECUTIVE], RoleTier.MANAGER);
const corporateGuard = authorizeRole([Department.EXECUTIVE], RoleTier.CORPORATE);

async function healthRoute(_request: unknown, reply: { code: (status: number) => { send: (body: unknown) => unknown } }) {
  const health = await systemHealth();
  return reply.code(health.status === "HEALTHY" ? 200 : 503).send(health);
}
app.get("/health", healthRoute);
app.get("/healthz", healthRoute);
app.post("/api/v1/auth/login", loginStaffMemberController);
app.get("/guest/late-checkout", showLateCheckoutExtension);
app.post("/guest/late-checkout", requestLateCheckoutExtension);
app.post("/api/v1/sms/webhook", { preHandler: verifyTwilioSignatureFastify }, handleInboundSmsWebhook);
app.post("/api/v1/sms/status", { preHandler: verifyTwilioSignatureFastify }, handleSmsStatusWebhook);
app.post(
  "/api/v1/room-telemetry/lock-event",
  { preHandler: verifyHardwareApiKey },
  handleLockTelemetryWebhook,
);

app.post("/api/v1/intake/process", async (request, reply) => {
  const input = intakeRequestSchema.parse(request.body);
  return reply.code(201).send(await processIntake(request.authUser, input));
});

app.get("/api/v1/dispatch/next-action", getNextActionToken);
app.patch("/api/v1/dispatch/tasks/:id", updateTaskAction);
app.get(
  "/api/v1/property/live-grid",
  { preHandler: executiveManagerGuard },
  getPropertyLiveGrid,
);
app.post(
  "/api/v1/guest/biometric-verify",
  { preHandler: authenticateGuestSession },
  verifyGuestBiometrics,
);
app.post(
  "/api/v1/guest/feedback-intake",
  { preHandler: authenticateGuestSession },
  acceptGuestFeedback,
);
app.post(
  "/api/v1/edge/sync",
  { preHandler: verifyEdgeApiKey },
  synchronizeEdgeEvent,
);
app.post(
  "/api/v1/audit/reconcile-folio",
  { preHandler: authorizeRole([Department.FRONT_DESK], RoleTier.SUPERVISOR) },
  reconcileFolioController,
);
app.get(
  "/api/v1/franchisor/global-ledgers",
  { preHandler: corporateGuard },
  getGlobalLedgers,
);

app.get("/api/v1/reports/summary", async (request) => {
  const query = request.query as { propertyId?: string; from?: string; to?: string };
  if (!query.propertyId) throw Object.assign(new Error("propertyId is required."), { statusCode: 400 });
  const from = new Date(query.from ?? Date.now() - 7 * 86_400_000);
  const to = new Date(query.to ?? Date.now());
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) throw Object.assign(new Error("Valid from/to timestamps are required."), { statusCode: 400 });
  return summary(request.authUser, query.propertyId, from, to);
});

app.get("/api/v1/reports/drilldown", { preHandler: executiveManagerGuard }, async (request) => {
  const query = z.object({
    token: z.string().uuid().optional(),
    correlationId: z.string().uuid().optional(),
  }).refine((value) => Boolean(value.token || value.correlationId), "token or correlationId is required.").parse(request.query);
  if (query.correlationId) return correlationDrilldown(request.authUser, query.correlationId);
  return { records: await drilldown(request.authUser, query.token!) };
});

app.post("/api/v1/reports/pdf", { preHandler: executiveManagerGuard }, async (request, reply) => {
  const body = request.body as Parameters<typeof renderReportPdf>[0];
  const pdf = await renderReportPdf({ ...body, generatedBy: request.authUser.email });
  return reply.header("content-type", "application/pdf").header("content-disposition", `attachment; filename="AAIQ-report-${Date.now()}.pdf"`).send(pdf);
});

app.get("/api/v1/reports/export-pdf", { preHandler: executiveManagerGuard }, async (request, reply) => {
  const { correlationId } = z.object({ correlationId: z.string().uuid() }).parse(request.query);
  const report = await correlationDrilldown(request.authUser, correlationId);
  const property = await prisma.property.findFirst({
    where: { id: report.propertyId, tenantId: request.authUser.tenantId },
    select: { name: true },
  });
  if (!property) throw Object.assign(new Error("Property not found."), { statusCode: 404 });
  const rows = report.immutableAuditChain.map((entry) => ({
    Timestamp: entry.createdAt.toISOString(),
    Event: entry.eventType,
    Entity: `${entry.entityType} ${entry.entityId}`,
    Author: `${entry.authorType}: ${entry.authorId}`,
    "Modified tables": entry.modifiedTables.join(", "),
    "Audit signature": entry.auditHash,
  }));
  const pdf = await renderReportPdf({
    propertyName: property.name,
    reportTitle: "Operational Root Cause & Audit Verification",
    generatedBy: request.authUser.email,
    from: rows.at(0)?.Timestamp ?? new Date().toISOString(),
    to: rows.at(-1)?.Timestamp ?? new Date().toISOString(),
    columns: ["Timestamp", "Event", "Entity", "Author", "Modified tables", "Audit signature"],
    rows,
  });
  return reply
    .header("content-type", "application/pdf")
    .header("content-disposition", `attachment; filename="AAIQ-audit-${correlationId}.pdf"`)
    .send(pdf);
});

app.post("/api/v1/realtime/ticket", async (request, reply) => {
  const { propertyId } = z.object({ propertyId: z.string().uuid() }).parse(request.body);
  const property = await prisma.property.findFirst({
    where: { id: propertyId, tenantId: request.authUser.tenantId },
    select: { id: true },
  });
  if (!property) return reply.code(404).send({ error: { code: "PROPERTY_NOT_FOUND", message: "Property not found." } });
  const ticket = crypto.randomUUID();
  await redis.set(`ws-ticket:${ticket}`, JSON.stringify({
    tenantId: request.authUser.tenantId,
    propertyId,
    userId: request.authUser.sub,
  }), "EX", 30);
  return reply.send({ ticket, expiresInSeconds: 30 });
});

app.get("/api/v1/realtime", { websocket: true }, async (socket, request) => {
  const query = z.object({ propertyId: z.string().uuid(), ticket: z.string().uuid() }).safeParse(request.query);
  if (!query.success) return socket.close(1008, "propertyId and ticket are required");
  const payload = await redis.getdel(`ws-ticket:${query.data.ticket}`);
  if (!payload) return socket.close(1008, "Realtime ticket is invalid or expired");
  const identity = JSON.parse(payload) as { tenantId: string; propertyId: string };
  if (identity.propertyId !== query.data.propertyId) return socket.close(1008, "Realtime ticket scope mismatch");
  await registerSocket(identity.tenantId, identity.propertyId, socket);
});

app.setErrorHandler((error, _request, reply) => {
  const caught = error instanceof Error ? error : new Error("Unknown service error.");
  const status = "statusCode" in caught && typeof caught.statusCode === "number" ? caught.statusCode : 500;
  const conflictingEventId = "conflictingEventId" in caught && typeof caught.conflictingEventId === "string"
    ? caught.conflictingEventId : undefined;
  reply.code(status).send({ error: {
    code: status === 409 ? "SCHEDULE_CONFLICT" : "REQUEST_FAILED",
    message: status >= 500 ? "The service could not complete the request." : caught.message,
    traceId: crypto.randomUUID(),
    ...(conflictingEventId ? { conflictingEventId } : {}),
  } });
});

const shutdown = async () => { await app.close(); await closeWorkers(); await closeInfrastructure(); };
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
await stateReconciliationQueue.upsertJobScheduler(
  "sms-intake-state-reconciliation",
  { every: 60_000 },
  { name: "reconcile", data: {}, opts: { removeOnComplete: 100, removeOnFail: 500 } },
);
await propertyAutomationQueue.upsertJobScheduler(
  "task-sla-scan-every-minute",
  { every: 60_000 },
  { name: "task-sla-scan", data: { kind: "SLA_SCAN" }, opts: { removeOnComplete: 100, removeOnFail: 500 } },
);
await propertyAutomationQueue.upsertJobScheduler(
  "booking-checkout-scan-every-minute",
  { every: 60_000 },
  { name: "booking-checkout-scan", data: { kind: "CHECKOUT_SCAN" }, opts: { removeOnComplete: 100, removeOnFail: 500 } },
);
await propertyAutomationQueue.upsertJobScheduler(
  "late-checkout-scan-every-five-minutes",
  { every: 5 * 60_000 },
  { name: "late-checkout-scan", data: { kind: "LATE_CHECKOUT_SCAN" }, opts: { removeOnComplete: 100, removeOnFail: 500 } },
);
await propertyAutomationQueue.upsertJobScheduler(
  "night-audit-procurement-scan",
  { pattern: "0 2 * * *", tz: "America/Chicago" },
  { name: "night-audit-procurement", data: { kind: "PROCUREMENT_SCAN" }, opts: { removeOnComplete: 100, removeOnFail: 500 } },
);
await propertyAutomationQueue.upsertJobScheduler(
  "flight-turnover-scan-every-fifteen-minutes",
  { every: 15 * 60_000 },
  { name: "flight-turnover-scan", data: { kind: "TURNOVER_SCAN" }, opts: { removeOnComplete: 100, removeOnFail: 500 } },
);
await settlementQueue.upsertJobScheduler(
  "franchise-settlement-reconciliation",
  { every: 5 * 60_000 },
  { name: "settlement-reconciliation", data: { scan: true }, opts: { removeOnComplete: 100, removeOnFail: 500 } },
);
await feedbackQueue.upsertJobScheduler(
  "guest-feedback-reconciliation",
  { every: 5 * 60_000 },
  { name: "feedback-reconciliation", data: { scan: true }, opts: { removeOnComplete: 100, removeOnFail: 500 } },
);
await receiptDeliveryQueue.upsertJobScheduler(
  "folio-receipt-delivery-reconciliation",
  { every: 5 * 60_000 },
  { name: "receipt-delivery-reconciliation", data: { scan: true }, opts: { removeOnComplete: 100, removeOnFail: 500 } },
);
await app.listen({ host: "0.0.0.0", port: config.PORT });
