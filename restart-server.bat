@echo off
echo Stopping all Node.js processes...
taskkill /F /IM node.exe 2>nul
timeout /t 2 /nobreak >nul
echo Starting updated server...
cd /d "C:\Users\tmddud333\IdeaProjects\naverworks-message-cron-server"
npm start
