@echo off
echo =================================
echo Git Status and Commit Process - Channel Message Integration
echo =================================

cd /d "C:\Users\tmddud333\IdeaProjects\naverworks-message-cron-server"

echo.
echo Checking git status...
git status

echo.
echo Adding all changes...
git add .

echo.
echo Committing channel message integration...
git commit -m "feat: Integrate channel messaging for team notifications

CHANNEL API INTEGRATION:
- Add sendChannelMessage() function for daonbe1 channel
- URL: https://naverworks.danal.co.kr/message/alarm/channels/daonbe1
- Headers: Content-Type: application/json
- Body: UTF-8 encoded message bytes

UPDATED FUNCTIONS TO USE CHANNEL:
✅ Weekly duty assignment (Monday 8 AM) → Channel
✅ Duty reminders (Daily 2 PM & 4 PM) → Channel  
✅ Code review pair assignment (Monday 9 AM) → Channel

MAINTAINED INDIVIDUAL MESSAGING:
- Laptop duty notifications → Individual users
- Custom message schedules → Individual users

TECHNICAL IMPROVEMENTS:
- Robust JSON/text response parsing for channel API
- Enhanced error handling for channel messages
- Detailed logging for channel vs individual messaging
- UTF-8 byte encoding for proper Korean character support

This update centralizes team-wide notifications to the daonbe1 
channel while maintaining individual notifications for 
personal tasks like laptop duty reminders."

echo.
echo Pushing to remote repository...
git push

echo.
echo =================================
echo Channel messaging integration completed!
echo =================================
pause
