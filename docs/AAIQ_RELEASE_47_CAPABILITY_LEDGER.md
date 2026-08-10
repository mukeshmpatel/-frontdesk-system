# AAIQ Release 47 Capability Ledger

## Boundary

This ledger covers only the independent AAIQ hosted application. No HNE repository, branch, pull request, workflow, database, credential, deployment, or Codex process was inspected or changed.

## Release 47 delivery status

| Capability | Canonical route/module | Status | Persistence | Property scope | Authorization | Reporting/audit | Verification |
|---|---|---|---|---|---|---|---|
| Protected enterprise sample catalog | `/aaiq-sample-lab` | IMPLEMENTED | D1 template and clone tables | Template plus cloned property UUID | Admin mutation guard | Clone audit records | Build and source tests passed |
| Clone sample into editable environment | `POST /api/v1/sample-environments` | IMPLEMENTED | Atomic D1 batch | New canonical property | Admin only | Clone audit record | Build and source tests passed |
| Immutable original samples | `PATCH/DELETE /api/v1/sample-environments` | VERIFIED | Database lock and API rejection | Global protected template | Admin cannot mutate original | Rejection response | Automated test passed |
| Sample company and property | Sample Environment Library | IMPLEMENTED | Canonical property and hierarchy | Dedicated cloned property | Inherited assignment | Clone audit | Automated test passed |
| Sample staff and roles | Sample Environment Library | IMPLEMENTED | Staff and property assignments | Cloned property | Role data included | Clone audit | Automated test passed |
| Sample 105-room asset registry | Sample Environment Library | IMPLEMENTED | Building, floors, rooms, equipment | Cloned property | Admin clone action | Counts exposed in preview | Automated test passed |
| Sample operational work | Sample Environment Library | IMPLEMENTED | Work orders | Cloned property | Existing workflow policies | Source-linked sample records | Build passed |
| Sample inventory | Sample Environment Library | IMPLEMENTED | Locations and item stock | Cloned property | Existing access model | Sample report facts | Build passed |
| Sample AI agents | Sample Environment Library | PROTOTYPE | Agent registry | Cloned property | Risk/approval metadata | Agent definitions recorded | Build passed; runtime execution pending |
| Sample website project | Website Factory data | PARTIAL | Website project and pages | Cloned property | Admin clone action | Project source retained | Build passed; visual editor/publishing pending |
| Sample social connections | Social sandbox data | PROTOTYPE | Sandbox connection metadata only | Cloned property | No production secrets | Audit-ready metadata | Build passed; provider adapter pending |
| Sample report facts | Reporting sample data | PARTIAL | Persisted facts | Cloned property | Property scoped | Drill-down seed records | Build passed; universal report UI pending |

## Existing canonical module assessment

| Module | Status | Immediate gap |
|---|---|---|
| Application shell and property context | PARTIAL | Complete API-level property denial coverage and stale-response protection |
| Team Operations | PARTIAL | Migrate remaining combined legacy view to role-focused boards |
| Digital Front Desk | PARTIAL | Complete incident, pet, request, night-report and source-specific reports |
| Housekeeping | PARTIAL | Complete offline queue and production image-verification adapter |
| Maintenance | PARTIAL | Complete guided repair library, warranty and return-to-service approval |
| Compliance | PARTIAL | Expand PMI templates, jurisdiction rules and evidence packages |
| Inventory & Procurement | PARTIAL | Finish immutable movement ledger and PO/receipt/invoice lifecycle |
| Reporting | PARTIAL | Complete event-fed universal four-level drill-down |
| Website Factory | PARTIAL | Embed professional visual editor, approval, publishing, ZIP and rollback |
| Social Vault | PROTOTYPE | OAuth/vault adapters, approvals, scheduling and provider-result tracking |
| Memory Agent | PARTIAL | Add governed two-to-three-year source-resolved retrieval |

## Definition used

- **VERIFIED**: behavior has automated or runtime evidence.
- **IMPLEMENTED**: code and persistence exist, but production runtime evidence may still be pending.
- **PARTIAL**: meaningful implementation exists but the enterprise workflow is incomplete.
- **PROTOTYPE**: safe test-data implementation, not production integration.
- **BLOCKED**: requires credentials, policy approval, or infrastructure not present.

