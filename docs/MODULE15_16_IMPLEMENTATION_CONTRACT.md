# AAIQ Modules 15–16 implementation contract

This release adds measurement and progressive autonomy without weakening existing AAIQ safeguards.

## Invariants

- Every record is scoped by organization and property.
- New duties begin at `ASSISTED`; no duty silently self-promotes.
- Physical work, legal sign-off, life-safety response, HR discipline, contract/capital approval, and final alcohol-compliance decisions are permanently excluded from autonomous execution.
- A critical evaluation failure or confirmed critical shadow finding demotes autonomy immediately.
- Promotion requires at least 50 executions, 30 days, a trust score of 95, no critical failures, and explicit human approval.
- All schema changes are migrations 0058 and 0059. No request handler creates or alters schema.
- R2/media is intentionally not part of the two-property pilot.

## Role coverage

Front Desk, Housekeeping, Maintenance, Accounting, Night Auditor, NetOps, Food & Beverage, Sales/Revenue, and General Manager duties are classified as digital, hybrid, or permanently human-reserved. The existing Role Parity inventory remains authoritative; eval cases reference its role and task codes rather than creating another task catalog.

## Pilot defaults

All numeric authority ceilings remain unset until an authorized administrator records a real business limit. An unset ceiling cannot execute. Shadow sampling begins at 100 percent. Financial, public publishing, surveillance, access-control, safety, legal, employment, and irreversible actions remain approval-gated.

