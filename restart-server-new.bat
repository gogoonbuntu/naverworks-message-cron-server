@echo off
echo Killing Node.js processes...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 3 /nobreak >nul

echo Starting server...
cd /d "C:\Users\tmddud333\IdeaProjects\naverworks-message-cron-server"
start "NaverWorks Server" cmd /k "npm start"

echo Server restart initiated.
pause
