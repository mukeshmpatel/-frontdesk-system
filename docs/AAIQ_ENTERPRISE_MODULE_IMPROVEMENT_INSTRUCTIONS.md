# AAIQ Enterprise Module Improvement Instructions

## 1. Mandatory development directive

Improve the existing AAIQ application in place. Do not restart the application, create replacement
demonstrations, or introduce duplicate modules. Preserve all working functionality and extend the
canonical modules:

- AAIQ Team Operations
- AAIQ Digital Front Desk
- AAIQ Inventory & Procurement
- AAIQ User & Access Management
- AAIQ Property & Asset Registry
- AAIQ Reporting
- AAIQ Automation Center
- AAIQ Notifications
- AAIQ Memory Agent

Before writing code, inventory the current routes, navigation entries, database tables, API handlers,
jobs, reports, and tests. Classify every requested capability as `EXISTS`, `PARTIAL`, `MISSING`,
`DUPLICATE`, or `BLOCKED`. For existing and partial capabilities, extend the existing implementation.
Do not create a second screen merely because the existing feature is difficult to find.

Every feature is incomplete until the following are connected:

`UI → validation → API → authorization → persistence → event/audit log → reporting → notification → tests`

Static cards, mock-only data, disabled controls, console logging, and pages that do not persist changes
do not count as implementation.

## 2. Shared enterprise foundation

### 2.1 Organization and context

All records must be scoped through the hierarchy:

`enterprise → company → brand → region → property → building → floor → department → role → user`

Keep the selected property, department, date range, and user role visible in the persistent application
header. Secondary pages must retain the same left navigation and header. The left navigation must scroll
independently, preserve its position, and show only modules the current user is authorized to access.

### 2.2 Shared workflow state

Use canonical state machines rather than arbitrary strings. Every operational record must have:

- tenant and property scope;
- unique correlation ID;
- status and status history;
- owner and assigned role/user;
- priority and SLA;
- source and source record link;
- created, updated, due, acknowledged, started, completed, verified, and closed timestamps;
- attachments and comments;
- reason codes for overrides and exceptions;
- immutable audit history.

### 2.3 Shared events

All material writes must emit an append-only domain event using an outbox transaction. Examples:

- `front_desk.incident.created`
- `front_desk.pet.registered`
- `guest.request.created`
- `task.assigned`
- `task.started`
- `task.completed`
- `task.verification.failed`
- `inventory.issued`
- `inventory.threshold_breached`
- `purchase_order.received`
- `user.access.changed`
- `asset.warranty.expiring`

Events must be idempotent and feed notifications, AI evaluation, automation rules, and reporting. Never
make reporting depend on rescanning every transactional table for every page load.

### 2.4 AI action contract

Every AI action must store:

- authorized source inputs and source links;
- model/tool and prompt/rule version;
- structured output;
- confidence score;
- concise explanation and evidence;
- risk classification;
- approval status and approver;
- final outcome and user correction;
- token/cost/latency telemetry where applicable.

AI may autonomously execute only approved, reversible, low-risk actions. Financial commitments,
terminations, permission escalation, deletion, public publishing, guest compensation, and regulatory
filings require the configured human approval. If AI is unavailable, below confidence, or missing data,
create a manual work item with the partially completed form, missing fields highlighted, and clear next
steps. Users must always be able to edit, approve, reject, retry, or complete manually.

## 3. AAIQ Team Operations

### 3.1 Purpose

Create one role-aware operational workspace that converts property activity into prioritized work,
tracks execution, verifies results, escalates stalled work, and produces shift and management reports.

### 3.2 Required workspaces

1. **My Shift**
   - clock status, scheduled shift, break status, briefing, and one next action;
   - tasks ordered by safety, guest impact, SLA, proximity, skill, and workload;
   - acknowledge, start, pause, request help, add evidence, complete, and hand off;
   - offline-capable mobile workflow with queued synchronization.
2. **Department Board**
   - unassigned, assigned, in progress, blocked, awaiting verification, completed, and breached lanes;
   - list, Kanban, room grid, floor map, and timeline views;
   - bulk assignment with conflict and workload warnings.
3. **Shift Handoff**
   - unresolved tasks, guest promises, incidents, cash/folio exceptions, out-of-order rooms, VIPs,
     inventory shortages, compliance deadlines, and manager decisions;
   - outgoing employee attestation and incoming employee acknowledgment.
4. **Manager Command Center**
   - staffing coverage, SLA risk, task aging, reopening rate, verification failures, overtime risk,
     productivity, and escalations;
   - drill from every metric to employee, task, room, evidence, and audit history.

### 3.3 Assignment and execution

- Auto-create work from PMS status changes, guest requests, front-desk reports, inspection failures,
  preventive-maintenance schedules, inventory thresholds, email/SMS classifications, and manual entry.
- Auto-assign using department, certifications, availability, current workload, floor/room proximity,
  historical velocity, language, shift end time, and exclusion rules.
- Explain why the worker was selected and show the next-best alternatives.
- Prevent assigning work to employees who are off shift, unavailable, stalled, missing certification,
  or already above workload limits.
- Provide a manual assignment override with required reason and audit trail.
- Display a step-by-step checklist appropriate to task type and asset.
- Show a progress meter based on completed required steps, not elapsed time.
- Allow housekeeping to create a linked maintenance ticket without abandoning the room task.
- Allow maintenance to create linked safety, vendor, procurement, or room-out-of-order requests.
- Support camera capture, gallery selection, file upload, voice note, annotation, and before/after pairs.

### 3.4 AI completion verification

- Housekeeping templates define required photo zones: entry, beds, bathroom, vanity, floor, amenities,
  HVAC/thermostat, and any property-specific area.
- Maintenance templates define before, during, after, asset label/serial, meter reading, and safety state.
- AI checks image presence, freshness, duplication, image quality, expected area coverage, visible
  cleanliness/deficiency, and consistency with the work description.
- AI returns `PASS`, `PASS_WITH_OBSERVATION`, `REWORK_REQUIRED`, or `HUMAN_REVIEW`.
- A failed check must identify the observed deficiency, mark the relevant checklist step, and return the
  task to the worker with guidance.
- Supervisors can override with a reason. Store AI evidence and supervisor decision.
- Do not use facial recognition or infer protected characteristics.

### 3.5 Team reports

Provide drill-down reports for:

- assignments by department, shift, employee, building, floor, room, priority, and source;
- acknowledgment, response, active-work, verification, and total completion time;
- SLA compliance and breach causes;
- first-pass verification and rework rates;
- employee cleaning/repair velocity normalized by room/task type;
- task backlog and aging;
- handoff quality and unresolved carryover;
- maintenance tickets created by housekeeping;
- attendance, schedule adherence, breaks, overtime, and staffing coverage;
- attachment/evidence completeness;
- guest-impact and repeat-problem trends.

## 4. AAIQ Digital Front Desk

### 4.1 Purpose

Replace disconnected notes with a structured front-desk operating center covering shift activity,
guest promises, room exceptions, safety incidents, item requests, pet registration, communications,
cash/audit exceptions, and handoff reporting.

### 4.2 Required sections

1. **Shift Dashboard**
   - arrivals, departures, stayovers, occupancy, rooms not ready, out-of-order rooms, VIPs, groups,
     early arrivals, late checkouts, open guest requests, incidents, unresolved folio issues, and
     handoff items.
2. **Incident Center**
   - incident types: guest injury, employee injury, security, disturbance, property damage, vehicle,
     lost/found, fire/life safety, pool, alcohol, privacy, payment dispute, and other;
   - people involved, witnesses, location, chronology, immediate actions, emergency services,
     notifications, photos/files, statements, injury/property details, insurance reference,
     manager review, follow-up, and closure;
   - severity-specific mandatory fields and escalation rules;
   - printable incident package and immutable revision history.
3. **Pet Registry**
   - reservation/room/guest link, animal type, count, service-animal handling, fee posting status,
     agreement, vaccination fields only when lawful/configured, cleaning alert, damages, and checkout;
   - never ask prohibited questions about a service animal;
   - automatically notify housekeeping of pet rooms without exposing unnecessary guest details.
4. **Guest Request Center**
   - configurable catalog: towels, pillows, blankets, rollaway, crib, toiletries, coffee, maintenance,
     wake-up call, transportation, late checkout, room move, accessibility, complaint, and custom;
   - quantity, delivery location, promise time, charge/fee, assigned department, SLA, fulfillment
     confirmation, guest acknowledgment, and recovery escalation;
   - automatically deduct applicable inventory upon confirmed delivery.
5. **Pass-On Log**
   - structured entries with category, priority, affected guest/room, next action, owner, due time,
     visibility, acknowledgment, and resolution;
   - prohibit deleting history; corrections create revisions.
6. **Night Report Intake**
   - upload OPERA/PMS CSV, XLSX, PDF, text, or image report;
   - detect report type and period, extract rooms and exceptions, show a validation preview, and require
     confirmation before committing;
   - automatically create room-turn tasks, maintenance exceptions, late-checkout reminders, payment
     reviews, and handoff items while preventing duplicates;
   - preserve the original file, parsed values, confidence, validation changes, and import audit.
7. **Cash, Folio, and Audit Exceptions**
   - shift drawer opening/closing, paid outs, deposits, over/short, chargebacks, routing errors, tax
     exemptions, unsettled folios, and manager approval;
   - PCI-sensitive data must remain tokenized and excluded from logs and AI prompts.

### 4.3 AI front-desk automation

- Build a role-based opening briefing 15 minutes after scheduled shift start by default, with a user-
  selectable time.
- Read approved PMS, task, message, email, phone, maintenance, housekeeping, inventory, and report
  sources; keep each source separated and offer a cross-source executive summary.
- Classify calls/messages into guest request, incident, complaint, vendor, reservation, billing, or
  informational categories.
- Draft responses and suggested next actions with confidence and original-source links.
- Detect duplicate guest requests and merge them without losing source history.
- Identify likely service recovery cases and suggest compensation, but require authorized approval.
- Convert spoken or typed instructions into a preview of structured records before committing.
- Provide a manual “Create record” path for every automated intake workflow.

### 4.4 Digital front-desk reporting

Build a dedicated report catalog:

- shift activity and handoff report;
- incident register with severity, category, location, injury, damage, status, and recurrence;
- pet occupancy, fee-posting, service-animal handling, damages, and cleaning impact;
- additional-item requests by item, quantity, room, employee, fulfillment time, and cost;
- guest request volume, SLA, fulfillment, cancellation, and repeat contact;
- room move, early check-in, late checkout, and fee realization;
- wake-up call request and completion;
- arrivals/departures and rooms-not-ready impact;
- complaint, recovery action, compensation, and follow-up;
- lost and found custody chain;
- cash over/short and night-audit exceptions;
- calls/messages/emails by connected source, category, response time, and outcome.

Every summary must drill to the underlying transaction, source message/report, task, attachments, and
audit record. Support date comparison, saved views, scheduled delivery, CSV/XLSX/PDF export, and export
audit.

## 5. AAIQ Inventory & Procurement

### 5.1 Scope

Cover housekeeping, laundry, maintenance, front desk, restaurant/bar, marketplace, banquet, pool,
office, and safety inventories. The current detergent/linen cards must become an operational ledger,
not remain a reorder demonstration.

### 5.2 Master data

Each item requires:

- property, storage location, department, category, SKU, barcode/QR, name, description, image;
- base unit, purchase unit, issue unit, conversion factors, pack size;
- on-hand, available, committed, on-order, par, minimum, maximum, reorder point, and safety stock;
- average, last, standard, and replacement cost;
- preferred and alternate vendors, lead time, contract price, tax, freight, and minimum order;
- lot/batch, expiration, hazardous/SDS, serial, warranty, and criticality where applicable;
- active/inactive and substitute relationships.

### 5.3 Operational workflows

Implement:

1. opening balances and physical counts;
2. barcode/QR mobile scanning and offline count sheets;
3. issue-to-department, issue-to-room/task, return, waste, damage, transfer, and adjustment;
4. department requisition → approval → sourcing → purchase order → dispatch → partial/full receipt →
   inspection → discrepancy → invoice match → close;
5. vendor quotation comparison and contract pricing;
6. three-way match among PO, receipt, and invoice;
7. cycle counts driven by risk and discrepancy;
8. linen lifecycle: clean, in-use, soiled, laundry, damaged, lost, vendor laundry, and condemned;
9. chemical usage tied to rooms cleaned and task type;
10. maintenance parts tied to asset/work order and warranty recovery;
11. stock transfer among buildings, storerooms, departments, and properties;
12. manual emergency purchase with after-the-fact approval.

Never alter `createdAt` to reset an SLA or erase ledger history. Inventory quantities must be derived
from immutable movements or updated atomically with an accompanying movement.

### 5.4 Predictive procurement

- Forecast demand using occupancy, arrivals/departures, room types, banquet covers, restaurant covers,
  seasonality, events, historical usage, lead time, open POs, waste, and safety stock.
- Recommend order date, quantity, vendor, expected cost, and stockout risk.
- Detect abnormal usage, shrinkage, duplicate POs, price variance, late vendors, and slow-moving stock.
- Auto-create a draft requisition or PO only under approved rules. Submission requires the configured
  spending authority.
- If integrations fail, generate a vendor-ready PDF/email draft and manual submission checklist.
- Prevent duplicate open orders for the same replenishment requirement.

### 5.5 Inventory reports

- stock position and valuation;
- par/reorder/stockout projection;
- usage per occupied room, room cleaned, cover, event, task, and department;
- linen circulation, loss, damage, and replacement;
- chemical usage and cost;
- movement ledger and adjustment audit;
- requisition/PO/receipt/invoice lifecycle;
- open commitments and cash requirement;
- vendor price, fill rate, quality, lead time, and on-time delivery;
- waste, shrinkage, expiration, and slow/nonmoving stock;
- budget versus actual and purchase price variance.

## 6. AAIQ User & Access Management

### 6.1 User lifecycle

Implement:

- invite, create, bulk import, activate, suspend, transfer, terminate, archive, and rehire;
- employee ID, contact methods, property/department/job/manager, employment status, language,
  certifications, shift eligibility, notification preferences, and emergency access;
- multiple property and department assignments with effective dates;
- temporary, vendor, contractor, and service-account identities;
- username recovery, password reset by verified email/SMS, MFA enrollment/recovery, session management,
  trusted devices, and forced sign-out;
- future HNE identity mapping fields so accounts can be migrated rather than recreated.

Never retrieve or transmit a user's existing password. Password reset must issue a single-use,
short-lived recovery token after identity verification.

### 6.2 Access model

- RBAC roles plus tab/action/record/field-level permissions;
- scope permissions by enterprise, company, brand, region, property, department, and own records;
- role templates with property overrides and inherited locks;
- separation of duties for payroll, payments, tax filings, vendor approval, user administration,
  report export, credential vault, and public publishing;
- access request and approval workflow;
- time-bound elevated access with automatic expiration;
- impersonation only for authorized support, with banner and full audit.

### 6.3 Administration experience

- matrix view: users × modules/tabs/actions;
- “effective access” explanation showing inherited and direct grants;
- compare two users/roles;
- simulate access before publishing;
- detect excessive, conflicting, dormant, and orphaned access;
- scheduled access review/certification by managers;
- one-click revoke across sessions, API keys, vault grants, and assignments;
- manual override path for every AI recommendation.

### 6.4 AI assistance

Allow an admin to say, “Create a front desk associate starting Monday on the 3–11 shift.” AI should
produce a preview containing role, property, department, manager, schedule, modules, training, and
missing fields. It must not create the user or send an invitation until the admin confirms.

AI should recommend least-privilege access based on job template, detect access anomalies, and explain
every recommendation. It must never autonomously promote a user, reset MFA, or grant vault/financial
permissions.

### 6.5 User-management reports

- active/suspended/invited/dormant accounts;
- role, property, department, and effective-access inventory;
- MFA enrollment and recovery events;
- login failures, session activity, and unusual access;
- access requests, approvals, overrides, and expirations;
- termination/offboarding completeness;
- segregation-of-duties violations;
- quarterly access certification.

## 7. AAIQ Property & Asset Registry

### 7.1 Canonical hierarchy

Model:

`Property → Building → Wing → Floor → Space → Room → Asset → Component`

Spaces include guestrooms, corridors, stairwells, pool, fitness center, restaurant/bar, kitchen,
banquet rooms, meeting rooms, laundry, storage, mechanical, offices, parking, grounds, and life-safety
zones.

### 7.2 AI property builder

Accept text, voice, guided wizard, spreadsheet, PDF, image, or video instructions. Example:

> Build Wyndham Garden Salina Conference Center at 2110 W Crawford St, Salina, Kansas, with 105 rooms.

AI must:

1. parse known facts;
2. search existing property data to prevent duplicates;
3. propose buildings, floors, room numbering, room types, public spaces, departments, and templates;
4. apply configurable standard room-asset templates such as HVAC/PTAC, TV, iron, ironing board,
   coffee maker, hair dryer, telephone, refrigerator, microwave, smoke detector, lock, and furniture;
5. ask only material unresolved questions;
6. show a full validation preview with counts, exceptions, and estimated record creation;
7. commit atomically after administrator approval;
8. retain a creation plan and rollback package.

The admin must be able to add, edit, remove, merge, move, bulk-update, or deactivate every generated
record subject to referential-integrity rules.

### 7.3 Asset records

Include:

- asset tag, QR/barcode, category, manufacturer, model, serial number, image, and location;
- purchase/install/in-service dates, cost, depreciation fields, useful life, condition, criticality;
- warranty provider, terms, expiration, documents, claims, and contacts;
- vendor/service contract, manuals, SOPs, safety procedures, parts, meters, and readings;
- preventive-maintenance plan, inspection templates, compliance requirements, work history, downtime,
  total maintenance cost, energy usage, and replacement score;
- parent/child components and room-standard template variance.

Maintenance managers need mobile camera/file capture, OCR of model/serial labels, warranty extraction,
duplicate detection, and a review queue before saved data becomes authoritative.

### 7.4 Automation

- create preventive-maintenance schedules from asset type, manufacturer guidance, regulation, usage,
  season, and property policy;
- automatically create work orders before due dates;
- escalate missed life-safety and compliance inspections;
- identify repeated failures and recommend repair-versus-replace;
- detect warranty coverage before issuing a paid repair;
- predict parts and labor requirements and create inventory reservations;
- transition room/space status when an asset failure affects sellability or safety;
- provide manual creation/import and override whenever AI or integration is unavailable.

### 7.5 Property and asset reports

- hierarchy completeness and unassigned spaces/assets;
- room inventory by type/status/features;
- asset inventory, condition, age, warranty, criticality, and replacement forecast;
- preventive-maintenance compliance, overdue work, downtime, MTBF, MTTR, repeat failures;
- repair-versus-replace and lifecycle cost;
- energy and utility performance;
- warranty claims and recovered cost;
- fire/life-safety and inspection compliance;
- asset evidence/document completeness.

## 8. AAIQ Reporting requirements for every module

Use one generic contract:

`GET /api/v1/reports/{reportId}?from=&to=&property=&department=&employee=&groupBy=&drill=&compare=`

Required capabilities:

- real-time event-fed summaries with a freshness timestamp;
- date presets and custom ranges;
- prior period/prior year/budget comparison;
- property, department, employee, room, asset, source, status, priority, and custom-field filters;
- click summary → grouped detail → transaction → source record;
- saved personal/team views with RBAC scope;
- schedule by shift, hourly, daily, weekly, monthly, or custom recurrence;
- email, SMS summary/link, in-app, and downloadable delivery;
- CSV, XLSX, and PDF export with export audit;
- row-level and field-level security;
- data dictionary, metric definition, calculation, exclusions, and source freshness;
- no invented figures; incomplete data must be visibly labeled.

## 9. Automation and manual fallback matrix

For every automation, implement these states:

`RECEIVED → VALIDATING → READY_FOR_AUTOMATION → NEEDS_REVIEW → APPROVED → EXECUTING → SUCCEEDED`

Exception states:

`LOW_CONFIDENCE`, `MISSING_DATA`, `INTEGRATION_UNAVAILABLE`, `PERMISSION_REQUIRED`, `FAILED`,
`MANUAL_IN_PROGRESS`, and `CANCELLED`.

The manual fallback screen must contain:

- original source;
- extracted fields and confidence;
- fields requiring correction;
- recommended action and reason;
- editable form;
- save draft, approve, reject, retry, or assign to another user;
- troubleshooting and step-by-step help;
- complete audit trail.

Never silently drop failed automation. Send failures to an exception queue with owner, severity, retry
policy, and escalation.

## 10. Security and governance

- Enforce tenant and property isolation in database queries, not only UI.
- Encrypt credentials and sensitive fields with managed keys; never return stored secrets to clients.
- Use a vault reference rather than embedding credentials in module tables.
- Require MFA for administrators, financial approvals, vault access, report exports, and corporate data.
- Validate uploads by type, size, malware status, and tenant; use signed access URLs.
- Redact payment-card, government-ID, health, and unnecessary guest data from AI prompts and logs.
- Record all access, exports, permission changes, AI decisions, overrides, and public/external actions.
- Define retention and legal-hold rules for incidents, employee records, guest data, and attachments.
- Provide backup, restore, offline queue, replay, idempotency, and disaster-recovery tests.

## 11. Implementation order

### Phase 0 — Discovery and preservation

- Produce the capability matrix and screenshots/routes for all existing functions.
- Identify hidden functionality and link it from the canonical navigation.
- Map duplicate schemas and routes; choose one canonical implementation.
- Baseline build, tests, migrations, performance, and accessibility.

### Phase 1 — Shared foundations

- persistent application shell and context;
- canonical workflow/status history;
- task assignment and evidence;
- event/outbox and audit;
- notifications and exception queue;
- generic reporting and saved views;
- upload/document service.

### Phase 2 — Digital Front Desk vertical slice

Deliver incident creation through closure and reporting first. Then pet registry, guest/additional-item
requests, pass-on log, night report intake, and audit exceptions.

### Phase 3 — Team Operations vertical slice

Deliver assignment → acknowledgment → checklist → evidence → AI verification → rework/approval →
completion → report.

### Phase 4 — Inventory vertical slice

Deliver item/location master → count → issue to task → threshold → requisition → approval → PO →
receipt → ledger/report. Add AI forecasting only after the ledger is reliable.

### Phase 5 — User and access vertical slice

Deliver lifecycle, MFA/recovery, access matrix, effective access, certification, and HNE migration map.

### Phase 6 — Property and assets vertical slice

Deliver AI property preview → approved creation → room/space hierarchy → standard assets → mobile asset
capture → preventive maintenance → lifecycle reports.

### Phase 7 — Intelligence and optimization

Add cross-module forecasting, anomaly detection, daily role briefings, executive roll-ups, and continuous
improvement using accepted/rejected AI recommendations.

## 12. Required test and acceptance evidence

Do not release a phase without:

- unit, integration, API authorization, migration, and representative browser tests;
- tenant isolation and cross-property denial tests;
- mobile/responsive and keyboard accessibility checks;
- upload, offline, retry, duplicate-event, and integration-failure tests;
- AI low-confidence, hallucination, missing-data, correction, approval, and manual fallback tests;
- report drill-down reconciliation back to source transactions;
- performance plan for queries above 500 ms;
- deployment health check and documented rollback.

Business acceptance scenarios:

1. A front-desk associate records a guest injury, attaches evidence, pages the manager, completes
   follow-up, and exports a complete incident package without losing revision history.
2. A towel request becomes one task, reaches the correct employee, deducts inventory only after
   delivery, and appears in request and inventory reports.
3. A pet room automatically appears on the housekeeping briefing and cleaning plan while service-animal
   privacy rules are respected.
4. A housekeeping employee completes a room with required photos; AI identifies a missed bathroom
   deficiency, returns exact rework instructions, and a supervisor can verify or override.
5. A maintenance employee photographs a repaired asset; AI checks the completion evidence, updates the
   asset history, and triggers warranty/parts follow-up when applicable.
6. A cycle count detects detergent below safety stock, creates one draft requisition, obtains approval,
   receives a partial shipment, and reconciles the final invoice without duplicate purchasing.
7. An admin describes a new employee; AI prepares a least-privilege user configuration, but no account
   or invitation is created until confirmation.
8. An admin describes a 105-room property; AI generates a reviewable hierarchy and standard asset plan,
   asks only unresolved questions, and commits or rolls back atomically.
9. Every dashboard number drills to its underlying records, and every record links to source evidence.
10. When an integration or AI service is unavailable, the user receives a prefilled manual workflow;
    no request disappears and no unauthorized action occurs.

## 13. Definition of done

A module is done only when it is discoverable in navigation, retains the persistent shell, is usable
on desktop and mobile, persists real data, enforces authorization, supports automation and manual
fallback, emits events, produces drill-down reports, writes audit history, includes help, passes tests,
and is deployed with a verified health check.

Maintain a visible completion ledger with:

- `Implemented`
- `Verified`
- `Partial`
- `Designed`
- `Blocked`

Do not describe a feature as live, real-time, AI-powered, secure, integrated, or complete unless the
corresponding implementation and verification evidence exists.
