# Release 125 beginner test guide

## Before testing

Use the staging/pilot deployment, sign in through Cloudflare Access, complete the AAIQ time-clock/PIN gate, and confirm the correct property in the persistent header. Do not use real guest checks or a real accounting posting during initial UAT.

## Digital Employee Authority & Signals

1. Open **Technology & Control → AAIQ Digital Employees**.
2. Open **Authority & signals**.
3. Choose a Digital Employee. Confirm every capability says **Autonomous**, **Propose only**, or **Human required**, and explains whether it is reversible.
4. Attempt to save an irreversible capability as Autonomous. The server must reject it.
5. As an administrator, subscribe a role to a signal topic. Publish a clearly labeled synthetic UAT event.
6. Open the topic drill-down and confirm the event, freshness, source, subscriber and audit history match.
7. Remove or expire the event and confirm the UI reports unavailable/stale instead of inventing a condition.

## Cashier flow

1. Open **Hotel Operations → AAIQ Cash & Check Custody**.
2. Start a UAT shift drop. Enter expected cash from a synthetic report/manual evidence reference.
3. Enter each bill/coin quantity. The counted total and variance must recalculate from denominations; it must not accept a typed total.
4. Add a test check with a masked check number, payer, amount, and a private-document reference if configured.
5. Submit the drop. Confirm the system displays a custody receipt and prevents silent editing.

## Manager flow

1. Sign in as a property administrator and open **Manager verification**.
2. Select the submitted drop and recount cash independently.
3. Enter received check total. Confirm variance compares against the employee-submitted custody total.
4. If any variance exists, leave the resolution blank: verification must be rejected.
5. Enter a factual resolution note and verify. Confirm verifier, timestamp and immutable audit receipt appear.
6. Open **Reports** and drill from the session/variance total to denominations, checks and verification evidence.

## Isolation and failure checks

Switch properties and confirm the first property's drops never appear. Disable storage or use a missing private check-document reference and confirm a clear error/manual fallback—never a false success. No test should create a GL entry, bank deposit, payment, or external message.

