# AAIQ Enterprise Pilot — Release 113

## Evidence-gated readiness

Pilot tasks can no longer be made Ready by selecting a status, assigning an owner, or typing a note. Ready is derived only from trusted, property-scoped system evidence. A manual exception may be saved as Not started, Remind me later, Blocked, or Skip for this pilot. A skip requires a review date and expires.

Connection tasks are verified against the connector certification ledger for the active property. The accepted states are `HEALTH_CHECK_PASSED`, `SANDBOX_CERTIFIED`, and `PRODUCTION_ENABLED`. Missing credentials or provider evidence leaves the task incomplete and does not enable an external action.

Every readiness task links to its real configuration workspace. Credential material belongs only in the secure integration form—never in readiness notes, screenshots, or audit descriptions.

## Digital Employee model

The Digital Employees share one property-scoped, audited operations engine. They are separate role experiences and workflows, not three copies of one generic screen.

### AAIQ Digital Housekeeping Supervisor

- Automatically imports room-status work from verified reports, prioritizes turnover rooms, creates assignments, tracks room states, checks required photo/evidence areas, and opens maintenance work when a defect is reported.
- A user can ask: “Show today’s priority rooms,” “Which rooms are missing evidence?”, “What could delay check-in?”, “Create a maintenance ticket for room 214,” or “Summarize the shift.”
- Flow: source report → room queue → assignment → physical cleaning by staff → evidence → supervisor verification.

### AAIQ Digital Maintenance & Engineering Supervisor

- Automatically receives issues, classifies urgency, builds a work queue, assigns authorized staff, records parts and before/after evidence, tracks lifecycle state, and escalates safety or overdue work.
- A user can ask: “Show emergency and overdue work,” “Triage this HVAC issue,” “Assign the next available technician,” “What parts are needed?”, or “Summarize unresolved room-impacting issues.”
- Flow: issue intake → risk triage → assignment → physical repair by staff → evidence → manager verification.

### AAIQ Digital Compliance Coordinator

- Automatically monitors active templates and due dates, creates property-scoped assignments, guides required inspection steps, checks evidence completeness, tracks exceptions, and preserves an audit-ready record.
- A user can ask: “What is due this week?”, “Start the pool inspection,” “Which items lack evidence?”, “Escalate overdue exceptions,” or “Prepare the compliance summary.”
- Flow: rules and due dates → asset targeting → guided inspection → evidence → remediation → auditable close.

## Human boundary

Digital Employees coordinate, verify, document, remind, and escalate. They do not physically clean rooms, repair equipment, perform a legal inspection, sign a regulatory attestation, execute payments, unlock doors, or take irreversible safety actions. Those steps remain assigned to an authorized person; AAIQ resumes the workflow when proof is recorded.

## Verification

- Full production build passes.
- Migration verification passes for all 62 forward-only migrations.
- Capability collision checks pass.
- 196 automated tests pass, including Release 113 evidence-gate and role-flow coverage.

