# Naverworks Message Cron Server (GitPulse)

팀 자동화 및 GitHub 활동 분석을 위한 종합 서버 시스템

## 🚀 주요 기능

### 📋 팀 업무 자동화
- **자동 업무 배정**: 주간 단위 업무 담당자 순환 배정
- **업무 리마인더**: 일정 시간마다 현재 담당자에게 알림
- **코드 리뷰 페어링**: 자동 리뷰어 매칭 시스템
- **노트북 관리**: 기기 관리 담당자 알림

### 📊 GitHub 활동 분석 (GitPulse)
- **주간/월간 리포트**: 팀원별 커밋, PR, 리뷰 활동 분석
- **기여도 시각화**: 통계 기반 팀 기여도 순위 및 하이라이트
- **활동 알림**: 저조한 활동에 대한 자동 알림
- **커스텀 기간 분석**: 원하는 기간의 활동 분석

### 💬 다중 메시징 채널
- **네이버웍스**: 기본 메시징 채널
- **슬랙**: 선택적 연동
- **이메일**: SMTP/API 기반 전송

## 📁 프로젝트 구조

```
naverworks-message-cron-server/
├── src/
│   ├── api/                    # REST API 서버
│   │   ├── server.js           # Express 서버 설정
│   │   └── routes/             # API 라우터들
│   │       ├── api.js          # 기본 시스템 API
│   │       ├── github.js       # GitHub 관련 API
│   │       ├── config.js       # 설정 관리 API
│   │       └── schedule.js     # 스케줄 관리 API
│   │
│   ├── github/                 # GitHub 모듈 (GitPulse)
│   │   ├── analyzer.js         # GitHub 활동 분석기
│   │   ├── collector.js        # GitHub 데이터 수집기
│   │   ├── message-renderer.js # 메시지 렌더링
│   │   ├── report-manager.js   # 리포트 관리
│   │   └── index.js           # 모듈 진입점
│   │
│   ├── messaging/              # 메시징 모듈
│   │   ├── message-sender.js   # 통합 메시지 전송기
│   │   ├── naverworks-messenger.js # 네이버웍스 연동
│   │   ├── slack-messenger.js  # 슬랙 연동
│   │   ├── email-messenger.js  # 이메일 연동
│   │   └── index.js           # 모듈 진입점
│   │
│   ├── services/               # 서비스 레이어
│   │   ├── config-service.js   # 설정 관리 서비스
│   │   ├── schedule-service.js # 스케줄 관리 서비스
│   │   ├── github-service.js   # GitHub 서비스
│   │   └── index.js           # 서비스 진입점
│   │
│   └── utils/                  # 유틸리티 함수들
│       ├── date-utils.js       # 날짜 관련 유틸리티
│       ├── string-utils.js     # 문자열 관련 유틸리티
│       └── index.js           # 유틸리티 진입점
│
├── cache/                      # 캐시 및 임시 파일
├── logs/                       # 로그 파일들
├── app.js                      # 메인 애플리케이션
├── logger.js                   # 로깅 설정
├── config.json                 # 메인 설정 파일
├── github-config.json          # GitHub 설정 파일
└── package.json               # 프로젝트 의존성
```

## 🛠 설치 및 설정

### 1. 프로젝트 클론 및 의존성 설치

```bash
git clone <repository-url>
cd naverworks-message-cron-server
npm install
```

### 2. 기본 설정

첫 실행 시 `config.json` 파일이 자동으로 생성됩니다.

```json
{
  "teamMembers": [
    {
      "name": "홍길동",
      "email": "hong@example.com", 
      "githubUsername": "honggildong",
      "naverworksId": "hong.gildong",
      "role": "developer",
      "isActive": true
    }
  ],
  "schedules": {
    "enableWeeklyDutyAssignment": true,
    "weeklyDutySchedule": "0 8 * * 1"
  },
  "messaging": {
    "naverworks": {
      "enabled": true,
      "clientId": "YOUR_CLIENT_ID",
      "clientSecret": "YOUR_CLIENT_SECRET",
      "defaultChannelId": "YOUR_CHANNEL_ID"
    }
  }
}
```

### 3. GitHub 설정 (선택사항)

GitHub 기능을 사용하려면 `github-config.json` 파일을 생성하세요:

```json
{
  "githubToken": "YOUR_GITHUB_TOKEN",
  "repositories": [
    {
      "owner": "your-org",
      "name": "your-repo"
    }
  ],
  "teamMembers": [
    {
      "githubUsername": "honggildong",
      "displayName": "홍길동"
    }
  ],
  "reporting": {
    "weeklyReports": {
      "enabled": true,
      "schedule": "0 9 * * 1"
    }
  }
}
```

## 🚀 실행

### 개발 모드
```bash
npm run dev
```

### 프로덕션 모드
```bash
npm start
```

서버가 시작되면:
- API 서버: `http://localhost:3000`
- 웹 인터페이스: `http://localhost:3000/web`
- 헬스 체크: `http://localhost:3000/health`

## 📚 API 문서

### 기본 시스템 API

#### GET `/api/status`
시스템 상태 조회

#### GET `/api/health`
헬스 체크

### GitHub API

#### POST `/api/github/reports/weekly`
주간 GitHub 활동 리포트 생성

#### POST `/api/github/reports/monthly`  
월간 GitHub 활동 리포트 생성

#### GET `/api/github/status`
GitHub 서비스 상태 조회

### 설정 API

#### GET `/api/config`
현재 설정 조회

#### PUT `/api/config`
설정 업데이트

#### POST `/api/config/validate`
설정 유효성 검사

### 스케줄 API

#### GET `/api/schedule`
모든 스케줄 작업 조회

#### POST `/api/schedule/:name/run`
특정 작업 즉시 실행

#### POST `/api/schedule/reset`
스케줄 재설정

## 🕐 기본 스케줄

| 작업 | 기본 시간 | 설명 |
|------|-----------|------|
| 주간 업무 배정 | 매주 월요일 8시 | 이번 주 담당자 배정 |
| 업무 리마인더 | 매일 14시, 16시 | 현재 담당자에게 알림 |
| 코드 리뷰 페어링 | 매주 월요일 9시 | 리뷰어 자동 매칭 |
| 노트북 관리 | 매일 9시 | 관리 담당자 알림 |
| GitHub 주간 리포트 | 매주 월요일 9시 | 지난 주 활동 분석 |
| GitHub 월간 리포트 | 매월 1일 9시 | 지난 달 활동 분석 |

모든 시간은 한국 시간(KST) 기준입니다.

## 🔧 설정 옵션

### 팀 멤버 설정
```json
{
  "name": "이름",
  "email": "이메일주소",
  "githubUsername": "GitHub 사용자명",
  "naverworksId": "네이버웍스 ID",
  "role": "역할",
  "isActive": true
}
```

### 메시징 채널 설정

#### 네이버웍스
```json
{
  "enabled": true,
  "clientId": "클라이언트 ID",
  "clientSecret": "클라이언트 시크릿",
  "defaultChannelId": "기본 채널 ID"
}
```

#### 슬랙
```json
{
  "enabled": false,
  "botToken": "봇 토큰",
  "defaultChannelId": "기본 채널"
}
```

#### 이메일
```json
{
  "enabled": false,
  "provider": "smtp",
  "host": "smtp.gmail.com",
  "port": 587,
  "auth": {
    "user": "사용자",
    "pass": "비밀번호"
  }
}
```

### GitHub 설정 옵션

#### 리포팅 설정
```json
{
  "weeklyReports": {
    "enabled": true,
    "schedule": "0 9 * * 1"
  },
  "monthlyReports": {
    "enabled": true,
    "schedule": "0 9 1 * *"
  },
  "alertThresholds": {
    "enableLowActivityAlerts": true,
    "minCommitsPerWeek": 5,
    "minReviewsPerWeek": 3
  }
}
```

#### 메시지 설정
```json
{
  "enableEmojis": true,
  "maxMembersInSummary": 5,
  "messageFormat": "full"
}
```

## 📝 로그

로그는 `logs/` 디렉토리에 저장됩니다:
- `app.log`: 일반 애플리케이션 로그
- `error.log`: 에러 로그
- `debug.log`: 디버그 로그

## 🔒 보안

- 민감한 정보(토큰, 비밀번호)는 환경변수 사용 권장
- API 엔드포인트에 인증 미들웨어 추가 가능
- HTTPS 사용 권장

## 🤝 기여하기

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 라이선스

이 프로젝트는 ISC 라이선스 하에 있습니다.

## 📞 지원

문제가 발생하거나 문의사항이 있으시면 GitHub Issues를 통해 연락해 주세요.

---

**GitPulse** - GitHub 기반 팀 성과 시각화 및 자동화 솔루션
