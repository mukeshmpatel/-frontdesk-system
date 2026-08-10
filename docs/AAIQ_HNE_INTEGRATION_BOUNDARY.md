# AAIQ ↔ HNE Integration Boundary

AAIQ is the hosted intelligence and role-experience layer. HNE remains the canonical enterprise core.

## AAIQ owns

- Agent workspaces and governed tool use
- Organizational memory and retrieval experience
- Web research with citations and approval
- Role briefings and decision intelligence
- Automation approval and manual fallback experience
- Website, marketing, social, review, and reporting experiences
- Department-focused PWAs that consume shared contracts

## HNE owns

- Identity, MFA, and canonical RBAC
- Enterprise/property hierarchy
- Reservations/PMS and operational transaction truth
- Accounting, procurement, workforce, assets, maintenance, and compliance truth
- Documents/evidence, integration gateway, and capability registry

## Contract rules

1. AAIQ consumes versioned HNE APIs and append-only events.
2. AAIQ never accepts database bindings or credentials from browser input.
3. Every synchronized entity carries `hne_entity_type`, `hne_entity_id`, `hne_sync_status`,
   `hne_sync_version`, `hne_last_synced_at`, `source_system`, `source_record_id`, and `conflict_status`
   when that integration is introduced.
4. AAIQ does not silently redefine HNE states or financial logic.
5. Reusable business logic migrates only through a separately approved HNE GitHub task.
6. This release performs no HNE repository, branch, pull-request, CI, or workflow action.

