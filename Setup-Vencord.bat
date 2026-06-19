@echo off
setlocal enabledelayedexpansion

echo ========================================
echo  DiscordSpotifyLyrics - Vencord Setup
echo ========================================
echo.

:: --- CONFIG ---
set "PLUGIN_NAME=discord-spotify-lyrics"
set "VENCORD_REPO=https://github.com/Vendicated/Vencord.git"
set "THIS_DIR=%~dp0"
set "PLUGIN_SRC=%THIS_DIR%"

:: Set working dir to PARENT of plugin folder so Vencord is created alongside it
for %%i in ("%THIS_DIR%") do set "PARENT_DIR=%%~dpi.."
pushd %PARENT_DIR%
set "WORK_DIR=%CD%"
popd

:: --- CHECK: Plugin source exists ---
if not exist "%PLUGIN_SRC%\index.ts" (
    echo [ERROR] Plugin source not found:
    echo         %PLUGIN_SRC%
    echo.
    echo Make sure this .bat file is inside the "%PLUGIN_NAME%" folder.
    pause
    exit /b 1
)

:: --- STEP 1: Clone or update Vencord ---
echo [STEP 1] Cloning / updating Vencord...
echo.

if not exist "%WORK_DIR%\Vencord\.git" (
    echo Vencord not found. Cloning...
    git clone --depth 1 %VENCORD_REPO% "%WORK_DIR%\Vencord"
    if errorlevel 1 (
        echo [ERROR] Failed to clone Vencord.
        pause
        exit /b 1
    )
) else (
    echo Vencord already exists. Pulling latest...
    cd /d "%WORK_DIR%\Vencord" && git pull && cd /d "%WORK_DIR%"
)

:: --- STEP 2: Setup pnpm ---
echo.
echo [STEP 2] Checking pnpm...
echo.

where pnpm >nul 2>&1
if errorlevel 1 (
    echo pnpm not found. Installing via corepack...
    corepack enable
    corepack prepare pnpm@latest --activate
    if errorlevel 1 (
        echo [ERROR] Failed to install pnpm. Please install Node.js 18+ and pnpm manually.
        pause
        exit /b 1
    )
)

:: Install dependencies
echo Installing Vencord dependencies (pnpm install)...
cd /d "%WORK_DIR%\Vencord"
call pnpm install --frozen-lockfile
if errorlevel 1 (
    echo [WARNING] pnpm install failed, trying without --frozen-lockfile...
    call pnpm install
    if errorlevel 1 (
        echo [ERROR] Failed to install dependencies.
        pause
        exit /b 1
    )
)
cd /d "%WORK_DIR%"

:: --- STEP 3: Copy plugin into Vencord source ---
echo.
echo [STEP 3] Copying plugin to Vencord source...
echo.

set "VENCORD_PLUGIN_DIR=%WORK_DIR%\Vencord\src\userplugins\%PLUGIN_NAME%"

if exist "%VENCORD_PLUGIN_DIR%" (
    echo Removing old plugin files...
    rmdir /s /q "%VENCORD_PLUGIN_DIR%"
)

echo Creating plugin folder...
mkdir "%VENCORD_PLUGIN_DIR%"

echo Copying files...
xcopy "%PLUGIN_SRC%index.ts" "%VENCORD_PLUGIN_DIR%\" /y >nul
xcopy "%PLUGIN_SRC%*.ts" "%VENCORD_PLUGIN_DIR%\" /y >nul
if errorlevel 1 (
    echo [ERROR] Failed to copy plugin files.
    pause
    exit /b 1
)

echo Plugin copied to: %VENCORD_PLUGIN_DIR%

:: --- STEP 4: Build Vencord ---
echo.
echo [STEP 4] Building Vencord (pnpm build)...
echo This may take a few minutes on first run.
echo.

cd /d "%WORK_DIR%\Vencord"
call pnpm build
if errorlevel 1 (
    echo [ERROR] Build failed.
    pause
    exit /b 1
)
cd /d "%WORK_DIR%"

:: --- STEP 5: Inject into Discord ---
echo.
echo [STEP 5] Injecting into Discord (pnpm inject)...
echo.
echo NOTE: Close Discord completely before running this step.
echo.

cd /d "%WORK_DIR%\Vencord"
call pnpm inject
cd /d "%WORK_DIR%"

:: --- DONE ---
echo.
echo ========================================
echo  Setup complete!
echo ========================================
echo.
echo 1. Start Discord
echo 2. Go to Settings ^> Vencord ^> Plugins
echo 3. Enable "DiscordSpotifyLyrics"
echo 4. Play a song on Spotify - lyrics will appear in your Discord status
echo.
echo To rebuild and re-inject after code changes, just run this .bat file again.
echo.
pause
