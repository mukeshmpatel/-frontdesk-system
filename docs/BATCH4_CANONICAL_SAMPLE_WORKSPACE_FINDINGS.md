# AAIQ Batch 4 — Canonical Sample Workspace Findings and Repair Contract

Date: 2026-08-03  
Scope: `release123-rebuild` only. The HNE core repository is not modified.  
Authorization: Mukesh requested implementation after review of the deployed pilot failures.

## Mission contract

AAIQ must reduce human work. The repaired pilot will expose one complete, editable sample hotel as the only active workspace. The existing Wyndham Garden Salina and Days Inn Salina South records will be preserved as archived source records, not deleted. Every operational module must resolve the same canonical property through one shared service. A real property will be created by cloning the verified sample and editing only property-specific facts.

## Evidence-based findings

### CSW-001 — Competing property resolvers

- Severity: Critical
- Category: Data integrity / workflow
- Current behavior: The shell, Cash & Check Custody, Master Inbox, Website Factory, Video Intelligence, Enterprise Operations, events, integrations, and agent modules independently select a property. The shell can display Wyndham while the page body operates on Days Inn.
- Evidence: `db/property-scope.ts`, `db/communication-center.ts`, `db/cash-check-custody.ts`, `db/enterprise-operations.ts`, `db/website-factory.ts`, `db/video-intelligence.ts`, `db/event-workforce.ts`, `db/agent-platform.ts`, and the user screenshots dated 2026-08-03.
- Repair: All modules must use `authorizedPropertyScope`; no module-local active-property query remains in repaired paths.

### CSW-002 — Canonical scope includes inactive or stale properties

- Severity: Critical
- Category: Authorization / data isolation
- Current behavior: `authorizedPropertyScope` does not require `property_contexts.status='ACTIVE'` and can honor a stale user preference.
- Evidence: `db/property-scope.ts:7-22`.
- Repair: Add an organization-level canonical workspace profile, require active properties and active assignments, validate requested properties, and fall back deterministically to the canonical property.

### CSW-003 — Sample environment is rich but operationally detached

- Severity: High
- Category: Workflow
- Current behavior: The protected sample template already creates 105 rooms, 945 room assets, 15 spaces, 10 staff, 10 agents, work orders, inventory, a website draft, social sandboxes, and report facts. Cloning merely adds another active property and does not make it canonical.
- Evidence: `db/sample-environments.ts:1-412`, `app/aaiq-sample-lab/sample-environment-client.tsx`.
- Repair: Add one-click canonical activation. Reuse an existing canonical sample if present, otherwise clone the protected template. Archive other active property records, activate the sample, set the administrator preference, and record audit evidence.

### CSW-004 — Digital Employees are catalog entries, not a usable work surface

- Severity: High
- Category: Function / autonomy
- Current behavior: Agent registry and authority tables describe capabilities, but users cannot click an employee, issue a text/voice command, watch a run, or see a truthful result/escalation.
- Evidence: `ai_agent_registry`, migrations `0048`, `0056`, `0071`, `0073`; current Digital Employee screens.
- Repair: Add one command center backed by real run records. Each employee exposes bounded tools, creates real property-scoped work or reports, records tool calls and audit evidence, and escalates unsupported/high-risk actions rather than claiming success.

### CSW-005 — Video inventory is a manual observation form

- Severity: High
- Category: Function / workflow
- Current behavior: Video Intelligence can record an observation but does not provide a media-to-detected-item-to-human-verification-to-inventory-adjustment workflow. Property loading also depends on the competing Enterprise Operations resolver.
- Evidence: `db/video-intelligence.ts`, Video Intelligence UI, screenshot showing `Loading property…`.
- Repair: Canonical property scope plus a governed inventory-evidence pipeline. Media is private; detections remain proposals; an authorized human approves inventory changes. Sample evidence is included so the flow is testable without private media storage.

### CSW-006 — Hiring is input-only and publication readiness is not a workflow

- Severity: High
- Category: Function
- Current behavior: The page displays a title/department form and credential labels but does not provide a complete seeded job description, approval packet, channel drafts, or reliable status transitions.
- Evidence: Hiring & Workforce Lifecycle screenshots and `db/workforce-lifecycle.ts`.
- Repair: Seed property-aware role templates, generate a complete editable job packet, create approval-gated channel drafts, and expose a traceable posting workflow.

### CSW-007 — Master Inbox controls are cosmetic and property scope is wrong

- Severity: High
- Category: Function / data isolation
- Current behavior: Source cards show `Rename` but primary source-selection and conversation actions are not usable. The body can identify Days Inn while the shell identifies Wyndham.
- Evidence: Communication Center screenshots and `db/communication-center.ts`.
- Repair: Canonical scope, clickable source filters, conversation detail, triage, draft/reply controls, safe empty states, and explicit connection routes.

### CSW-008 — Website Factory metrics and projects can cross property scope

- Severity: High
- Category: Data isolation / function
- Current behavior: The active property can differ from the shell, and project metrics are assembled from organization-wide records. The protected sample already has a website project but it is not reliably surfaced.
- Evidence: `db/website-factory.ts`, Website Factory screenshot showing Days Inn under a Wyndham shell.
- Repair: Property-filter every project query, expose the sample website, offer verified templates, create/edit/preview workflows, and keep publishing approval-gated.

### CSW-009 — Maintenance passes undefined values to D1

- Severity: Critical
- Category: Function
- Current behavior: The maintenance screen displays `D1_TYPE_ERROR: Type 'undefined' not supported for value 'undefined'`.
- Evidence: Maintenance screenshot.
- Repair: Normalize all optional bind values to `null`, validate required fields at the API boundary, and add an end-to-end defect creation test.

### CSW-010 — Preview labels overstate operational readiness

- Severity: High
- Category: Truthfulness / UX
- Current behavior: Modules marked Preview present descriptions and cards that imply autonomous operation even when credentials, eligible staff, sources, or working controls are absent.
- Evidence: screenshots across Compliance, Events, Inbox, Website, Autonomous Configuration, and Video Intelligence.
- Repair: Status derives from verified capabilities and workflow tests. Sample-ready, connection-required, approval-required, and unavailable are distinct states. No green ready state may be set by a user without system evidence.

## Implementation order

1. Add the canonical workspace profile migration and rollback.
2. Harden the shared scope service.
3. Add one-click canonical sample activation and preservation of prior properties.
4. Route every affected module through the shared scope service.
5. Complete the sample Digital Employee command center and the media inventory verification vertical slice.
6. Repair Inbox, Hiring, Cash, Website, Video, and Maintenance workflows against the same sample.
7. Verify property isolation, RBAC, audit logging, workflow completion, responsive UX, full tests, and production build.

## Definition of done

- Exactly one active canonical sample property is visible in the pilot.
- Wyndham and Days Inn source records remain recoverable with `ARCHIVED_SOURCE` status.
- Shell and page body show the same property on every repaired route.
- Sample staff, assets, inventory, website, inbox examples, work orders, reports, and Digital Employees are usable.
- A Digital Employee can be opened, receive a text or voice transcript, execute a bounded real workflow, and return evidence or an honest escalation.
- Media inventory produces proposed counts and requires approval before changing inventory.
- Clone creates a complete editable property without duplicating cross-property data.
- Tests prove isolation and all repaired workflows; production build passes.
