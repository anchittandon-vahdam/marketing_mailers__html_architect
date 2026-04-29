# =============================================================
#  VAHDAM Mailer Studio -- One-command update pipeline
#  Runs:  git add -> git commit -> git push (if remote set) -> Netlify deploy
#  Usage:  .\update.ps1 "describe what changed"
#       or .\update.ps1                        (auto-generated message)
# =============================================================

param(
  [string]$Message = ""
)

# -- Config -----------------------------------------------------
$SiteId = "ba6e6175-0d05-4a3e-9228-36c08f2855c8"
$Token  = if ($env:NETLIFY_AUTH_TOKEN) { $env:NETLIFY_AUTH_TOKEN } else { "nfp_CFXJSrGCgpvC5xZnmZPhNSX6y2Lc3ch6cc2a" }
$LiveUrl = "https://vahdam-marketing-mailer-architect.netlify.app"

# -- Paths ------------------------------------------------------
$Src   = $PSScriptRoot
$Stage = Join-Path $env:TEMP "vahdam-deploy-stage"
$Zip   = Join-Path $env:TEMP "vahdam-deploy.zip"

Set-Location $Src

# Auto-generate commit message if none provided
if (-not $Message) {
  try {
    $build = (Select-String -Path "$Src\vahdam_mailer_architect_v23.html" -Pattern "__VAHDAM_BUILD__='([^']+)'" | Select-Object -First 1).Matches[0].Groups[1].Value
  } catch { $build = "auto" }
  $Message = "Update -- build $build at $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host " VAHDAM Mailer Studio -- Update Pipeline" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Message: $Message" -ForegroundColor Gray
Write-Host ""

# -- 1. Git add + commit ----------------------------------------
Write-Host "[1/5] Committing changes to git..." -ForegroundColor Cyan
git add -A 2>$null
$changes = (git status --porcelain | Measure-Object).Count
if ($changes -eq 0) {
  Write-Host "      No changes to commit (working tree clean)" -ForegroundColor DarkGray
} else {
  $commitOut = git commit -m $Message 2>&1
  Write-Host "      $($commitOut[-1])" -ForegroundColor DarkGray
}

# -- 2. Git push (if remote configured) -------------------------
$remote = git remote 2>$null
if ($remote) {
  Write-Host "[2/5] Pushing to GitHub remote '$remote'..." -ForegroundColor Cyan
  $pushOut = git push origin HEAD 2>&1
  if ($LASTEXITCODE -eq 0) {
    Write-Host "      Pushed" -ForegroundColor DarkGreen
  } else {
    Write-Host "      Push failed (continuing with Netlify deploy):" -ForegroundColor Yellow
    Write-Host "        $($pushOut -join '; ')" -ForegroundColor DarkYellow
  }
} else {
  Write-Host "[2/5] No GitHub remote -- skipping push" -ForegroundColor DarkGray
}

# -- 3. Stage clean files for deploy ----------------------------
Write-Host "[3/5] Staging deploy bundle..." -ForegroundColor Cyan
if (Test-Path $Stage) { Remove-Item $Stage -Recurse -Force }
New-Item -ItemType Directory -Path $Stage | Out-Null

Copy-Item (Join-Path $Src "vahdam_mailer_architect_v23.html") (Join-Path $Stage "vahdam_mailer_architect_v23.html")
if (Test-Path (Join-Path $Src "netlify.toml")) {
  Copy-Item (Join-Path $Src "netlify.toml") (Join-Path $Stage "netlify.toml")
}

$indexHtml = '<!DOCTYPE html>' + "`n" +
'<html><head>' + "`n" +
'<meta charset="UTF-8">' + "`n" +
'<title>VAHDAM Mailer Studio</title>' + "`n" +
'<meta http-equiv="refresh" content="0; url=/vahdam_mailer_architect_v23.html">' + "`n" +
'<link rel="canonical" href="/vahdam_mailer_architect_v23.html">' + "`n" +
'</head><body style="font-family:DM Sans,sans-serif;text-align:center;padding:60px;color:#004A2B">' + "`n" +
'<p>Loading <a href="/vahdam_mailer_architect_v23.html" style="color:#AB8743">VAHDAM Mailer Studio</a>...</p>' + "`n" +
'</body></html>'
Set-Content (Join-Path $Stage "index.html") -Value $indexHtml -Encoding UTF8

if (Test-Path $Zip) { Remove-Item $Zip -Force }
Compress-Archive -Path "$Stage\*" -DestinationPath $Zip -Force
$zipKB = [math]::Round((Get-Item $Zip).Length / 1KB, 1)
Write-Host "      Bundle: $zipKB KB" -ForegroundColor DarkGray

# -- 4. Upload to Netlify ---------------------------------------
Write-Host "[4/5] Deploying to Netlify..." -ForegroundColor Cyan
$uri = "https://api.netlify.com/api/v1/sites/$SiteId/deploys"
$headers = @{
  "Authorization" = "Bearer $Token"
  "Content-Type"  = "application/zip"
}
try {
  $deploy = Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -InFile $Zip -TimeoutSec 180
  Write-Host "      Deploy ID: $($deploy.id)" -ForegroundColor DarkGray
} catch {
  Write-Host "X Netlify upload failed: $($_.Exception.Message)" -ForegroundColor Red
  if ($_.ErrorDetails.Message) { Write-Host "  $($_.ErrorDetails.Message)" -ForegroundColor Red }
  exit 1
}

# -- 5. Poll until live -----------------------------------------
Write-Host "[5/5] Waiting for deploy..." -ForegroundColor Cyan
$pollUri = "https://api.netlify.com/api/v1/sites/$SiteId/deploys/$($deploy.id)"
$pollHeaders = @{ "Authorization" = "Bearer $Token" }
$tries = 0
do {
  $tries++
  Start-Sleep -Seconds 3
  try { $status = Invoke-RestMethod -Uri $pollUri -Method Get -Headers $pollHeaders } catch {}
  Write-Host "      [$tries] state=$($status.state)" -ForegroundColor DarkGray
} while ($status.state -notin @('ready','error') -and $tries -lt 20)

Write-Host ""
if ($status.state -eq 'ready') {
  Write-Host "================================================" -ForegroundColor Green
  Write-Host " LIVE: $LiveUrl" -ForegroundColor Green
  Write-Host "================================================" -ForegroundColor Green
  Write-Host ""
  Write-Host "  Permalink: $($status.deploy_ssl_url)" -ForegroundColor Gray
  Write-Host "  Admin:     $($status.admin_url)/deploys/$($deploy.id)" -ForegroundColor Gray
  Write-Host ""
} else {
  Write-Host "X Deploy state: $($status.state)" -ForegroundColor Red
  if ($status.error_message) { Write-Host "  $($status.error_message)" -ForegroundColor Red }
  exit 1
}
