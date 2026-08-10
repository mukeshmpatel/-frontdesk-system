# Enterprise Reporting and Controls

AAI Q now uses its existing organization, employee, shift, time-entry, front-desk,
staff-notification, and secure-upload records as the canonical sources for reports
and operational controls. No duplicate workforce or calendar domain was introduced.

## Report compiler

`POST /api/v1/reports/compile` accepts a report type plus ISO `from` and `to`
timestamps. Access is resolved from the authenticated staff membership. Staff see
their own time records; administrators may compile organization-wide and audit
reports. The response is a print-ready HTML document with dynamic property branding,
tracking ID, generator footprint, generation timestamp, page-safe table styling,
page counters, and a SHA-256 verification checksum. Every compilation appends an
immutable `REPORT_COMPILED` event to `system_audit_trail`.

The report center provides payroll presets and arbitrary custom dates. Available
matrices cover time cards, overtime, payroll, attendance, coverage, productivity,
forecasting, active rooms, housekeeping labor, night audit, and the audit ledger.

## Collision prevention

`POST /api/v1/calendar/blocks` atomically scopes availability checks to organization,
property, asset type, and asset ID. Any active overlap returns HTTP 409 with
`ASSET_SCHEDULE_CONFLICT`, the conflicting event ID, both time ranges, and a trace
ID. Successful blocks are audit logged.

## Escalation matrix

The Cloudflare scheduled worker evaluates urgent open front-desk and housekeeping
tasks older than five minutes. It creates an `ESCALATED` record with urgency score
100, writes a critical notification to the manager's in-app inbox, and adds a
durable SMS outbox message when a manager phone number is available. Provider
delivery workers claim `notification_outbox` records using status and attempt
fields; credentials never belong in source control.

The authenticated fallback endpoint is `POST /api/internal/cron/escalations` and
requires `Authorization: Bearer <CRON_SECRET>`.

## Deployment

Drizzle migrations are generated from `db/schema.ts`. The Sites checkpoint pipeline
runs migrations before traffic moves and runs `npm test`, which performs a production
build plus architectural regression checks. Required deployment secret:

- `CRON_SECRET`: random secret for authenticated manual scheduler invocations.

SMS provider credentials are supplied through the HNE notification adapter and are
not stored in source files or audit payloads.
