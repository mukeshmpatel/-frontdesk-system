# AAIQ Enterprise Capability Completion Ledger

Release candidate: Enterprise Operations Foundation

This ledger distinguishes implemented behavior from design intent. `Verified` means the production
build and automated route/source tests pass. External-provider behavior is not called live until the
property supplies credentials and an administrator approves the integration.

| Capability | Status | Evidence / remaining work |
|---|---|---|
| Persistent application shell and scrollable navigation | Implemented · Verified | Shared shell remains on secondary pages; property/user/role context is visible; readability and contrast were increased globally. |
| Multi-property context | Implemented · Verified | Property registry, assignments, tenant/property query boundaries, property selector, and shared-schema isolation are active. |
| Dedicated database per property | Designed · Partial | A property can be configured for `DEDICATED_DATABASE`; it remains `CONFIGURATION_REQUIRED` until an encrypted infrastructure binding is provisioned. No false active state is shown. |
| Shared operational workflow and history | Implemented · Verified | Canonical status transitions, correlation IDs, timestamps, immutable status history, source links, reason codes, outbox events, and report facts are persisted. |
| Automation manual fallback | Implemented · Verified | Exception queue preserves source, extracted fields, missing data, recommendation, owner, retry state, and manual resolution path. |
| AAIQ Digital Front Desk | Implemented · Verified | Property-scoped incidents, pets, guest requests, handoffs, lost/found, audit exceptions, validation, lifecycle transitions, audit history, and report catalog are available in the canonical page. |
| Digital Front Desk critical escalation | Implemented · Partial | Domain events feed the existing notification/escalation foundation. Live SMS/email delivery requires configured provider credentials. |
| Night report intake | Implemented · Verified | Existing upload/preview/commit workflow remains available and creates operational queues without replacing the source artifact. |
| AAIQ Team Operations | Implemented · Verified | Existing housekeeping and maintenance assignment, progress checklist, evidence upload, linked tickets, AI review states, rework, compliance/PMI guidance, and reports are preserved. |
| Live AI image interpretation | Partial | Evidence requirements and review workflow are active. Provider-backed visual inference requires an approved AI connector; manual supervisor verification remains available. |
| AAIQ Inventory & Procurement | Implemented · Verified | Item master, locations, immutable movement ledger, issues, requisitions, draft/approval PO workflow, partial/full receipts, on-order and balance updates are operational. |
| Vendor API ordering and three-way invoice match | Designed · Partial | Approval states and PO/receipt ledger exist. External vendor and invoice connectors require vault credentials and provider-specific adapters. |
| AAIQ User & Access Management | Implemented · Verified | Existing lifecycle, role/department access, module grants, recovery, MFA settings, audit, and AI access advisor are retained. |
| AAIQ Property & Asset Registry | Implemented · Verified | Existing hierarchy, room/floor mapping, asset passports, import, mobile evidence, data-quality review, and setup agent are retained. |
| AI property builder | Implemented · Partial | Existing conversational preview/approval foundation and property context creation are retained. Atomic dedicated-database provisioning remains integration-dependent. |
| AAIQ Reporting | Implemented · Verified | Generic report APIs, source-backed report facts/events, drill-down tokens, saved views, exports, scheduled reports, and source traceability remain active. New front-desk records emit report facts. |
| AAIQ Notifications and Automation Center | Implemented · Verified | Existing notification candidates, source events, rules, approvals, escalation cron, audit, and exception handling remain active. |
| AAIQ Memory Agent | Implemented · Verified | Existing durable memory, source separation, recall, retention controls, and role briefings remain active. |
| Accessibility and visual clarity | Implemented · Verified | Base typography, compact-label minimums, navigation contrast, form sizing, focus visibility, and responsive shell behavior were improved. Full WCAG audit remains a release-hardening activity. |

## Verification record

- Production build: passed.
- Automated source/route tests: 17 passed.
- Migration/source checks: passed.
- ESLint: not release-clean. The repository has 210 existing errors across legacy source and generated
  declaration files, primarily `no-explicit-any`, plus existing React-effect and navigation rules.
  The build and automated tests pass; lint debt remains explicitly open and must not be represented as
  resolved.

## Integration blockers requiring administrator input

1. Dedicated property database binding and encrypted credentials.
2. PMS/OPERA, vendor, payment, email/SMS, and AI-provider credentials in the vault.
3. Approval policies for purchase submission, compensation, regulatory filing, public publishing,
   permission escalation, and other irreversible or financial actions.
4. Property-specific incident retention, service-animal policy, inventory units/par levels, asset
   templates, and compliance schedules.

