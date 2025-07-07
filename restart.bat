@echo off
echo ===============================================
echo  Naverworks Message Cron Server Restart
echo ===============================================

echo [1/3] Killing existing Node.js processes...
taskkill /F /IM node.exe >nul 2>&1
if %errorlevel% equ 0 (
    echo     ✓ Existing processes terminated
) else (
    echo     ○ No existing processes found
)

echo.
echo [2/3] Waiting for cleanup...
timeout /t 3 /nobreak >nul

echo.
echo [3/3] Starting server...
cd /d "C:\Users\tmddud333\IdeaProjects\naverworks-message-cron-server"

echo.
echo ===============================================
echo  Starting Naverworks Message Cron Server
echo ===============================================
echo  Homepage: http://localhost:3000/
echo  API Info: http://localhost:3000/api
echo  Health:   http://localhost:3000/health
echo ===============================================
echo.

npm start

pause
