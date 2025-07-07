@echo off
echo ===============================================
echo  당직 시스템 업데이트 후 서버 재시작
echo ===============================================

echo [1/3] 기존 서버 종료...
taskkill /F /IM node.exe >nul 2>&1
if %errorlevel% equ 0 (
    echo     ✓ 기존 서버 종료 완료
) else (
    echo     ○ 실행 중인 서버 없음
)

echo.
echo [2/3] 시스템 정리 중...
timeout /t 2 /nobreak >nul

echo.
echo [3/3] 서버 시작...
cd /d "C:\Users\tmddud333\IdeaProjects\naverworks-message-cron-server"

echo.
echo ===============================================
echo  업데이트된 기능:
echo  ✓ config.json 기반 당직 시스템
echo  ✓ 실제 팀원 데이터 연동
echo  ✓ 주간 당직 편성 기능
echo  ✓ 코드리뷰 짝꿍 편성 기능
echo  ✓ 오늘의 당직자 조회
echo ===============================================
echo  접속: http://localhost:3000/
echo ===============================================
echo.

npm start

pause
