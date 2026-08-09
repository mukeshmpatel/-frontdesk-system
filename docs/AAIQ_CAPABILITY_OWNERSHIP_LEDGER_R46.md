# AAIQ Capability and Ownership Ledger — Release 46 Foundation Slice

Last reviewed: 2026-07-27  
Baseline preserved: Release 45 / source commit `9143b54`  
Scope: hosted AAIQ intelligence layer only. No HNE repository, branch, CI workflow, or pull request is in scope.

## Classification standard

- **VERIFIED** — implemented and exercised by build/test evidence in this release.
- **IMPLEMENTED_NOT_VERIFIED** — code path exists but requires a configured external integration or production acceptance.
- **PARTIAL** — a usable path exists but the enterprise lifecycle is incomplete.
- **PROTOTYPE** — demonstrates a concept but is not an enterprise workflow.
- **BROKEN** — route or workflow is known not to produce the intended result.
- **HIDDEN** — working capability exists but is not sufficiently discoverable.
- **HNE_OWNED** — canonical business logic belongs in HNE; AAIQ may consume it through governed contracts.
- **AAIQ_OWNED** — intelligence, orchestration, memory, research, approval experience, or role-focused presentation belongs in AAIQ.
- **MIGRATION_CANDIDATE** — reusable logic should move through normal HNE review later.

## Boundary and capability ledger

| Capability | Canonical route/data | State before R46 | R46 state | Owner | Next evidence |
|---|---|---:|---:|---|---|
| Persistent application shell | `AaiqAppShell` | PARTIAL | VERIFIED | AAIQ_OWNED | Browser acceptance on mobile |
| Property selector | `property_contexts`, `/api/operations/front-desk` | PARTIAL | IMPLEMENTED_NOT_VERIFIED | HNE_OWNED contract / AAIQ experience | Production Days Inn acceptance |
| Days Inn identity | asset root + website project | BROKEN | PARTIAL: explicit preview/apply workflow | HNE_OWNED identity | Administrator applies preview |
| Asset hierarchy | `property_assets` | IMPLEMENTED_NOT_VERIFIED | PARTIAL: canonical `property_id` binding added | HNE_OWNED | Migration reconciliation counts |
| Team Operations | `/property-operations` | PARTIAL | PARTIAL: manager command center retained | Shared | End-to-end task acceptance |
| Housekeeping | `/housekeeping` | PARTIAL | PARTIAL | HNE_OWNED workflow / AAIQ role app | Offline and AI evidence acceptance |
| Maintenance | `/maintenance` | PARTIAL | PARTIAL | HNE_OWNED workflow / AAIQ role app | Asset-specific repair acceptance |
| Compliance | `/compliance-center` | PARTIAL | PARTIAL | HNE_OWNED workflow / AAIQ guidance | Jurisdiction and PMI certification |
| Digital Front Desk | `/digital-front-desk` | PARTIAL | PARTIAL | Shared | Incident closure/export acceptance |
| Inventory & Procurement | `/property-intelligence` | PARTIAL | PARTIAL | HNE_OWNED ledger / AAIQ forecast | Count-to-PO acceptance |
| Enterprise Reporting | `/reports`, generic `/api/v1/reports/:reportId` | PARTIAL | PARTIAL | Shared | Four-level drill reconciliation |
| Review Intelligence | `/aaiq-review-center` | PARTIAL | PARTIAL | AAIQ_OWNED | Live connector publication test |
| OTA reconciliation | `/aaiq-ota-reconciliation` | PROTOTYPE | PROTOTYPE | HNE_OWNED financial truth | Credentialed OTA sandbox |
| Website Factory | `/aaiq-website-factory`, `/site-preview/:slug` | PARTIAL/BROKEN preview linkage | VERIFIED build; production acceptance pending | AAIQ_OWNED | Reconcile Days Inn and publish test |
| Social and advertising command center | Website Factory Growth tab | PROTOTYPE | PARTIAL | AAIQ_OWNED | OAuth provider connector |
| Tax Center | `/aaiq-tax-center` | PARTIAL | PARTIAL | AAIQ assistance / HNE accounting | Jurisdiction configuration and approval |
| User & Access | `/aaiq-user-management` | PARTIAL | PARTIAL | HNE_OWNED identity / AAIQ admin experience | MFA and recovery acceptance |
| Memory Agent | `/memory-agent` | PARTIAL | PARTIAL | AAIQ_OWNED | 2–3 year retention/index proof |
| Connected Sources | `/accounts`, Google APIs | PARTIAL | IMPLEMENTED_NOT_VERIFIED | AAIQ_OWNED connector experience | OAuth acceptance |
| Automation Center APIs | `/api/v1/automation-center` | HIDDEN/PARTIAL | PARTIAL | AAIQ_OWNED | Canonical exception queue UI |
| Real-time OS service | `services/realtime-os` | IMPLEMENTED_NOT_VERIFIED | unchanged | MIGRATION_CANDIDATE | Separate deploy/integration contract |

## Routes and source domains

- Operations: front desk records, property workflows, time, shifts, employees, settings, locations, intelligence.
- Intelligence: reports, notifications, memory, automation rules, review processing, tax preparation, website/growth.
- Administration: access management, staff invites, property assets, connected sources.
- External integration candidates: Google, PMS/OHIP, OTA, Twilio, lock/HVAC gateways, suppliers, social and advertising platforms.
- Storage bindings: D1 operational database (`DB`) and R2 document/evidence storage (`MEDIA`).

## Data defects confirmed in discovery

1. Website projects without `property_context_id` could trigger silent canonical property creation.
2. Asset roots and canonical properties could represent the same hotel without an explicit binding.
3. Work orders, evidence, steps, compliance templates, and night-report imports lacked canonical property scope.
4. Organization-wide workflow queries could expose Wyndham records after switching to another authorized property.
5. Website Factory presented a form and project list rather than a professional portfolio/editor lifecycle.

## Release 46 changes

- Removed silent Website Factory property creation.
- Added explicit reconciliation plan, approval, audit, and rollback metadata.
- Added stable property binding for asset roots and descendants.
- Added property-scoped fields and indexes for legacy work-order/evidence domains.
- Added property-filtered Team Operations workflow reads.
- Added Website Factory portfolio, readiness states, professional live editor, revision history, approval request, and publish gates.
- Preserved existing public preview and Growth Command Center paths.

## Completion ledger

| Slice | State |
|---|---|
| Release 45 preservation | VERIFIED |
| Capability and ownership ledger | VERIFIED |
| Days Inn reconciliation preview | VERIFIED in code; production application pending administrator approval |
| Canonical property migration | IMPLEMENTED_NOT_VERIFIED |
| Legacy property columns/indexes | VERIFIED by build; migration deployment pending |
| Property-filtered workflow reads | VERIFIED by build |
| Website Factory professional portfolio/editor | VERIFIED by build |
| Social Vault 2.0 | DESIGNED, not claimed complete |
| Long-term autonomous agents | DESIGNED, not claimed complete |
| Reporting 3.0 | PARTIAL, next coherent slice |

