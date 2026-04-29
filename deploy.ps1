# ═══════════════════════════════════════════════════════════════════════════
#  VAHDAM® Mailer Studio — One-command Netlify deploy (PowerShell)
#  Usage:  .\deploy.ps1
#  Or right-click → "Run with PowerShell"
#
#  Reads NETLIFY_AUTH_TOKEN from environment if set, otherwise uses the value
#  baked in below. To override:
#    $env:NETLIFY_AUTH_TOKEN = "nfp_..."
#    .\deploy.ps1
# ═══════════════════════════════════════════════════════════════════════════

# ── Config ──────────────────────────────────────────────────────────────────
$SiteId = "ba6e6175-0d05-4a3e-9228-36c08f2855c8"
# Use env var if set; otherwise fall back to embedded token (rotate this if leaked)
$Token = if ($env:NETLIFY_AUTH_TOKEN) { $env:NETLIFY_AUTH_TOKEN } else { "nfp_CFXJSrGCgpvC5xZnmZPhNSX6y2Lc3ch6cc2a" }

# ── Paths ───────────────────────────────────────────────────────────────────
$Src   = $PSScriptRoot
$Stage = Join-Path $env:TEMP "vahdam-deploy-stage"
$Zip   = Join-Path $env:TEMP "vahdam-deploy.zip"

Write-Host ""
Write-Host "════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host " VAHDAM® Mailer Studio — Netlify Deploy" -ForegroundColor Green
Write-Host "════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host ""

# ── 1. Stage clean files (only production files, no drafts) ─────────────────
Write-Host "[1/4] Staging clean files…" -ForegroundColor Cyan
if (Test-Path $Stage) { Remove-Item $Stage -Recurse -Force }
New-Item -ItemType Directory -Path $Stage | Out-Null

Copy-Item (Join-Path $Src "vahdam_mailer_architect_v23.html") (Join-Path $Stage "vahdam_mailer_architect_v23.html")
if (Test-Path (Join-Path $Src "netlify.toml")) {
  Copy-Item (Join-Path $Src "netlify.toml") (Join-Path $Stage "netlify.toml")
}

# Auto-generated index.html that redirects to the studio
@'
<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<title>VAHDAM® Mailer Studio</title>
<meta http-equiv="refresh" content="0; url=/vahdam_mailer_architect_v23.html">
<link rel="canonical" href="/vahdam_mailer_architect_v23.html">
</head><body style="font-family:DM Sans,sans-serif;text-align:center;padding:60px;color:#004A2B">
<p>Loading <a href="/vahdam_mailer_architect_v23.html" style="color:#AB8743">VAHDAM® Mailer Studio</a>…</p>
</body></html>
'@ | Set-Content (Join-Path $Stage "index.html") -Encoding UTF8

$staged = Get-ChildItem $Stage
Write-Host "      Staged $($staged.Count) files: $(($staged | Select-Object -ExpandProperty Name) -join ', ')" -ForegroundColor Gray

# ── 2. Compress to zip ──────────────────────────────────────────────────────
Write-Host "[2/4] Compressing…" -ForegroundColor Cyan
if (Test-Path $Zip) { Remove-Item $Zip -Force }
Compress-Archive -Path "$Stage\*" -DestinationPath $Zip -Force
$zipKB = [math]::Round((Get-Item $Zip).Length / 1KB, 1)
Write-Host "      Created $zipKB KB archive" -ForegroundColor Gray

# ── 3. Upload to Netlify ────────────────────────────────────────────────────
Write-Host "[3/4] Uploading to Netlify…" -ForegroundColor Cyan
$uri = "https://api.netlify.com/api/v1/sites/$SiteId/deploys"
$headers = @{
  "Authorization" = "Bearer $Token"
  "Content-Type"  = "application/zip"
}

try {
  $deploy = Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -InFile $Zip -TimeoutSec 180
  Write-Host "      Deploy ID: $($deploy.id)" -ForegroundColor Gray
} catch {
  Write-Host ""
  Write-Host "✗ Upload failed: $($_.Exception.Message)" -ForegroundColor Red
  if ($_.ErrorDetails.Message) { Write-Host "  $($_.ErrorDetails.Message)" -ForegroundColor Red }
  exit 1
}

# ── 4. Poll until live ──────────────────────────────────────────────────────
Write-Host "[4/4] Waiting for build to finish…" -ForegroundColor Cyan
$pollUri = "https://api.netlify.com/api/v1/sites/$SiteId/deploys/$($deploy.id)"
$pollHeaders = @{ "Authorization" = "Bearer $Token" }
$tries = 0
do {
  $tries++
  Start-Sleep -Seconds 3
  $status = Invoke-RestMethod -Uri $pollUri -Method Get -Headers $pollHeaders
  Write-Host "      [$tries] $($status.state)" -ForegroundColor DarkGray
} while ($status.state -notin @('ready','error') -and $tries -lt 20)

Write-Host ""
if ($status.state -eq 'ready') {
  Write-Host "════════════════════════════════════════════════════" -ForegroundColor Green
  Write-Host " ✓ DEPLOY LIVE" -ForegroundColor Green
  Write-Host "════════════════════════════════════════════════════" -ForegroundColor Green
  Write-Host ""
  Write-Host "  Live:     $($status.ssl_url)" -ForegroundColor White
  Write-Host "  Permalink: $($status.deploy_ssl_url)" -ForegroundColor Gray
  Write-Host "  Admin:    $($status.admin_url)/deploys/$($deploy.id)" -ForegroundColor Gray
  Write-Host ""
  # Open in browser
  Start-Process $status.ssl_url
} else {
  Write-Host "✗ Deploy failed (state=$($status.state))" -ForegroundColor Red
  if ($status.error_message) { Write-Host "  Reason: $($status.error_message)" -ForegroundColor Red }
  Write-Host "  Logs: $($status.admin_url)/deploys/$($deploy.id)" -ForegroundColor Yellow
  exit 1
}
