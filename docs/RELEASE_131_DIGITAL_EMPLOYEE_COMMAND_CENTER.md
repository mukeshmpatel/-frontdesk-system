# Release 131 — Digital Employee Command Center

Release 131 makes AAIQ's existing certified Digital Employees observable and safely controllable from Agent Studio. It extends the canonical `digital_employee_work_queue`; it does not create a second task, permission, reporting, or agent system.

## Operator workflow

1. Open **Agent Studio → Digital Employee Command Center**.
2. Choose a person-style employee card and select **Start Shift** or **Assign Duties**.
3. Follow the live **Perceive → Reason → Act → Verify → Report** meter. Every step is backed by a stored execution event, plain-language reasoning, policy reference, and source link.
4. Use **Pause**, **Take Over**, **Edit / Redirect**, or **Reassign** only at the displayed safe checkpoint. The checkpoint and external-effect idempotency key are preserved so resumption cannot silently repeat work.
5. Review low-confidence or policy-boundary work before Act. Approval cases use the existing approval pipeline.
6. Review correction patterns. A correction can create a proposed playbook change, but behavior changes only after an administrator approves a new version.

## Role coverage

The Phase 10 hotel roles remain active, with explicit restaurant operations for Restaurant Manager, Host / Reservations, Server Support, Kitchen Expediter, and Bar Inventory. These roles map to the six existing canonical agents and retain the same financial, legal, employment, safety, public-action, physical-presence, and credential boundaries.

## Recovery carried forward

- Release 129: corrected D1 clone binding parity for guest-room area, inbox thread identity, and Digital Employee registry status.
- Release 130: route-level and root-level render recovery, malformed-response tolerance already present in critical launch flows, and safe browser-storage helpers.

## Acceptance evidence

Run `npm test`. The release gate verifies migration continuity, collision safety, production build output, Phase 11 lifecycle/control/learning contracts, Release 129 clone bindings, and Release 130 recovery surfaces. A real property go-live remains controlled by the existing Pilot Launch evidence and GO / NO-GO workflow.
