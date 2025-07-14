# 네이버웍스 메시지 자동 알림 스케줄러 - 미리보기 기능 추가

## 🆕 새로운 기능: 미리보기 시스템

### 주요 업데이트 내용

#### 1. 주간 당직 편성 미리보기
- **기능**: 실제 편성 전에 미리보기를 통해 당직 배정 결과를 확인할 수 있습니다.
- **위치**: 메인 화면 → "주간 당직 미리보기" 버튼
- **흐름**: 미리보기 생성 → 검토 → 확정 또는 재편성

#### 2. 코드리뷰 짝꿍 편성 미리보기
- **기능**: 코드리뷰 짝꿍 배정 결과를 미리 확인할 수 있습니다.
- **위치**: 메인 화면 → "코드리뷰 미리보기" 버튼
- **흐름**: 미리보기 생성 → 검토 → 확정 또는 재편성

### 새로 추가된 파일들

#### 백엔드
- `src/services/assignment-preview-service.js` - 미리보기 로직 처리
- 새로운 API 엔드포인트가 `src/routes/web-routes.js`에 추가됨:
  - `POST /preview-weekly-duty` - 주간 당직 미리보기
  - `POST /confirm-weekly-duty` - 주간 당직 확정
  - `POST /preview-code-review` - 코드리뷰 미리보기
  - `POST /confirm-code-review` - 코드리뷰 확정

#### 프론트엔드
- `public/css/preview-modal.css` - 미리보기 모달 전용 스타일
- `public/js/status-management.js` 업데이트 - 미리보기 기능 추가
- `index.html` 업데이트 - 미리보기 UI 요소 추가

### 사용 방법

#### 주간 당직 편성 미리보기
1. 메인 화면에서 "주간 당직 미리보기" 버튼 클릭
2. 생성된 편성표를 모달에서 확인
3. 옵션 선택:
   - **확정 및 전송**: 현재 편성을 확정하고 네이버웍스로 알림 발송
   - **다시 편성**: 새로운 편성을 다시 생성
   - **취소**: 편성을 취소하고 모달 닫기

#### 코드리뷰 짝꿍 편성 미리보기
1. 메인 화면에서 "코드리뷰 미리보기" 버튼 클릭
2. 생성된 짝꿍 배정을 모달에서 확인
3. 옵션 선택:
   - **확정 및 전송**: 현재 짝꿍 배정을 확정하고 네이버웍스로 알림 발송
   - **다시 편성**: 새로운 짝꿍을 다시 생성 (랜덤 셔플)
   - **취소**: 편성을 취소하고 모달 닫기

### 미리보기 모달 특징

#### 정보 표시
- **편성 정보**: 기간, 팀원 수, 편성 방식 등
- **상세 편성표**: 일별 당직자 또는 짝꿍 목록
- **전송될 메시지**: 실제 네이버웍스로 전송될 메시지 미리보기

#### 인터랙션
- **ESC 키**: 모달 닫기
- **모달 외부 클릭**: 모달 닫기
- **반응형 디자인**: 모바일 환경에서도 최적화

### 기존 기능과의 호환성

#### 기존 기능 유지
- 기존의 "주간 당직 편성 실행", "코드리뷰 짝꿍 편성 실행" 버튼은 그대로 유지
- 기존 스케줄링 시스템과 완전히 분리되어 작동
- 기존 데이터 구조 및 저장 방식 유지

#### 분리된 서비스 아키텍처
- `assignment-preview-service.js`는 기존 서비스들과 독립적으로 작동
- 기존 `duty-service.js`, `team-service.js`의 로직을 건드리지 않고 새로운 기능 추가
- 모듈화된 구조로 향후 확장성 보장

### 설치 및 실행

기존과 동일한 방식으로 실행됩니다:

```bash
npm start
```

브라우저에서 `http://localhost:3000`에 접속하면 새로운 미리보기 기능을 확인할 수 있습니다.

### 기술적 구현 세부사항

#### 백엔드 구조
```
src/services/assignment-preview-service.js
├── generateWeeklyDutyPreview()     # 주간 당직 미리보기 생성
├── confirmWeeklyDutyAssignment()   # 주간 당직 확정
├── generateCodeReviewPreview()     # 코드리뷰 미리보기 생성
└── confirmCodeReviewAssignment()   # 코드리뷰 확정
```

#### 프론트엔드 구조
```
public/js/status-management.js
├── showWeeklyDutyPreview()         # 주간 당직 미리보기 표시
├── showCodeReviewPreview()         # 코드리뷰 미리보기 표시
├── displayWeeklyDutyPreview()      # 주간 당직 미리보기 렌더링
├── displayCodeReviewPreview()      # 코드리뷰 미리보기 렌더링
├── confirmAssignment()             # 편성 확정 처리
└── regeneratePreview()             # 미리보기 재생성
```

### 향후 개선 계획

1. **사용자 맞춤 편성**: 특정 팀원 제외, 선호도 기반 편성 등
2. **편성 히스토리**: 과거 편성 내역 조회 및 분석
3. **알림 설정**: 미리보기 생성 완료 알림
4. **편성 규칙 커스터마이징**: 팀별 편성 규칙 설정 기능

---

## 기존 README 내용

### 프로젝트 개요
네이버웍스를 통한 팀 알림 자동화 시스템으로, 당직 배정, 코드리뷰 짝꿍 편성, GitHub 성과 분석 등의 기능을 제공합니다.

### 주요 기능
- 🏢 주간 당직 자동 편성 및 알림
- 👥 코드리뷰 짝꿍 자동 편성
- 💻 노트북 지참 당번 알림
- 📊 GitHub 활동 분석 및 리포트
- ⏰ 크론 기반 스케줄링
- 🌐 웹 기반 관리 인터페이스

### 시스템 요구사항
- Node.js 14.0 이상
- 네이버웍스 API 토큰
- GitHub Personal Access Token (선택사항)

### 환경 설정
`.env` 파일에 다음 내용을 설정하세요:

```
NAVERWORKS_API_TOKEN=your_naverworks_token
NAVERWORKS_CHANNEL_ID=your_channel_id
GITHUB_TOKEN=your_github_token
PORT=3000
```

### 의존성 설치
```bash
npm install
```

### 실행
```bash
npm start
```

### 기본 스케줄
- **주간 당직 편성**: 매주 월요일 오전 8시
- **당직 알림**: 매일 오후 2시, 4시
- **코드리뷰 짝꿍**: 매주 월요일 오전 9시
- **노트북 당번**: 매일 오전 9시

브라우저에서 `http://localhost:3000`에 접속하여 웹 인터페이스를 사용할 수 있습니다.
