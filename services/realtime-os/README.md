# AAI Q Real-Time Hospitality OS

Production Node.js module for autonomous multimodal intake, PostgreSQL persistence,
Redis Pub/Sub, BullMQ delayed execution, WebSocket fan-out, Twilio failover,
interactive drill-down reports, PDF export, and hash-chained audit history.

## Security boundary

All communications pass through deterministic payment-card, government-ID, email,
and phone redaction before the OpenAI request. The database stores only the redacted
input and a SHA-256 checksum of the original. Audit rows form an immutable hash chain.
JWT claims scope every request and WebSocket to a tenant and property.

Twilio webhooks are accepted only when the official request signature validates
against the exact public URL and form parameters. Invalid signatures receive `403`
before any database or queue mutation. Phone numbers are hashed; message content is
redacted before it enters durable storage or Redis. Recovery payloads containing
short-lived Twilio media URLs are encrypted at rest with AES-256-GCM.

## Asynchronous SMS/MMS intake

`POST /api/v1/sms/webhook` performs only signature validation, property routing,
idempotency checks, durable `IntakeToken` creation, and enqueueing to
`sms-intake-queue`. It returns empty TwiML immediately after the durable enqueue.
OpenAI calls never run in the webhook request lifecycle.

The `smsIntakeWorker` consumes one message at a time. Audio is fetched with Twilio
authentication through a size-bounded stream and transcribed; images are downloaded
into bounded memory; video is reduced to a maximum of six frames. The resulting text
and visual evidence is handed to the existing autonomous intake engine with the same
correlation UUID used by tasks and audit records.

BullMQ provides stalled-job recovery. A second reconciliation worker runs every
minute and requeues database tokens left in `PROCESSING` for more than ten minutes
or retryable `FAILED` tokens. Five exhausted attempts move a token to
`DEAD_LETTER` for operator review.

## Run

Use a private environment file based on `.env.example`, then:

```bash
docker compose up --build
```

The container applies Prisma migrations before starting. The health endpoint is
`GET /health`; authenticated APIs are rooted at `/api/v1`.

## API

- `GET /health` and `GET /healthz` (PostgreSQL, Redis, queue depth, stalled intake)
- `POST /api/v1/intake/process`
- `POST /api/v1/sms/webhook` (Twilio-signed inbound SMS/MMS)
- `POST /api/v1/sms/status` (Twilio-signed delivery receipts)
- `POST /api/v1/realtime/ticket` (creates a 30-second, single-use browser socket ticket)
- `GET /api/v1/realtime?propertyId=<uuid>&ticket=<uuid>` (WebSocket)
- `GET /api/v1/reports/summary`
- `GET /api/v1/reports/drilldown?token=<uuid>`
- `GET /api/v1/reports/drilldown?correlationId=<uuid>` (management only)
- `POST /api/v1/reports/pdf`
- `GET /api/v1/reports/export-pdf?correlationId=<uuid>` (management only)
- `GET /api/v1/dispatch/next-action?propertyId=<uuid>` (any available authenticated staff member)
- `PATCH /api/v1/dispatch/tasks/<uuid>` with `ACCEPT`, `START`, or `COMPLETE`
- `POST /api/v1/room-telemetry/lock-event` (`x-api-key` authenticated hardware)
- `GET /api/v1/property/live-grid?propertyId=<uuid>` (tenant-scoped live room snapshot)
- `POST /api/v1/guest/biometric-verify` (scoped guest session, consent, liveness, geofence, lock provisioning)
- `POST /api/v1/audit/reconcile-folio` (Front Desk Supervisor+, Corporate override)
- `POST /api/v1/guest/feedback-intake` (expiring guest session; durable `202` queue intake)
- `GET /api/v1/franchisor/global-ledgers` (Corporate tier only)
- `POST /api/v1/edge/sync` (`x-edge-api-key`; idempotent edge replay)

Critical reminders and tasks receive a BullMQ acknowledgement timeout job. If they
remain unacknowledged for five minutes, the escalation worker sends a Twilio SMS to
the active management user and records the provider message ID in the audit chain.

Correlation drill-down runs indexed intake, task, audit, booking, and folio queries
in parallel. It returns redacted communication history, AI confidence/model data,
employee activity, final state, and the immutable hash chain without exposing raw
payment card data or unredacted personal identifiers.

## Verification

```bash
npm run prisma:generate
npm run build
npm test
```

Apply the additive production migration with `npm run prisma:migrate`. Configure the
Twilio inbound webhook as:

`https://<public-host>/api/v1/sms/webhook`

The configured `PUBLIC_BASE_URL` must exactly match the scheme and host Twilio calls,
otherwise signature verification correctly rejects the request.

`@fastify/formbody` runs before the Twilio signature `preHandler`, ensuring the
validator receives Twilio's complete form parameter dictionary. The same module also
exports an Express `RequestHandler` for other HNE services; the active AAIQ runtime
uses the native Fastify adapter.

## Runtime resilience

The Compose topology includes PostgreSQL, transaction-pooled PgBouncer, Redis AOF
persistence, and the API/worker container. Redis deliberately uses `noeviction`:
BullMQ requires queue keys to remain durable and must not silently evict jobs when
memory is exhausted. `/healthz` returns `503` when PostgreSQL or Redis is unavailable,
queue metrics cannot be read, or an intake remains processing beyond ten minutes.

The repository workflow `.github/workflows/realtime-os-ci.yml` installs from the
lockfile, generates Prisma types, applies migrations to PostgreSQL 17, compiles strict
TypeScript, runs security tests, and validates the Compose definition.

Digital wallet issuing is intentionally not enabled yet. A real Apple pass requires
an Apple Pass Type ID, Team ID, signing certificate/private key, and WWDR chain; a
real Google Wallet pass requires an approved issuer and service-account signing key.
The module does not emit fake `.pkpass` files or mock JWT save links.

## Test RBAC compatibility layer

The isolated AAIQ service mirrors the core HNE department and role-tier hierarchy
without introducing a second login table:

- Departments: `FRONT_DESK`, `HOUSEKEEPING`, `MAINTENANCE`, `EXECUTIVE`
- Tiers: `ASSOCIATE`, `SUPERVISOR`, `MANAGER`, `CORPORATE`

JWTs establish identity (`sub` and `tenantId`) only. On every protected request the
service reloads the active user, department, tier, availability, and assignment role
from PostgreSQL. Token-carried authorization claims are therefore ignored.

`GET /api/v1/reports/drilldown`, `POST /api/v1/reports/pdf`, and
`GET /api/v1/reports/export-pdf` require `EXECUTIVE` plus at least `MANAGER`.
`CORPORATE` bypasses departmental boundaries. Associates, supervisors, and managers
outside the Executive department receive an immediate `403`.

The next-action endpoint returns one real task scoped to the authenticated tenant,
requested property, worker department, availability, and assignment. It returns
`activeTask: null` when no authorized work is available; it never fabricates a room,
guest, audit review, or demonstration task.

The SMS worker passes normalized text, voice transcripts, and visual evidence through
the shared `aiOrchestratorPipeline`. That adapter reuses the canonical structured LLM
extractor, serializable persistence, audit chain, realtime bus, and delayed queues.
Check-in and wallet-key actions remain approval-gated until identity, PMS reservation,
room assignment, and lock-provider verification are available.

## Autonomous recovery and room lifecycle

The `aaiq-property-automation` BullMQ worker runs idempotent operational scans:

- Task SLA recovery: 10 minutes for critical work and 15 minutes for housekeeping
  or standard operations.
- Checked-out room-state reconciliation every minute.
- Late-checkout guest recovery every five minutes.

An SLA breach places the former worker into `STALLED`, removes them from predictive
dispatch, increments the task reroute counter, records previous/new workers and both
timestamps in `task_escalation_logs`, and assigns the work to the best available
department candidate. Candidate ranking prefers a worker already at the room, then
the shortest active queue, then the strongest seven-day completion velocity. The
task update is broadcast in real time and the configured AGM is notified by Twilio;
if an AGM job title is unavailable, the system falls back to an available Executive
Manager or Corporate user.

Lock telemetry requires `ROOM_TELEMETRY_API_KEY` in the constant-time checked
`x-api-key` header. Provider event IDs are unique, so retries cannot create duplicate
room-turn tasks. Verified checkout, expired-key, and elapsed-checkout events change
the room to `DIRTY`, expire the booking key, create and assign housekeeping work,
write the immutable audit chain, and broadcast the new task.

Rooms with a thermostat ID attempt an authenticated five-second HVAC gateway command.
ECO mode targets 62°F during the heating season and 78°F during the cooling season.
The database changes climate state only after the gateway confirms success; skipped
or failed commands receive a separate audit entry rather than reporting fake savings.

## Procurement, turnover, identity, and folio controls

Completed housekeeping tasks consume the configured detergent, pillowcase, and
bedsheet SKUs through an idempotent inventory usage ledger. When stock reaches its
property threshold, AAIQ creates at most one open purchase order per item. The
supplier call creates a vendor-side **draft** only; it does not commit a purchase
without the procurement approval workflow. A Night Audit BullMQ schedule rechecks
the preceding day so a worker restart cannot lose consumption.

The turnover optimizer reads configured aviation-provider telemetry every 15
minutes. Early or landed arrivals reprioritize only the cleaning task for the
reservation's assigned room, and every change is audited and broadcast.

The live grid component is `src/components/PropertyLiveGrid.tsx`. It obtains a
single-use WebSocket ticket, groups rooms by floor, and refreshes room, climate,
worker, and task data when realtime events arrive. Browser clients never place a
long-lived JWT in a WebSocket URL.

Biometric check-in never persists the camera image. It requires an expiring guest
session, recorded biometric consent, an enrolled facial-vector hash, provider
liveness confidence of at least 0.92, the configured property geofence, and a
successful smart-lock API response. Only the credential hash is stored. Production
use additionally requires locally reviewed biometric consent/retention policies and
the configured provider credentials.

Folio reconciliation derives tax from each imported charge's recorded tax rate,
compares it with posted tax lines, and returns `409` with explicit exceptions for
missing source references, missing rates, or variances. It does not simulate payment
capture. A clean audit marks charge lines `RECONCILED` and appends the immutable
audit chain; checkout and payment remain separate controlled actions.

## Guest sentiment and service recovery

Feedback intake verifies the booking-scoped guest session, encrypts the original
comment, persists an idempotent intake token, and enqueues BullMQ work before
returning `202`. The LLM produces a strict sentiment matrix: classification,
sentiment, anger, urgency, and confidence scores plus a redacted operational
summary. No keyword mock is used.

`NEGATIVE` and `ANGRY` feedback creates a critical management task, broadcasts it
to the live dashboard, sends a constrained context-specific apology to the guest,
and pages the configured GM. The prompt prohibits invented refunds, admissions,
compensation promises, or requests to suppress a public review. Failed queue
items are recovered by a five-minute reconciliation scheduler.

## Franchise settlement ledger

A passed folio audit enqueues a franchise split calculation. The active,
effective-dated property agreement is mandatory; the service never silently
invents default contract percentages. Decimal arithmetic snapshots the agreement
rates and creates an idempotent `READY` ledger row. `READY` means calculated and
auditable—it does not claim that ACH or another money movement occurred.

`GET /api/v1/franchisor/global-ledgers` is limited to `CORPORATE` tier and remains
tenant-scoped. It returns property/status aggregates and transaction-level
correlation links for the existing immutable report drill-down.

## Property edge continuity

Offline room credentials are AES-256-GCM encrypted and authenticated with a
versioned data-on-card payload; booking and room identifiers are not exposed as
plaintext. The lock integration receives the offline token alongside the online
NFC/Bluetooth credential.

Run the on-property edge profile with:

```bash
docker compose --profile edge up -d edge-sync
```

The edge service provides a locally authenticated API on the configured bind
address, mirrors room state into SQLite WAL storage, and appends task/room/audit
mutations to an outbox. It probes cloud health every ten seconds and replays the
outbox using exponential backoff when connectivity returns. The cloud endpoint
uses `(edgeNodeId, edgeEventId)` idempotency receipts, timestamp conflict checks,
tenant/property validation, immutable audit entries, and realtime broadcasts.
Generic application callbacks are never reported as successful without a real
local record.

## Staff login and hardened runtime

`POST /api/v1/auth/login` checks the canonical tenant-scoped `User.passwordHash`
with bcrypt, rate-limits failures in Redis, and returns a 12-hour
Secure/HttpOnly/SameSite=Strict cookie. Existing users receive a deliberately
unusable migration hash and require an administrator-controlled password reset.
JWT role fields support UI routing, while every authorization decision reloads
the current department and tier from PostgreSQL.

The Nginx profile is `deploy/nginx/aaiq.conf`; it keeps Twilio requests
non-blocking, isolates login/webhook rate limits, forwards canonical HTTPS
headers, and allows 15 MB so a 10 MB camera frame can survive base64 expansion.
`ecosystem.config.cjs` contains no database passwords or provider secrets.

## Automated receipts, late checkout, and guest Wi-Fi

A clean folio audit now also requires `Booking.folioBalance` to be within one
cent of zero. It checks out the booking, creates a unique durable receipt
delivery, queues a professional itemized HTML email, and retries failures
through BullMQ. Guest email addresses remain encrypted; the delivery ledger and
audit trail store only their hash.

For a checked-in booking whose room remains occupied five minutes after
checkout, AAIQ sends one SMS with a single-use extension link. The link opens a
confirmation screen so carrier preview scanners cannot create requests; the
guest confirmation creates a Front Desk approval task and does not silently
approve the extension or waive a fee. Fifteen minutes after an unanswered
reminder, a PII-free Slack alert is sent and recorded.

Biometric check-in provisions a random per-booking Wi-Fi credential through the
configured gateway. Only its hash and encrypted recovery value are stored. The
credential is included in the existing wallet/SMS response, expires with the
booking, and is revoked during checkout. SMTP, Slack, and network gateway
integrations have no mock credential or insecure URL fallback.
