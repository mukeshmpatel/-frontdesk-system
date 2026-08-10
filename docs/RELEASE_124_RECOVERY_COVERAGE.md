# AAIQ Release 124 — Recovered Requirements Coverage

## Preservation and implementation contract

Release 123 remains the preserved base. Release 124 extends the canonical Workforce Lifecycle and Master Inbox capabilities; it does not replace HNE core, create a second communications service, or touch GitHub. All external publishing, messages, terminations, provider account changes, recording, financial actions, device changes, and public review actions remain approval- or credential-gated.

## Completion ledger

| Recovered requirement | Status | Evidence / honest boundary |
|---|---|---|
| Digital Employee roles, authority and evaluation | Implemented / verified foundation | Agent Studio, Quality Center, Modules 15–16, role-parity tests. A DE only knows connected, authorized, fresh sources; it cannot invent live PMS, market, device, or financial facts. |
| External weather and market context | Implemented / partial sources | Growth Platform uses live National Weather Service data with explicit degradation; internal operating trends are canonical. FRED/EIA and event feeds still require provider configuration. |
| Hiring, job descriptions and channel drafts | Implemented in R124 | Workforce Lifecycle prepares property-aware descriptions and one draft per target. No external post occurs without approval and a connected provider. Google discovery uses a public careers page plus valid JobPosting structured data, not a fictional “post to Google” API. |
| Onboarding, role templates, access locker and custody | Implemented in R124 | One-click role blueprint prepares digital access and physical custody items. Credentials and asset serial numbers are never invented. |
| Corrective action, write-up and termination documents | Implemented in R124 | Factual, approval-gated document records. Termination remains a human decision. Approved separation suspends AAIQ access and queues external revocations/returns. Protected administrators cannot be removed through this workflow. |
| Cash and check drops / manager dual custody | Data foundation / verified | Release 119 schema and deterministic tests exist. Full cashier and manager UI, scanner adapter, and posting workflow remain the next vertical slice. |
| Email attachments and OPERA scheduled-report ingestion | Data foundation / verified | Release 120 preserves object key, checksum, extraction schema, validation, idempotent draft action. Provider mailbox ingestion and property-specific extraction templates require configuration. |
| Energy, smart thermostat/switch and Dish TV messages | Data foundation / verified | Release 121 has device, policy, proposal, rollback, savings evidence, and approval-gated TV drafts. Real execution requires supported device/TV provider credentials and a property safety policy. |
| Room photo/video inspection | Implemented / adapter partial | Video Intelligence has governed audits, evidence zones, findings, approvals and operations routing. Real model/media execution needs private object storage and approved provider configuration. |
| Multilingual voice commands | Partial | Capture/voice foundations exist. Language-specific speech recognition, confirmation prompts, and end-to-end Gujarati/Hindi/Spanish UAT are not yet certified. |
| UniFi / GDMS planning and Digital Engineer | Partial | Governed Integration Center and operational planning foundations exist. Read-only inventory, network/phone maps, provider sandboxes, change preview, rollback, and live device audits require credentials and hardware-specific UAT. |
| Wedding Planner, Event Manager, Banquet Coordinator | Implemented / verified | Release 123 Event Workforce creates a lead, portfolio, five tasks, discovery document and acknowledgment draft; pricing, contract, deposits and sends remain approved. |
| Selfie, geofence, timing and face match | Data foundation / partial | Release 122 records private evidence, liveness and face-verification status. Facial matching is not claimed until private media, consent, threshold, bias/accuracy testing, retention and HR/legal review are configured. |
| Review Manager and recovery | Implemented with compliant boundary | Review Center/Reputation Journey can follow up and recover issues. AAIQ must not suppress public-review opportunity based on sentiment or rating; all guests receive a fair opportunity. |
| Email/SMS privacy and shared accounts | Implemented foundation / provider partial | Master Inbox is property-scoped with same-source reply and approvals; Access Center owns role/module access. Gmail has a governed path. SMS and other providers require credentials. |
| Event contracts, banquet packets and lead response | Implemented draft workflow / partial templates | Event Workforce prepares approval drafts and tasks. Counsel-approved contract template packs and e-signature/delivery providers remain configuration dependencies. |
| Front-desk and phone conversation recording | Implemented governance / adapter blocked | R124 adds disabled-by-default phone and ambient policies, legal-review evidence, explicit notice and consent, visible indicator, retention, session and findings custody. Audio retention needs private storage; UCM import/API or secure AAIQ capture client is not yet connected. |

## Digital Employee operating limits

Digital Employees can read authorized property data, prepare reports and documents, classify messages, create drafts/tasks, reconcile deterministic records, monitor configured sources, recommend actions with evidence, and execute only actions allowed by their current autonomy policy. They cannot perform physical work, legal sign-off, emergency response, hiring/firing decisions, irreversible high-cost commitments, unapproved financial/public actions, or access systems without credentials. They also cannot know current events, weather, rates, inventory, calls, cameras, or market conditions unless an authorized source is connected and fresh. A source outage must produce an explicit unavailable/stale state, never a fabricated answer.

## Conversation recording safety boundary

Front-desk ambient audio is materially more privacy-sensitive than a PBX call recording. It must never be covert or always-on. The R124 control requires an administrator to record a legal/privacy review reference, use an all-party notice-and-consent policy, display an active indicator, record consent/decline, stop on decline, and enforce retention. This is a technical safeguard, not legal advice; the property should have counsel review multi-state calling, employee notice, union/workplace rules, accessibility, minors, payment-card redaction, and public-space expectations before activation.

## Next coherent slice

Build the Cash & Check Custody Center end to end: cashier denomination entry, expected-versus-counted reconciliation, check capture into private storage, sealed drop handoff, manager recount, variance resolution, immutable audit, drill-down reports, and manual/OPERA report fallback. No accounting posting should execute without an approved integration.
