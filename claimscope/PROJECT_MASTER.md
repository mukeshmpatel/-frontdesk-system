# ClaimScope Command Center — Master Project Record

## Purpose
ClaimScope converts the commercial-property insurance claim into a structured, line-by-line collaboration system so the insured, Sedgwick/carrier reviewers, J.S. Held/consultants, contractors, and counsel do not have to rely on long email chains.

## Canonical architecture
- Frontend source: `claimscope/` in this repository.
- Owner page: `claimscope/owner.html`.
- Reviewer page: `claimscope/review.html`.
- Public landing page: `claimscope/index.html`.
- Production data/API: Supabase project `zggmmqbyvxznmvqadvdk`.
- Owner API: `claimscope-owner-api`.
- Reviewer API: `claimscope-reviewer`.
- Static production-host fallback: GitHub Pages workflow `.github/workflows/claimscope-pages.yml`.
- Netlify project may be used only after a deploy is independently verified; do not treat an empty/current deploy as production.
- Vercel deployments are not canonical while project-scope authentication causes external reviewer login/protection.

## Product boundaries
### Owner / Insured portal
May view and manage the full claim record, including internal strategy, AI recommendations, measurement verification, invoices, payments, depreciation, and email preparation.

### External reviewer portal
May view only exposed carrier/J.S. Held position, insured supplemental request, intentionally exposed evidence, invoice/payment information needed for review, and may submit a clear disposition. It must never expose insured-only AI recommendations, strategy notes, or private legal/negotiation notes.

## Scope response statuses
- Approved
- Partially Approved
- Denied
- Under Review
- Need More Information

Partial approval, denial, and need-more-information responses require an explanation.

## Financial workflows
### Invoices
Track invoice number, vendor/payee, description, amount, date, submitted date, status, carrier-approved amount, insured notes, carrier notes, and related attachments.

### Payments
Track invoice association, payment date, method, check/reference number, amount, notes, and source side. Support multiple and partial payments.

### Depreciation
Track RCV, ACV, depreciation withheld, recovered amount, remaining recoverable amount, status, deadline, recovery notes, and insured-only AI recovery recommendations.

## Email workflow
A material change should offer `Prepare & Send Email`. The system prepares concise To/CC/Subject/Body content and hands off to the device's normal mail client via `mailto:`. ClaimScope does not require reviewers to authorize Gmail or Outlook. Email preparation is logged.

## Security model
- Long random invitation token plus separate 6-digit PIN.
- Token is not stored in frontend source.
- Server-side token/PIN validation.
- 5 failed PIN attempts trigger a 15-minute lockout.
- Access records can expire or be revoked.
- Owner and reviewer credentials are separate.
- Reviewer API returns only reviewer-safe fields.
- Finalized response history is append-only/superseding rather than destructive replacement.
- Service-role credentials remain server-side only.

## Current seeded claim rows
The current seven rows are controlled starter records for high-priority issues and are not a complete claim estimate:
1. Courtyard ceiling/grid corrosion.
2. Water-exposed electrical detach/reset.
3. Low-voltage/internet/cameras/sound.
4. Regency operable partitions.
5. Wood dance floor.
6. HVAC/courtyard units and diagnostic inspection.
7. Detach/reset handling, mobility and storage/general conditions.

## Production-release gate
Do not tell the owner to use or share a production link until all of these are verified:
1. HTTP page renders normally on desktop and mobile.
2. Owner token + PIN opens Owner portal.
3. Reviewer token + PIN opens Reviewer portal without hosting-provider login.
4. Invalid PIN fails and lockout works.
5. Reviewer cannot retrieve owner-only AI/internal fields.
6. Scope response saves and persists after refresh.
7. Owner readback shows latest reviewer response.
8. Invoice creation persists.
9. Reviewer invoice disposition persists.
10. Partial/multiple payments reconcile.
11. Depreciation withheld/recovered/remaining totals reconcile.
12. Owner-only recovery guidance remains private.
13. Email handoff creates correct subject/body/recipients.
14. Direct-page refreshes do not 404.
15. No secret credentials are present in repository/frontend.

## Rule against fragmentation
This file is the canonical project ledger. Any future ClaimScope chat, branch, hosting experiment, or implementation must first read this file and update it rather than creating a competing project plan or duplicate architecture.
