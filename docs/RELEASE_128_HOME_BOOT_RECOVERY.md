# AAIQ Enterprise Release 128 — Home Boot Recovery

## Outcome

Release 128 repairs the blank AAIQ home page without replacing the preserved application, deleting either property, or changing the production schema.

The home route was running canonical sample-workspace provisioning during every page request. That request-time mutation could fail during server rendering and leave the browser with an empty application surface. Canonical sample activation remains available through its explicit governed API action, but it no longer runs merely because a user opens AAIQ Home.

## Repairs

- Removed request-time canonical sample activation from `app/page.tsx`.
- Kept existing property, employee, asset, module, and D1 records intact.
- Added a visible home recovery surface with a support reference when workspace data cannot be loaded.
- Added application loading and error-boundary screens so a server or client render failure cannot appear as an unexplained blank page.
- Retained the explicit `ACTIVATE_CANONICAL_SAMPLE` API action for authorized sample-environment setup.
- Aligned the packaged Cloudflare deployment toolchain with Wrangler 4.118 and the current Workers types.
- Added regression coverage that prevents sample provisioning from returning to the home-page read path.

## Verification

- Complete application suite: 288/288 tests passed.
- Production vinext/Workers build passed.
- Forward-only migration replay passed with 84 applied migrations plus the preserved Release 68 prerequisite record.
- Capability collision check passed across 33 navigation entries, 182 migration tables, and five canonical owners.
- Capability inventory regenerated: 596 items. No item is falsely promoted to `working_verified` without business UAT evidence.

The sandbox could not complete a socket-bound browser session against the local Worker. Server-bundle dispatch and the complete automated build/test/migration gates were used instead. After deployment, perform the short Cloudflare Access smoke test below.

## Deploy from Windows PowerShell

From the extracted Release 128 folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\deployment\Deploy-AAIQ-Pilot.ps1
```

Use the existing Cloudflare Access Audience (`aud`) value when prompted. The deployment remains text-only; media/R2 is not enabled.

## Post-deployment smoke test

1. Open `https://aaiq-enterprise-pilot.mukeshmp.workers.dev` in an Incognito/InPrivate window.
2. Complete Cloudflare Access sign-in.
3. Confirm AAIQ Home displays. If its data cannot load, confirm the visible recovery screen appears instead of a blank page.
4. Open AAIQ Sample Environments and confirm the canonical sample is still explicit and editable.
5. Open one Hotel Operations module and one Technology & Control module to confirm navigation and active-property context.

## Preservation and safety

This release does not modify HNE Core or GitHub, does not delete or replace production D1 data, and does not silently activate live integrations, payments, public publishing, surveillance, or irreversible actions.
