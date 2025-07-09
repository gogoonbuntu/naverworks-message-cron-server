// 메인 애플리케이션 초기화
document.addEventListener('DOMContentLoaded', function() {
    // DOM 요소들
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    // 탭 네비게이션 이벤트
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.dataset.tab;
            
            // 탭 버튼 활성화 상태 변경
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // 탭 컨텐츠 표시/숨김
            tabContents.forEach(content => content.classList.remove('active'));
            document.getElementById(`${targetTab}-tab`).classList.add('active');
            
            // 상태 탭이 활성화되면 현황 업데이트
            if (targetTab === 'status') {
                updateStatusTab();
            }
            
            // GitHub 탭이 활성화되면 GitHub 상태 로드
            if (targetTab === 'github') {
                loadGitHubStatus();
            }
        });
    });

    // 초기 설정 로드
    loadInitialConfig();
    
    // GitHub 상태 로드
    loadGitHubStatus();
    
    // 리포트 미리보기 초기화
    resetReportPreview();
    
    // 저장소 통계 로드
    loadStorageStats();
});

// 전역 함수로 deleteReport 정의 (onclick에서 사용)
window.deleteReport = deleteReport;
