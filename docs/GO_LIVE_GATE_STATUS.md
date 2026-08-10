# AAIQ Go-Live Gate Status — Two-Property Pilot Baseline

Date: 2026-08-01  
Status: Configuration-required  
Meaning: the hosted application is live for controlled evaluation, but real production traffic is not certified.

## Gate evidence

| Gate | Status | Evidence |
|---|---|---|
| Release 68 migration chain | Verified | Real baseline source commit `d048dbf`; populated preservation record; 41 migrations replayed |
| Capability ownership and duplicate guards | Verified | `scripts/verify-capability-collisions.mjs`; canonical Communications, Digital Workforce, Operations, Vault, and Video Intelligence owners |
| Five backend-authenticated UAT identities | Implemented | Hashed, expiring, property-scoped sessions and explicit role policies |
| Five rendered authenticated role journeys | Recommended | Browser environment cannot reach the authenticated Sites preview; API/build evidence is not substituted |
| Cross-role/property denials | Implemented | Persisted allow/deny evidence and fail-closed policy tests; rendered browser evidence remains Recommended |
| Digital Employee role parity | Partially Implemented | 15 roles, 62 duties, constrained handoffs, independent 24-case duty evaluations and reports; hosted full-matrix execution remains Recommended |
| Email and SMS contract certification | Verified | Gmail- and Twilio-shaped mocks; no real messages sent |
| Remaining connector certification | Configuration-required | Eight connector families have generic failure harnesses but are not provider-specific sandbox certified; OHIP and Shift4 now have official-source contract mocks |
| Master Inbox adversarial lifecycle | Verified | 14 mock cases including duplicates, receipts, bounce, STOP, quiet hours, and approval risks |
| Video Intelligence pilot | Verified | Simulated feed, mandatory governance, three incident types, and no-double-action recovery tests |
| Document Vault custody drill | Verified | Full simulated custody lifecycle, two-person control, reasoned override, hash-chained export |
| Security and continuity drills | Verified | Isolated UAT restore, provider outage/manual fallback, privileged-change alert |
| Role homes and adoption evidence | Implemented | Five role workspaces, profile Quick Links, source-linked adoption metrics |
| Two-property pilot boundary | Implemented | Wyndham Garden Salina and Days Inn Salina South; shared OHIP contract, property-isolated credentials/evidence, financial autonomy schema-disabled |
| Production credentials and real provider evidence | Configuration-required | Requires authorized business accounts and test tenants |
| Legal policy approval and financial thresholds | Configuration-required | Requires named human/legal decisions |
| Human UAT and go/no-go | Configuration-required | Must be completed by Mukesh and designated operational users |

## Decision

AAIQ Release 86 is suitable for controlled authenticated UAT and configuration work. It must not be represented as certified for real guest messaging, PMS/POS execution, payments, locks, camera surveillance, banking, malware/OCR, or e-signature production traffic until the corresponding provider, legal, risk, and human-acceptance evidence is attached.

`GO_LIVE_READINESS_REPORT.md` is intentionally not created because the mission requires every gate box to be checked first.
