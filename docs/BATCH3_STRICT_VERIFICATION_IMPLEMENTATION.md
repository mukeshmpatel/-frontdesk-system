# AAIQ Batch 3 — Strict Verification Baseline Implementation

Date: 2026-08-03  
Scope: capability truth and verification controls only  
Application preserved: `release123-rebuild`; no HNE core repository was modified.

## Outcome

AAIQ now distinguishes source-code presence, structural health, simulated behavior, credential blockers, incomplete wiring, and human-verified workflow outcomes. The interface and database no longer permit a structural route/schema check to become functional proof.

The reproducible baseline contains **517** discovered capability records:

| Item class | Count |
|---|---:|
| Canonical modules | 33 |
| Visible JSX buttons | 407 |
| Digital Employee duties | 23 |
| Integrations and channels | 34 |
| Enterprise reports | 20 |

| Truth status | Count |
|---|---:|
| `working_verified` | 0 |
| `working_incomplete` | 456 |
| `ui_shell` | 24 |
| `blocked_credentials` | 35 |
| `simulated` | 2 |
| `broken` | 0 |

Zero is the correct initial verified count. A human reviewer—not Codex—must review a stored passing workflow run before any item can become `working_verified`.

## Implemented controls

1. `capability_ledger` stores every discovered item, its owning module, truthful status, known gap, evidence reference, reviewer, and verification time.
2. A database constraint rejects `working_verified` when reviewer identity, verification time, or evidence path is missing.
3. `workflow_verification_runs` stores the seven required workflow answers, failure-case result, audit URL, and reviewer decision.
4. `digital_employee_duties` and `digital_employee_work_queue` provide the persisted contract required before a Digital Employee duty can be executed and verified.
5. `/api/v1/capability-ledger` seeds and reads the baseline and permits only an authenticated administrator to record human review.
6. The navigation uses ledger-derived labels such as Preview, Configuration required, Simulated, or Verified. Static `LIVE` and `AI` marketing badges were removed.
7. AAIQ Quality Center is now **AAIQ Truth & Verification Center**. Structural probes are visibly labeled **not functional proof** and are never combined with functional verification.
8. The ledger can be regenerated with `npm run capability-ledger:generate`.

## Verification performed

These results prove build and structural integrity only:

- Production application build: passed.
- Existing regression/code checks: 243 passed, 0 failed.
- Migration-chain replay: 74 migrations applied and the preservation record remained intact.
- Capability collision check: 33 navigation entries, 149 migration tables, 5 canonical owners; passed.
- New strict-truth checks: baseline class coverage, no self-verification, database verification gate, structural/functional separation, and truthful navigation all passed.

They do **not** prove any hotel business workflow is functionally complete.

## Next permitted workflow

Per the Batch 3 constitution, breadth remains frozen. The next implementation is Workflow 1: Cash Reconciliation, and only that workflow. It must produce:

1. Trigger evidence.
2. Authorized input evidence.
3. Decision evidence.
4. Real action or controlled tool result.
5. Business-outcome verification.
6. Human-openable audit evidence.
7. Failure and escalation evidence.

Only after Mukesh reviews that evidence may the Cash Reconciliation capability be changed to `working_verified`. Housekeeping Departure Chain follows after Cash; Maintenance Defect Chain follows after Housekeeping.
