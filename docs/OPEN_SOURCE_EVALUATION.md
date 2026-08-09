# AAIQ Open-Source Evaluation and Adoption Gate

Open-source components are evaluated as replaceable adapters behind AAIQ identity, property scope, approvals, audit, reporting, and manual fallback. None may redefine AAIQ’s source of truth.

| Candidate | Proposed use | Adoption state | Key gate |
|---|---|---|---|
| OpenAI Agents SDK for TypeScript 0.13.5 | Governed agent/tool runtime | IMPLEMENTED | Runtime works locally; production model calls require a vault-backed API key |
| LangGraph.js 1.4.8 | Durable pause/resume workflows and connector health orchestration | IMPLEMENTED | Embedded workflow is active and audited |
| Qdrant JS client 1.18.0 | Semantic/hybrid retrieval index | IMPLEMENTED_NOT_CONNECTED | Authoritative local memory and keyword fallback work; semantic mode requires a Qdrant endpoint and embedding key |
| GrapesJS 0.23.3 | Website Factory visual editor | IMPLEMENTED | BSD-3-Clause; wrapped in AAIQ hospitality blocks, revisions, approval and sanitized publishing |
| Postiz | Approval-controlled social scheduling adapter | IMPLEMENTED_NOT_CONNECTED | Draft/approval/manual fallback work; publishing requires a governed endpoint and API key |
| Apache Superset | Optional report visualization | IMPLEMENTED_NOT_CONNECTED | Health and read-only dashboard-summary adapter implemented; AAIQ retains authorization and metrics |
| Chatwoot | Optional shared communication inbox | IMPLEMENTED_NOT_CONNECTED | Health and read-only conversation-summary adapter implemented; account ID, endpoint and token required |
| QloApps | Isolated hospitality product benchmark | RESEARCH_ONLY | No code adoption before architecture and license review |

## Mandatory adoption record

Before installation, add the exact version, SPDX license, official source, commercial-use implications, dependencies, security advisories, paid-edition limitations, deployment footprint, data export path, upgrade owner, and replacement plan to the Open-Source Bill of Materials.

## Architecture decisions

1. PostgreSQL/D1 operational records remain authoritative; vector and visualization systems are projections.
2. AAIQ owns identity, property context, authorization, approvals, audit, exceptions, and source reconciliation.
3. Provider credentials are stored only as vault references and are never returned to clients.
4. Public, financial, regulatory, permission, credential, and destructive actions require configured human approval.
5. Every adapter must have a manual fallback and an export/replacement path.

## Release 48 verified adoption

GrapesJS 0.23.3 is the first production-adopted component. AAIQ supplies the property data, hospitality blocks, authorization, persistence, revisions, approval and publishing layer. GrapesJS supplies the visual canvas. Saved public HTML is stripped of scripts, inline event handlers, JavaScript URLs, CSS imports and injected style tags before rendering.

## Release 50 governed adapters

OpenAI Agents SDK and LangGraph are embedded behind AAIQ property scope, tracing and approval rules. Qdrant memory preserves authoritative records in AAIQ and supports a property-filtered local search fallback until semantic infrastructure is connected. Postiz accepts only administrator-approved drafts. Superset and Chatwoot expose read-only summary synchronization, never authoritative business writes. External systems remain visibly `CONFIGURATION_REQUIRED` until their endpoint and vault-backed credential pass a live health check.
