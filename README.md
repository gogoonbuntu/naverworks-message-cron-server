# 🚀 네이버웍스 메시지 자동 알림 스케줄러

팀 내 업무 알림을 자동화하는 Node.js 서비스입니다.

## 📋 주요 기능

### 📅 당직 관리
- **주간 당직 편성**: 매주 월요일 8시 AM 자동 편성
- **당직 알림**: 매일 오후 2시, 4시 당직자 알림
- **공평한 배정**: 당직 횟수 기반 자동 배정

### 👥 팀원 관리
- **코드리뷰 짝꿍**: 매주 월요일 9시 AM 자동 페어링
- **노트북 지참**: 매일 오전 9시 당번 알림
- **팀원 통계**: 각종 활동 횟수 추적

### 🔧 GitHub 성과 분석
- **주간 리포트**: 매주 월요일 10시 AM 자동 발송
- **월간 리포트**: 매월 1일 11시 AM 자동 발송
- **커스텀 리포트**: 원하는 기간 설정 가능
- **팀원 통계**: 개별 멤버 활동 분석

## 🛠 설치 및 실행

### 1. 의존성 설치
```bash
npm install
```

### 2. GitHub 설정 (선택사항)
```bash
# GitHub 설정 파일 생성
cp github-config.template.json github-config.json

# GitHub 토큰 설정 (둘 중 하나 선택)
# 방법 1: 환경 변수 사용
export GITHUB_TOKEN=your_github_token_here

# 방법 2: 설정 파일에 직접 입력
# github-config.json 파일의 "githubToken" 값 설정
```

### 3. 서비스 실행
```bash
# 일반 실행
node app.js

# 개발 모드 (자동 재시작)
nodemon app.js
```

### 4. 웹 인터페이스
```
http://localhost:3000
```

## 📂 프로젝트 구조

```
naverworks-message-cron-server/
├── app.js                          # 메인 진입점
├── src/
│   ├── server.js                   # HTTP 서버
│   ├── routes/
│   │   └── web-routes.js          # 웹 라우팅
│   ├── services/
│   │   ├── config-service.js      # 설정 관리
│   │   ├── message-service.js     # 메시지 전송
│   │   ├── duty-service.js        # 당직 관리
│   │   ├── team-service.js        # 팀원 관리
│   │   ├── schedule-service.js    # 스케줄링
│   │   └── github-service.js      # GitHub 통합
│   └── utils/
│       └── date-utils.js          # 날짜 유틸리티
├── config.json                    # 메인 설정
├── github-config.json             # GitHub 설정
├── github-config.template.json    # GitHub 설정 템플릿
└── logs/                          # 로그 파일들
```

## 🔐 GitHub 토큰 설정

### 1. GitHub Personal Access Token 생성
1. GitHub → Settings → Developer settings → Personal access tokens
2. "Generate new token" 클릭
3. 권한 선택:
   - `repo` (전체 리포지토리 접근)
   - `read:org` (조직 정보 읽기)
   - `read:user` (사용자 정보 읽기)

### 2. 토큰 설정 방법

#### 방법 1: 환경 변수 사용 (권장)
```bash
# .env 파일 생성
echo "GITHUB_TOKEN=your_token_here" > .env
```

#### 방법 2: 설정 파일 사용
```bash
# github-config.json 파일에서 githubToken 값 설정
{
  "githubToken": "your_token_here",
  ...
}
```

### 3. 모니터링 리포지토리 설정
`github-config.json` 파일의 `repositories` 섹션에서 모니터링할 리포지토리 설정:

```json
{
  "repositories": [
    {
      "name": "your-repo-name",
      "owner": "your-org",
      "url": "https://github.com/your-org/your-repo",
      "description": "Repository description",
      "enabled": true
    }
  ]
}
```

### 4. 팀원 매핑 설정
`github-config.json` 파일의 `teamMapping` 섹션에서 팀원과 GitHub 계정 매핑:

```json
{
  "teamMapping": {
    "internal_id": {
      "githubUsername": "github_username",
      "name": "실제 이름",
      "email": "email@company.com"
    }
  }
}
```

## 📊 기본 스케줄

| 작업 | 시간 | 전송 방식 |
|------|------|----------|
| 주간 당직 편성 | 매주 월요일 8시 AM | 채널 |
| 당직 알림 | 매일 2시, 4시 PM | 채널 |
| 코드리뷰 짝꿍 | 매주 월요일 9시 AM | 채널 |
| 노트북 지참 | 매일 9시 AM | 개별 DM |
| GitHub 주간 리포트 | 매주 월요일 10시 AM | 채널 |
| GitHub 월간 리포트 | 매월 1일 11시 AM | 채널 |

## 🌐 API 엔드포인트

### 기본 관리
- `GET /` - 웹 인터페이스
- `GET /config` - 설정 조회
- `POST /update-schedules` - 스케줄 업데이트
- `POST /update-team-members` - 팀원 업데이트

### 당직 관리
- `GET /weekly-duty-schedule` - 주간 당직표 조회
- `GET /today-duty` - 오늘 당직자 조회
- `POST /execute-weekly-duty` - 주간 당직 수동 편성

### GitHub 기능
- `GET /github/status` - GitHub 서비스 상태
- `POST /github/execute-weekly-report` - 주간 리포트 수동 실행
- `POST /github/execute-monthly-report` - 월간 리포트 수동 실행
- `POST /github/custom-report` - 커스텀 기간 리포트

## 🚨 주의사항

### 보안
- ⚠️ **GitHub 토큰을 절대 공개하지 마세요**
- ⚠️ `github-config.json` 파일을 Git에 커밋하지 마세요
- ⚠️ 환경 변수 사용을 권장합니다

### 파일 관리
- `github-config.json` - Git 제외 (민감 정보)
- `github-config.template.json` - Git 포함 (템플릿)
- `config.json` - Git 제외 (팀 설정)

## 📝 로그 확인

```bash
# 실시간 로그
tail -f logs/app.log

# 에러 로그
tail -f logs/error.log

# 디버그 로그
tail -f logs/debug.log
```

## 🎯 개발 가이드

### 새 기능 추가
1. 적절한 서비스 파일에 함수 추가
2. 필요시 라우팅 엔드포인트 추가
3. 스케줄링 필요시 `schedule-service.js` 수정

### 버그 수정
1. 해당 기능의 서비스 파일 수정
2. 로그 확인 및 디버깅
3. 의존성 영향도 확인

## 📞 지원

문제 발생 시 로그 파일을 확인하고 GitHub Issues에 등록해주세요.

---

**Made with ❤️ for efficient team management**
