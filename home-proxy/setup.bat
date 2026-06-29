@echo off
chcp 65001 >nul
set "CF="

where cloudflared >nul 2>&1
if %errorlevel%==0 (
    set CF=cloudflared
    echo [OK] cloudflared found
) else if exist "%~dp0cloudflared.exe" (
    set CF="%~dp0cloudflared.exe"
    echo [OK] cloudflared found in local folder
) else (
    echo [DL] Downloading cloudflared...
    powershell -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile '%~dp0cloudflared.exe'"
    if exist "%~dp0cloudflared.exe" (
        set CF="%~dp0cloudflared.exe"
        echo [OK] cloudflared downloaded
    ) else (
        echo [FAIL] Download cloudflared manually from github.com/cloudflare/cloudflared/releases
        echo Place cloudflared.exe in this folder, then rerun.
        pause
        exit /b 1
    )
)

:: Start proxy
start /B "" python "%~dp0proxy.py"
if %errorlevel% neq 0 (
    echo [FAIL] Python not found. Install python.org first.
    pause
    exit /b 1
)
timeout /t 3 /nobreak >nul
echo [OK] Proxy running on port 9000

:: Start tunnel
echo.
echo =====================
echo Tunnel URL will appear below.
echo Keep this window open.
echo =====================
echo.

%CF% tunnel --url http://localhost:9000

echo Tunnel closed.
pause
