# AAIQ Release 125 — Batch 2 Preservation and Gap Register

## Baseline and method

Release 124 is the preserved baseline. The uploaded Batch 2 pack was compared against the canonical capability registry, routes, APIs, D1 migrations 0000–0070, Digital Employee runtime, Role Parity, Progressive Autonomy, Growth Platform, Workforce Lifecycle, Event Workforce, Master Inbox, Video Intelligence, Review Center, Pilot Launch, and deployment packaging. This release extends existing owners; it does not create replacement products.

Status meanings: **Verified** has executable evidence, **Implemented** has an integrated workflow, **Partial** has a useful foundation but unmet acceptance criteria, and **Blocked** requires an external credential, device, legal decision, or private-media service.

| Uploaded requirement | Existing owner | Status before R125 | R125 decision / remaining boundary |
|---|---|---:|---|
| Digital Employee capability/authority registry | Agent Studio + Role Parity + Progressive Autonomy | Partial | **Extend**, not duplicate. Add a queryable authority catalog, irreversible-action data guard, shared signal topics/subscriptions/events, drill-down action history, and contextual help inside Digital Employees. |
| Hiring, onboarding, job posting, applicants | Hiring & Workforce Lifecycle | Partial | **Extend later**. R124 has role blueprints, job-description/channel drafts, access/custody, employee actions and separation. Applicant intake/stages, real provider distribution, channel retry and hired-to-onboarding automation remain incomplete. |
| Social timing, paid-ad proposals, platform ROI | Online Presence + Growth Platform + Integration Center | Partial | **Merge later** into the existing growth stack. Do not add a second social module. Attribution-quality labels, spend/revenue reconciliation and drill-down campaign evidence remain incomplete. Posting/spend stays approval-gated. |
| Corrective actions, locker, custody, separation | Hiring & Workforce Lifecycle + Access Center | Implemented | Preserve. Provider-side account revocation remains queued until a scoped provider adapter confirms completion. Protected administrator cannot be separated through the workflow. |
| Cash/check drops and manager dual custody | Release 119 cash/check schema + Front Desk | Data only | **Extend in R125** into one end-to-end Cash & Check Custody Center with denomination counting, expected variance, checks, sealed handoff, independent manager recount, variance resolution, reports and audit. No accounting posting executes. |
| Email/report attachment ingestion | Master Inbox + Document Vault + governed ingestion schema | Partial | Preserve. Live mailbox webhook/polling, private binary storage and property-specific OPERA extractors require configuration; downstream actions remain drafts until validated. |
| IoT energy and in-room TV messages | Governed Integrations + energy/guest plan schema | Partial | Preserve. Policies/proposals/rollback/audit exist; live Zigbee, thermostat and Dish endpoints require device inventories, provider adapters and property safety validation. |
| Photo/video inspection and multilingual voice | Video Intelligence + command foundations | Partial | Preserve. Private media/model execution and certified English/Spanish/Gujarati/Hindi speech UAT remain blocked by storage/provider configuration and consent/retention policy. |
| UniFi/GDMS maps and device provisioning | Governed Integrations + Agent Studio system playbooks | Partial | Preserve. Read-only inventory, topology normalization, device sandbox, preview/rollback and hardware UAT require scoped UniFi/GDMS credentials. |
| Wedding/event/banquet Digital Employees | Event Workforce | Implemented | Preserve. Lead, portfolio, five tasks, discovery document and acknowledgment draft work. Counsel-approved contracts, pricing, e-sign and external delivery remain gated. |
| Selfie/geofence/time integrity/face comparison | Workforce Time Clock + presence governance | Partial | Preserve. Do not claim facial identity matching until private storage, liveness, thresholds, bias/accuracy tests, consent, retention and HR/legal approval are configured. |
| Digital Review Manager | Review Intelligence + Guest Journey | Implemented foundation | Preserve compliant universal review invitations and private recovery. Live platform review/rating connectors remain provider-dependent. Never suppress a public-review opportunity based on sentiment or score. |
| Identity/privacy/shared assets/termination access | User & Access + Workforce Lifecycle | Partial | Preserve. AAIQ-side suspension is immediate; true provider-session revocation requires federation or a provider adapter. Shared asset permission tiers need broader provider enforcement testing. |
| Front-desk calls/ambient conversation | Master Inbox conversation governance | Partial / blocked | Preserve disabled-by-default consent/legal/retention controls. UCM/GDMS recording import, private audio storage and transcription remain blocked until legal approval and provider/storage configuration. Ambient recording is never always-on. |
| Testing and training | Autonomous QA + Sample Environments + Pilot Launch | Implemented foundation | Extend help and UAT evidence as each vertical slice is completed. Real credentials start read-only in staging and never appear in documents or source. |

## Release 125 implementation contract

- **Scope:** complete the shared Digital Employee authority/signal foundation and Cash & Check Custody vertical slice.
- **Non-goals:** no live financial posting, public publishing, ad spend, employee discipline decision, biometric decision, device write, audio capture, credential invention, or external message send.
- **Reuse:** Agent Studio, Role Parity, Progressive Autonomy, central audit trail, canonical navigation/RBAC, property context, Front Desk operational records, Document Vault references, Reports drill-down conventions.
- **Hierarchy:** organization and property isolation are mandatory; property selection is retained. Employees can create/submit their own shift custody records; only property administrators verify or resolve.
- **Exceptions:** variance requires a reason; submitted cash cannot be silently edited; manager recount is independent; rejected/returned drops remain visible; check images are references to private storage, never public URLs.
- **AI:** Digital Employees can cite fresh signal events and authority policy. Missing/stale sources display unavailable/stale. AI never marks custody verified or changes expected cash.
- **Security:** RBAC on page/API, server-side authority enforcement, audit on every write, no credentials, private/no-store responses, irreversible+autonomous rejected at the data and service layers.
- **Acceptance:** migrations and rollback pass; build passes; capability collision checks pass; representative authority, signal, cashier, manager, variance and property-isolation tests pass; help and testing guide are updated.

