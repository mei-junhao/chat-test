@echo off
set DEEPSEEK_API_KEY=YOUR_DEEPSEEK_KEY
cd /d "%~dp0"

start "DeepSeek-Proxy" /B python proxy.py
timeout 3 >nul
echo 1. Proxy started on port 9000

start "Cloudflare-Tunnel" cloudflared tunnel --url http://localhost:9000
echo 2. Tunnel starting - look for trycloudflare.com URL
echo.
echo Keep both windows open!
pause
