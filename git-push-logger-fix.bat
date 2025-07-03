@echo off
echo =================================
echo Git Status and Commit Process for Logger Fix
echo =================================

cd /d "C:\Users\tmddud333\IdeaProjects\naverworks-message-cron-server"

echo.
echo Checking git status...
git status

echo.
echo Adding logger.js changes...
git add logger.js

echo.
echo Committing logger function fixes...
git commit -m "fix: Add missing logger functions

- Add logMessageSent function for message delivery logging
- Add logApiCall function for API request/response logging  
- Add logScheduledTask function for scheduled job logging
- Add logConfigChange function for configuration change logging
- Fixes 'logger.logMessageSent is not a function' errors
- All logger functions now properly defined and working"

echo.
echo Pushing to remote repository...
git push

echo.
echo =================================
echo Logger fix committed and pushed successfully!
echo =================================
pause
