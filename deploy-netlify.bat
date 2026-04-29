@echo off
REM ═══════════════════════════════════════════════════════════════════════════
REM  One-click deploy to Netlify project: vahdam-marketing-mailer-architect
REM  Double-click this file after every change. Or run from PowerShell.
REM ═══════════════════════════════════════════════════════════════════════════

setlocal
cd /d "%~dp0"

echo.
echo ====================================================
echo  VAHDAM Mailer Studio - Netlify Deploy
echo ====================================================
echo.

REM Check if Netlify CLI is installed
where netlify >nul 2>&1
if errorlevel 1 (
  echo [SETUP] Netlify CLI not found. Installing...
  echo.
  call npm install -g netlify-cli
  if errorlevel 1 (
    echo.
    echo ERROR: npm install failed. Make sure Node.js is installed:
    echo   https://nodejs.org/
    echo.
    pause
    exit /b 1
  )
)

REM Check if site is linked
if not exist ".netlify\state.json" (
  echo [SETUP] First-time setup. Linking this folder to your Netlify site...
  echo.
  echo You will be asked to:
  echo   1. Authorize the Netlify CLI ^(opens browser^)
  echo   2. Select "Link this directory to an existing site"
  echo   3. Pick: vahdam-marketing-mailer-architect
  echo.
  pause
  call netlify login
  call netlify link
)

echo.
echo [DEPLOY] Pushing latest files to production...
echo.
call netlify deploy --prod --dir=.

echo.
echo ====================================================
echo  Deploy complete. Live URL above.
echo ====================================================
echo.
pause
