@echo off
REM ============================================
REM Rally 3D - Veltron Edition - Launcher
REM Starts local server and opens the game
REM ============================================

setlocal

REM Change to the directory where this script is located
cd /d "%~dp0"

echo.
echo ============================================
echo   Rally 3D - Veltron Edition
echo   Starting local server...
echo ============================================
echo.

REM Check for Python
where python >nul 2>nul
if %errorlevel% == 0 (
    echo [OK] Python found
    echo [OK] Server starting at http://localhost:8123
    echo.
    echo Press Ctrl+C to stop the server
    echo.
    start "" "http://localhost:8123"
    python -m http.server 8123
    goto :eof
)

REM Check for Python 3
where python3 >nul 2>nul
if %errorlevel% == 0 (
    echo [OK] Python 3 found
    echo [OK] Server starting at http://localhost:8123
    echo.
    echo Press Ctrl+C to stop the server
    echo.
    start "" "http://localhost:8123"
    python3 -m http.server 8123
    goto :eof
)

REM Check for Node.js (use bundled server.js - no npm install needed)
where node >nul 2>nul
if %errorlevel% == 0 (
    echo [OK] Node.js found
    echo [OK] Server starting at http://localhost:8123
    echo.
    echo Press Ctrl+C to stop the server
    echo.
    start "" "http://localhost:8123"
    node server.js 8123
    goto :eof
)

REM No server found
echo [ERROR] No suitable server found.
echo.
echo Please install one of the following:
echo   - Python 3 (https://www.python.org/downloads/)
echo   - Node.js (https://nodejs.org/)
echo.
echo Or run manually:
echo   python -m http.server 8123
echo.
pause
goto :eof
