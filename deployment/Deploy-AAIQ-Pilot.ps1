$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

function Invoke-Checked {
  param(
    [Parameter(Mandatory=$true)][string]$Label,
    [Parameter(Mandatory=$true)][scriptblock]$Command
  )
  Write-Host $Label -ForegroundColor Yellow
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed with exit code $LASTEXITCODE. AAIQ was not deployed."
  }
}

Write-Host "AAIQ Pilot Deployment" -ForegroundColor Cyan
Write-Host "This deploys the preserved AAIQ application, D1 migrations, and no R2/media binding."

if (-not (Test-Path "$ProjectRoot/build/sites-vite-plugin.ts")) {
  throw "Required build/sites-vite-plugin.ts is missing. Stop and extract the complete Release 127 Windows package before deploying."
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js 22.13 or newer is required. Install it from nodejs.org and run this script again."
}

$NodeMajor = [int]((node --version).TrimStart('v').Split('.')[0])
if ($NodeMajor -lt 22) { throw "Node.js 22.13 or newer is required." }

Write-Host "Signing in to Cloudflare..." -ForegroundColor Yellow
npx wrangler whoami
if ($LASTEXITCODE -ne 0) {
  Invoke-Checked "Opening Cloudflare secure login..." { npx wrangler login }
}

$DatabaseJson = npx wrangler d1 list --json
if ($LASTEXITCODE -ne 0) { throw "Cloudflare D1 lookup failed. AAIQ was not deployed." }
$Databases = $DatabaseJson | ConvertFrom-Json
$Database = $Databases | Where-Object { $_.name -eq "aaiq-enterprise-pilot-db" } | Select-Object -First 1
if (-not $Database) { throw "D1 database aaiq-enterprise-pilot-db was not found in this Cloudflare account." }
$DatabaseId = if ($Database.uuid) { $Database.uuid } else { $Database.id }

$AccessAudience = Read-Host "Paste the Cloudflare Access Audience (aud) value"
if ([string]::IsNullOrWhiteSpace($AccessAudience)) { throw "The Access audience is required for secure pilot sign-in." }
$TeamDomain = Read-Host "Cloudflare Access team domain [mukeshmp.cloudflareaccess.com]"
if ([string]::IsNullOrWhiteSpace($TeamDomain)) { $TeamDomain = "mukeshmp.cloudflareaccess.com" }
$TeamDomain = $TeamDomain.Replace("https://", "").TrimEnd('/')

$Generated = Get-Content "$PSScriptRoot/wrangler.pilot.template.jsonc" -Raw
$Generated = $Generated.Replace("__D1_DATABASE_ID__", $DatabaseId)
$Generated = $Generated.Replace("__CF_ACCESS_AUD__", $AccessAudience.Trim())
$Generated = $Generated.Replace("__CF_ACCESS_TEAM_DOMAIN__", $TeamDomain)
$GeneratedPath = "$PSScriptRoot/wrangler.pilot.generated.jsonc"
[System.IO.File]::WriteAllText($GeneratedPath, $Generated)

$MigrationDir = "$PSScriptRoot/pilot-migrations"
New-Item -ItemType Directory -Force -Path $MigrationDir | Out-Null
Get-ChildItem $MigrationDir -Filter "*.sql" -ErrorAction SilentlyContinue | Remove-Item -Force
Copy-Item "$ProjectRoot/drizzle/*.sql" $MigrationDir
Copy-Item "$ProjectRoot/migrations/baselines/release68_operational_work_orders.sql" "$MigrationDir/0000_000_release68_operational_work_orders.sql"
Copy-Item "$ProjectRoot/migrations/[0-9]*.sql" $MigrationDir

Invoke-Checked "Installing locked dependencies..." { npm ci }
Invoke-Checked "Checking capability ownership..." { npm run capability-collisions:verify }
Invoke-Checked "Verifying the source migration chain..." { npm run migrations:verify }
Invoke-Checked "Verifying the packaged empty-database migration chain..." { node deployment/verify-pilot-migrations.mjs }
Invoke-Checked "Testing governed autonomy, readiness, the canonical sample workspace, and blank-page recovery..." { node --test tests/release107-evals-autonomy.test.mjs tests/release126-autonomous-readiness-engine.test.mjs tests/release127-canonical-sample-workspace.test.mjs tests/release128-home-boot-repair.test.mjs }

$env:WRANGLER_LOG_PATH = ".wrangler/wrangler.log"
Invoke-Checked "Building AAIQ..." { npm run build }
if (-not (Test-Path "$ProjectRoot/dist/server/index.js")) {
  throw "The verified AAIQ Worker entry point was not generated. AAIQ was not deployed."
}
Invoke-Checked "Applying forward-only D1 migrations..." { npx wrangler d1 migrations apply aaiq-enterprise-pilot-db --remote --config $GeneratedPath }
Invoke-Checked "Deploying the protected text-only pilot..." { npx wrangler deploy --config $GeneratedPath }

Write-Host "Deployment complete." -ForegroundColor Green
Write-Host "Open: https://aaiq-enterprise-pilot.mukeshmp.workers.dev"
Write-Host "Test once in an Incognito/InPrivate window to confirm Cloudflare Access appears before AAIQ."
