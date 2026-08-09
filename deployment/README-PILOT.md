# AAIQ canonical sample pilot deployment

This package deploys the recovered AAIQ application to the existing Cloudflare Worker and D1 database. It intentionally has no R2 binding: media upload controls fail closed while all text, workflow, reporting, governance, and configuration records use D1.

Release 127 Windows package note: the root `build/sites-vite-plugin.ts` file is required source code. The deployment script checks for it before installing or migrating anything and stops with a clear replacement-package message if an incomplete archive is used.

Release 127 keeps that evidence-backed readiness engine and adds one protected canonical sample property. The sample includes editable hotel identity, rooms, assets, staff roles, inventory, cash source evidence, hiring records, inbox conversations, a website draft, reports, and clickable Digital Employees. Prior pilot properties are archived—not deleted—when an administrator activates the sample.

## Run on the Windows laptop

1. Extract the ZIP to a normal folder such as `Documents\AAIQ-Pilot`.
2. Install Node.js 22 LTS or newer if `node --version` does not work.
3. In the extracted folder, right-click `deployment\Deploy-AAIQ-Pilot.ps1` and choose **Run with PowerShell**. If Windows blocks local scripts, open PowerShell in that folder and run:
   `powershell -ExecutionPolicy Bypass -File .\deployment\Deploy-AAIQ-Pilot.ps1`
4. Complete the Cloudflare browser sign-in if requested.
5. Paste the **Audience (aud)** value shown by Cloudflare Access. This is an identifier, not a password or API token.
6. Accept the default team domain `mukeshmp.cloudflareaccess.com` unless your Zero Trust team domain is different.
7. Let the script install, verify the complete empty-database migration package, migrate, build, and deploy. Do not close the window while it runs.
8. Open `https://aaiq-enterprise-pilot.mukeshmp.workers.dev` in an InPrivate/Incognito window. Cloudflare Access must appear before AAIQ.
9. Open **AAIQ Sample Environments** and choose **Activate perfect sample workspace** once. This archives prior active pilot scopes without deleting their records, activates the sample, and seeds its governed demonstration data.
10. Open **AAIQ Digital Employees**, choose a role card, and issue a text or voice command. Use **AAIQ Pilot Launch Center** for evidence-backed readiness checks and cloning the verified sample into an editable property.

The script never requests a Cloudflare password, OTP, recovery code, or API token. Wrangler performs authentication in Cloudflare's own browser flow.

The script prints **Deployment complete** only after every dependency, verification, migration, build, and deployment command exits successfully. Any failure stops the process before later stages.

## Batch 3 cash reconciliation deployment check

The deployment package must include migration `0074_cash_daily_reconciliation.sql`, the D1 `DB` binding, and the `*/15 * * * *` scheduled trigger. After deployment:

1. Sign in through Cloudflare Access.
2. Open **AAIQ Cash & Check Custody** for each pilot property.
3. Confirm property shift policy and the local scheduled run time.
4. Import a representative authorized report using this minimum format:

   ```csv
   business_date,shift,cash_amount,reference
   2026-08-03,AM,125.25,OPERA-AM-001
   2026-08-03,PM,84.50,OPERA-PM-001
   2026-08-03,NIGHT,0.00,OPERA-NIGHT-001
   ```

5. Complete an employee shift count and a different manager's recount.
6. Confirm the daily total opens shift detail and exact source rows.
7. Confirm a missing report displays `SOURCE_UNAVAILABLE` without a guessed amount.
8. Confirm a controlled variance creates a canonical task and, after the policy window, one manager escalation.

No live PMS connection, accounting posting, bank deposit, payment, refund, or public check media is enabled by this workflow.
