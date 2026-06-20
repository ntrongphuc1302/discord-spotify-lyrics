@echo off
setlocal enabledelayedexpansion

echo ==============================
echo  DiscordSpotifyLyrics Setup
echo ==============================
echo.

set "PLUGIN_NAME=discord-spotify-lyrics"
set "VENCORD_REPO=https://github.com/Vendicated/Vencord.git"
set "THIS_DIR=%~dp0"
set "PLUGIN_SRC=%THIS_DIR%"

for %%i in ("%THIS_DIR%") do set "PARENT_DIR=%%~dpi.."
pushd %PARENT_DIR%
set "WORK_DIR=%CD%"
popd

if not exist "%PLUGIN_SRC%\index.ts" (
    echo [ERROR] Plugin source not found: %PLUGIN_SRC%
    echo Make sure this .bat file is inside the "%PLUGIN_NAME%" folder.
    pause
    exit /b 1
)

echo [1/5] Cloning / updating Vencord...
if not exist "%WORK_DIR%\Vencord\.git" (
    git clone --depth 1 %VENCORD_REPO% "%WORK_DIR%\Vencord"
    if errorlevel 1 (
        echo [ERROR] Failed to clone Vencord.
        pause
        exit /b 1
    )
) else (
    cd /d "%WORK_DIR%\Vencord" && git pull && cd /d "%WORK_DIR%"
)

echo.
echo [2/5] Checking pnpm...
where pnpm >nul 2>&1
if errorlevel 1 (
    corepack enable
    corepack prepare pnpm@latest --activate
    if errorlevel 1 (
        echo [ERROR] pnpm install failed. Make sure Node.js 18+ is installed.
        pause
        exit /b 1
    )
)

cd /d "%WORK_DIR%\Vencord"
call pnpm install --frozen-lockfile
if errorlevel 1 (
    call pnpm install
    if errorlevel 1 (
        echo [ERROR] Failed to install dependencies.
        pause
        exit /b 1
    )
)
cd /d "%WORK_DIR%"

echo.
echo [3/5] Copying plugin to Vencord source...
set "VENCORD_PLUGIN_DIR=%WORK_DIR%\Vencord\src\userplugins\%PLUGIN_NAME%"
if exist "%VENCORD_PLUGIN_DIR%" rmdir /s /q "%VENCORD_PLUGIN_DIR%"
mkdir "%VENCORD_PLUGIN_DIR%"
xcopy "%PLUGIN_SRC%*.ts" "%VENCORD_PLUGIN_DIR%\" /y >nul
if errorlevel 1 (
    echo [ERROR] Failed to copy plugin files.
    pause
    exit /b 1
)
echo Plugin copied to: %VENCORD_PLUGIN_DIR%

echo.
echo [4/5] Building Vencord (pnpm build)...
echo This may take a few minutes on first run.
cd /d "%WORK_DIR%\Vencord"
call pnpm build
if errorlevel 1 (
    echo [ERROR] Build failed.
    pause
    exit /b 1
)
cd /d "%WORK_DIR%"

echo.
echo [5/5] Injecting into Discord (pnpm inject)...
echo Close Discord completely before this step.
cd /d "%WORK_DIR%\Vencord"
call pnpm inject
cd /d "%WORK_DIR%"

echo.
echo ==============================
echo  Setup complete!
echo ==============================
echo.
echo 1. Start Discord
echo 2. Settings ^> Vencord ^> Plugins ^> Enable "DiscordSpotifyLyrics"
echo 3. Play a song on Spotify
echo.
echo Run this file again to rebuild after code changes.
echo.
pause
