// public/js/github-management.js
// GitHub 관리 함수들 - 백그라운드 작업 지원 버전

// DOM 요소들
const githubServiceStatusSpan = document.getElementById('githubServiceStatus');
const githubRepoCountSpan = document.getElementById('githubRepoCount');
const githubMemberCountSpan = document.getElementById('githubMemberCount');
const githubWeeklyStatusSpan = document.getElementById('githubWeeklyStatus');
const githubRefreshStatusBtn = document.getElementById('githubRefreshStatus');
const githubPreviewWeeklyBtn = document.getElementById('githubPreviewWeekly');
const githubPreviewMonthlyBtn = document.getElementById('githubPreviewMonthly');
const githubSendReportBtn = document.getElementById('githubSendReport');
const githubDiscardReportBtn = document.getElementById('githubDiscardReport');
const githubCancelReportBtn = document.getElementById('githubCancelReport');
const githubSendButtonsDiv = document.getElementById('githubSendButtons');
const githubCheckAlertsBtn = document.getElementById('githubCheckAlerts');
const githubStartDateInput = document.getElementById('githubStartDate');
const githubEndDateInput = document.getElementById('githubEndDate');
const githubSendToChannelCheckbox = document.getElementById('githubSendToChannel');
const githubGenerateCustomReportBtn = document.getElementById('githubGenerateCustomReport');
const githubCustomReportMessageDiv = document.getElementById('githubCustomReportMessage');
const githubMemberSelect = document.getElementById('githubMemberSelect');
const githubMemberStartDateInput = document.getElementById('githubMemberStartDate');
const githubMemberEndDateInput = document.getElementById('githubMemberEndDate');
const githubGetMemberStatsBtn = document.getElementById('githubGetMemberStats');
const githubMemberStatsResultDiv = document.getElementById('githubMemberStatsResult');
const githubTokenInput = document.getElementById('githubToken');
const githubRepoListTextarea = document.getElementById('githubRepoList');
const githubTeamMembersTextarea = document.getElementById('githubTeamMembers');
const githubWeeklyEnabledCheckbox = document.getElementById('githubWeeklyEnabled');
const githubMonthlyEnabledCheckbox = document.getElementById('githubMonthlyEnabled');
const githubUpdateConfigBtn = document.getElementById('githubUpdateConfig');
const githubConfigMessageDiv = document.getElementById('githubConfigMessage');
const githubReportPreviewDiv = document.getElementById('githubReportPreview');
const githubReportStatusSpan = document.getElementById('githubReportStatus');
const githubProgressDetailsDiv = document.getElementById('githubProgressDetails');
const progressStepsDiv = document.getElementById('progressSteps');

// 리포트 관리 요소들
const githubStorageStatsDiv = document.getElementById('githubStorageStats');
const previewCountSpan = document.getElementById('previewCount');
const archiveCountSpan = document.getElementById('archiveCount');
const totalSizeSpan = document.getElementById('totalSize');
const githubRefreshStorageBtn = document.getElementById('githubRefreshStorage');
const githubClearCacheBtnBtn = document.getElementById('githubClearCacheBtn');
const githubToggleHistoryBtn = document.getElementById('githubToggleHistory');
const githubReportHistorySection = document.getElementById('githubReportHistorySection');
const githubReportHistoryDiv = document.getElementById('githubReportHistory');

// 백그라운드 작업 관련 변수들
let currentTaskId = null;
let currentReportData = null;
let currentReportType = null;
let taskStatusInterval = null;
let isTaskRunning = false;

// 초기화 함수
function initializeGitHubManagement() {
    // 기존 로딩 함수들 호출
    loadGitHubStatus();
    loadStorageStats();
    
    // 오늘 생성된 최근 리포트 로드
    loadLatestTodayReport();
    
    // 주기적으로 실행 중인 작업 확인
    setInterval(checkRunningTasks, 5000); // 5초마다 확인
}

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', initializeGitHubManagement);

/**
 * 오늘 생성된 최근 리포트 로드
 */
async function loadLatestTodayReport() {
    try {
        const response = await fetch('/github/latest-report');
        if (response.ok) {
            const result = await response.json();
            if (result.success && result.data) {
                const report = result.data;
                
                // 리포트 내용을 미리보기 영역에 표시
                githubReportPreviewDiv.innerHTML = `<pre>${report.content}</pre>`;
                
                // 상태 업데이트
                const reportTypeText = report.type === 'weekly' ? '주간' : report.type === 'monthly' ? '월간' : '일반';
                githubReportStatusSpan.textContent = `최근 리포트 (오늘 생성된 ${reportTypeText})`;
                githubReportStatusSpan.className = 'report-status completed';
                
                // 현재 리포트 데이터 설정
                currentReportData = report.content;
                currentReportType = report.type;
                
                // 전송 버튼 표시
                githubSendButtonsDiv.style.display = 'block';
                
                console.log(`Loaded latest today report: ${report.id} (${report.type})`);
            } else {
                // 오늘 생성된 리포트가 없음
                resetReportPreview();
            }
        } else {
            console.warn('Failed to load latest today report:', response.status);
        }
    } catch (error) {
        console.error('Error loading latest today report:', error);
    }
}

/**
 * GitHub 상태 로드
 */
async function loadGitHubStatus() {
    try {
        const response = await fetch('/github/status');
        if (response.ok) {
            const status = await response.json();
            updateGitHubStatusDisplay(status);
            
            if (status.isEnabled) {
                await loadGitHubConfig();
            }
        } else {
            githubServiceStatusSpan.textContent = '오류';
            githubRepoCountSpan.textContent = '0개';
            githubMemberCountSpan.textContent = '0명';
            githubWeeklyStatusSpan.textContent = '비활성';
        }
    } catch (error) {
        console.error('GitHub status load error:', error);
        githubServiceStatusSpan.textContent = '오류';
    }
}

/**
 * GitHub 상태 표시 업데이트
 */
function updateGitHubStatusDisplay(status) {
    githubServiceStatusSpan.textContent = status.isEnabled ? '활성' : '비활성';
    githubRepoCountSpan.textContent = `${status.config?.repositoryCount || 0}개`;
    githubMemberCountSpan.textContent = `${status.config?.teamMemberCount || 0}명`;
    githubWeeklyStatusSpan.textContent = status.config?.weeklyReportsEnabled ? '활성' : '비활성';
    
    // 버튼 활성화/비활성화
    const isEnabled = status.isEnabled;
    githubPreviewWeeklyBtn.disabled = !isEnabled;
    githubPreviewMonthlyBtn.disabled = !isEnabled;
    githubCheckAlertsBtn.disabled = !isEnabled;
    githubGenerateCustomReportBtn.disabled = !isEnabled;
    githubGetMemberStatsBtn.disabled = !isEnabled;
    
    // 작업 상태 표시
    if (status.tasks && status.tasks.running > 0) {
        githubReportStatusSpan.textContent = `실행 중 (${status.tasks.running}개 작업)`;
        githubReportStatusSpan.className = 'report-status running';
    }
}

/**
 * GitHub 설정 로드
 */
async function loadGitHubConfig() {
    try {
        const response = await fetch('/github/config');
        if (response.ok) {
            const config = await response.json();
            
            // 설정 폼에 데이터 채우기
            githubTokenInput.value = config.githubToken === '[CONFIGURED]' ? '' : config.githubToken;
            
            if (config.repositories) {
                const repoList = config.repositories.map(repo => `${repo.owner}/${repo.name}`).join('\n');
                githubRepoListTextarea.value = repoList;
            }
            
            if (config.teamMembers) {
                const memberList = config.teamMembers.map(member => `${member.githubUsername}:${member.displayName}`).join('\n');
                githubTeamMembersTextarea.value = memberList;
                
                // 멤버 선택 드롭다운 업데이트
                githubMemberSelect.innerHTML = '<option value="">멤버 선택...</option>';
                config.teamMembers.forEach(member => {
                    const option = document.createElement('option');
                    option.value = member.githubUsername;
                    option.textContent = `${member.displayName} (${member.githubUsername})`;
                    githubMemberSelect.appendChild(option);
                });
            }
            
            githubWeeklyEnabledCheckbox.checked = config.reporting?.weeklyReports?.enabled || false;
            githubMonthlyEnabledCheckbox.checked = config.reporting?.monthlyReports?.enabled || false;
            
        } else {
            showStatus(githubConfigMessageDiv, 'GitHub 설정을 불러올 수 없습니다.', 'error');
        }
    } catch (error) {
        console.error('GitHub config load error:', error);
        showStatus(githubConfigMessageDiv, 'GitHub 설정 로드 중 오류가 발생했습니다.', 'error');
    }
}

/**
 * 실행 중인 작업 확인
 */
async function checkRunningTasks() {
    try {
        const response = await fetch('/github/running-tasks');
        if (response.ok) {
            const result = await response.json();
            if (result.success && result.data.length > 0) {
                // 실행 중인 작업이 있으면 상태 업데이트
                const latestTask = result.data[result.data.length - 1];
                handleRunningTask(latestTask);
            } else if (isTaskRunning) {
                // 실행 중이던 작업이 완료됨
                handleTaskCompleted();
            }
        }
    } catch (error) {
        console.error('Error checking running tasks:', error);
    }
}

/**
 * 실행 중인 작업 처리
 */
function handleRunningTask(task) {
    if (!isTaskRunning) {
        isTaskRunning = true;
        currentTaskId = task.id;
        
        // 작업 타입에 따라 UI 업데이트
        if (task.type === 'github_weekly_report') {
            setReportGeneratingState(true, 'weekly');
        } else if (task.type === 'github_monthly_report') {
            setReportGeneratingState(true, 'monthly');
        }
        
        // 진행도 추적 시작
        startProgressTracking(task.id);
    }
    
    // 진행도 업데이트
    updateProgressDetails(task.progress);
}

/**
 * 작업 완료 처리
 */
function handleTaskCompleted() {
    if (isTaskRunning) {
        isTaskRunning = false;
        currentTaskId = null;
        
        setReportGeneratingState(false);
        stopProgressTracking();
        
        // 완료된 작업 결과 확인
        checkCompletedTaskResult();
    }
}

/**
 * 완료된 작업 결과 확인
 */
async function checkCompletedTaskResult() {
    try {
        const response = await fetch('/github/task-status');
        if (response.ok) {
            const result = await response.json();
            if (result.success) {
                // 완료된 작업 중 리포트 생성 작업 찾기
                const completedReportTasks = result.data.filter(task => 
                    task.status === 'completed' && 
                    task.type.includes('github') && 
                    task.type.includes('report')
                );
                
                if (completedReportTasks.length > 0) {
                    const latestTask = completedReportTasks[completedReportTasks.length - 1];
                    handleReportGenerationComplete(latestTask);
                }
            }
        }
    } catch (error) {
        console.error('Error checking completed task result:', error);
    }
}

/**
 * 진행도 추적 시작
 */
function startProgressTracking(taskId) {
    if (taskStatusInterval) {
        clearInterval(taskStatusInterval);
    }
    
    taskStatusInterval = setInterval(async () => {
        try {
            const response = await fetch(`/github/task-progress?taskId=${taskId}`);
            if (response.ok) {
                const result = await response.json();
                if (result.success) {
                    updateProgressDetails(result.data.progress);
                    
                    // 작업이 완료되면 추적 중지
                    if (result.data.status !== 'running') {
                        stopProgressTracking();
                        handleTaskCompleted();
                    }
                }
            }
        } catch (error) {
            console.error('Error tracking progress:', error);
        }
    }, 2000); // 2초마다 진행도 확인
}

/**
 * 진행도 추적 중지
 */
function stopProgressTracking() {
    if (taskStatusInterval) {
        clearInterval(taskStatusInterval);
        taskStatusInterval = null;
    }
}

/**
 * 진행도 세부사항 업데이트
 */
function updateProgressDetails(progressData) {
    if (!progressData) {
        githubProgressDetailsDiv.classList.remove('visible');
        return;
    }
    
    let stepsHtml = '';
    
    // 기본 진행 상태
    stepsHtml += `
        <div class="progress-step">
            <span class="step-name">진행 상태:</span> ${progressData.message || '처리 중...'}
        </div>
    `;
    
    // 전체 진행률
    if (progressData.percentage !== null && progressData.percentage !== undefined) {
        stepsHtml += `
            <div class="progress-step">
                <span class="step-name">전체 진행률:</span> ${progressData.percentage}%
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${progressData.percentage}%"></div>
                </div>
            </div>
        `;
    }
    
    // 단계 정보
    if (progressData.currentStep && progressData.totalSteps) {
        stepsHtml += `
            <div class="progress-step">
                <span class="step-name">단계:</span> ${progressData.currentStep} / ${progressData.totalSteps}
            </div>
        `;
    }
    
    // 리포지토리 정보
    if (progressData.repository) {
        stepsHtml += `
            <div class="progress-step">
                <span class="step-name">현재 리포지토리:</span> ${progressData.repository}
            </div>
        `;
    }
    
    // 시간 정보
    if (progressData.timestamp) {
        const time = new Date(progressData.timestamp).toLocaleTimeString();
        stepsHtml += `
            <div class="progress-step">
                <span class="step-name">마지막 업데이트:</span> ${time}
            </div>
        `;
    }
    
    progressStepsDiv.innerHTML = stepsHtml;
    githubProgressDetailsDiv.classList.add('visible');
}

/**
 * 리포트 생성 상태 관리 함수
 */
function setReportGeneratingState(isGenerating, reportType = null) {
    if (isGenerating) {
        // 미리보기 버튼들 비활성화 및 로딩 상태 표시
        githubPreviewWeeklyBtn.disabled = true;
        githubPreviewMonthlyBtn.disabled = true;
        githubPreviewWeeklyBtn.classList.add('loading');
        githubPreviewMonthlyBtn.classList.add('loading');
        
        // 취소 버튼 표시
        githubCancelReportBtn.style.display = 'inline-block';
        
        // 상태 표시 업데이트
        githubReportStatusSpan.textContent = '통계 수집 중...';
        githubReportStatusSpan.className = 'report-status generating';
        
        // 미리보기 영역에 로딩 표시
        githubReportPreviewDiv.innerHTML = `
            <div class="report-preview-loading">
                <div class="loading-spinner"></div>
                <div>GitHub 리포지토리에서 통계를 수집하고 있습니다...</div>
                <div>새로고침해도 작업이 계속됩니다.</div>
            </div>
        `;
        
        // 버튼 텍스트 변경
        if (reportType === 'weekly') {
            githubPreviewWeeklyBtn.textContent = '주간 리포트 수집 중...';
        } else if (reportType === 'monthly') {
            githubPreviewMonthlyBtn.textContent = '월간 리포트 수집 중...';
        }
        
        // 전송 버튼 영역 숨기기
        githubSendButtonsDiv.style.display = 'none';
        
    } else {
        // 버튼들 활성화 및 로딩 상태 제거
        githubPreviewWeeklyBtn.disabled = false;
        githubPreviewMonthlyBtn.disabled = false;
        githubPreviewWeeklyBtn.classList.remove('loading');
        githubPreviewMonthlyBtn.classList.remove('loading');
        
        // 취소 버튼 숨기기
        githubCancelReportBtn.style.display = 'none';
        
        // 버튼 텍스트 복원
        githubPreviewWeeklyBtn.textContent = 'GitHub 주간 리포트 미리보기';
        githubPreviewMonthlyBtn.textContent = 'GitHub 월간 리포트 미리보기';
        
        // 진행도 숨기기
        githubProgressDetailsDiv.classList.remove('visible');
    }
}

/**
 * 리포트 생성 완료 처리 함수
 */
function handleReportGenerationComplete(taskData) {
    setReportGeneratingState(false);
    
    if (taskData.status === 'completed' && taskData.result) {
        // 성공 처리
        githubReportPreviewDiv.innerHTML = `<pre>${taskData.result.message}</pre>`;
        githubSendButtonsDiv.style.display = 'block';
        currentReportData = taskData.result.message;
        currentReportType = taskData.type.includes('weekly') ? 'weekly' : 'monthly';
        
        githubReportStatusSpan.textContent = '생성 완료';
        githubReportStatusSpan.className = 'report-status completed';
        
        const reportTypeText = currentReportType === 'weekly' ? '주간' : '월간';
        showStatus(githubConfigMessageDiv, `${reportTypeText} 리포트 미리보기가 생성되었습니다. 발송하시려면 아래 버튼을 클릭하세요.`, 'success');
        
        // 새로 생성된 리포트이므로 저장소 통계 새로고침
        loadStorageStats();
    } else {
        // 실패 처리
        githubReportPreviewDiv.innerHTML = `
            <div class="report-preview-placeholder">
                <div style="color: #dc3545;">❌ 리포트 생성에 실패했습니다.</div>
                <div style="color: #6c757d; font-size: 0.9em; margin-top: 10px;">${taskData.error || '알 수 없는 오류가 발생했습니다.'}</div>
            </div>
        `;
        
        githubReportStatusSpan.textContent = '생성 실패';
        githubReportStatusSpan.className = 'report-status error';
        
        showStatus(githubConfigMessageDiv, taskData.error || '리포트 생성에 실패했습니다.', 'error');
    }
}

/**
 * 리포트 생성 취소 함수
 */
function cancelReportGeneration() {
    if (!currentTaskId) return;
    
    fetch('/github/cancel-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: currentTaskId })
    }).then(response => response.json())
    .then(result => {
        if (result.success) {
            setReportGeneratingState(false);
            stopProgressTracking();
            
            // 상태 업데이트
            githubReportStatusSpan.textContent = '취소됨';
            githubReportStatusSpan.className = 'report-status cancelled';
            
            // 미리보기 영역 업데이트
            githubReportPreviewDiv.innerHTML = `
                <div class="report-preview-placeholder">
                    <div class="cancel-message">
                        리포트 생성이 취소되었습니다.<br>
                        다시 생성하려면 미리보기 버튼을 클릭하세요.
                    </div>
                </div>
            `;
            
            // 현재 상태 초기화
            currentReportData = null;
            currentReportType = null;
            currentTaskId = null;
            isTaskRunning = false;
            
            showStatus(githubConfigMessageDiv, '리포트 생성이 취소되었습니다.', 'info');
        } else {
            showStatus(githubConfigMessageDiv, result.message || '작업 취소에 실패했습니다.', 'error');
        }
    }).catch(error => {
        console.error('Error cancelling task:', error);
        showStatus(githubConfigMessageDiv, '작업 취소 중 오류가 발생했습니다.', 'error');
    });
}

/**
 * 리포트 미리보기 초기화 함수
 */
function resetReportPreview() {
    currentReportData = null;
    currentReportType = null;
    currentTaskId = null;
    isTaskRunning = false;
    githubSendButtonsDiv.style.display = 'none';
    githubReportStatusSpan.textContent = '대기 중';
    githubReportStatusSpan.className = 'report-status';
    githubReportPreviewDiv.innerHTML = `
        <div class="report-preview-placeholder">
            📊 리포트 미리보기를 보려면 위의 '미리보기' 버튼을 클릭하세요.
        </div>
    `;
    githubProgressDetailsDiv.classList.remove('visible');
}

/**
 * 저장소 통계 로드
 */
async function loadStorageStats() {
    try {
        const response = await fetch('/github/storage-stats');
        if (response.ok) {
            const result = await response.json();
            if (result.success) {
                const stats = result.data;
                previewCountSpan.textContent = `${stats.preview.count}개`;
                archiveCountSpan.textContent = `${stats.archive.count}개`;
                totalSizeSpan.textContent = `${stats.total.sizeMB} MB`;
            }
        }
    } catch (error) {
        console.error('Storage stats load error:', error);
    }
}

/**
 * 리포트 이력 로드
 */
async function loadReportHistory() {
    try {
        const response = await fetch('/github/report-history?limit=20');
        if (response.ok) {
            const result = await response.json();
            if (result.success) {
                displayReportHistory(result.data);
            } else {
                githubReportHistoryDiv.innerHTML = '<p style="text-align: center; padding: 20px; color: #dc3545;">리포트 이력을 불러올 수 없습니다.</p>';
            }
        } else {
            githubReportHistoryDiv.innerHTML = '<p style="text-align: center; padding: 20px; color: #dc3545;">리포트 이력 로드 중 오류가 발생했습니다.</p>';
        }
    } catch (error) {
        console.error('Report history load error:', error);
        githubReportHistoryDiv.innerHTML = '<p style="text-align: center; padding: 20px; color: #dc3545;">네트워크 오류가 발생했습니다.</p>';
    }
}

/**
 * 리포트 이력 표시
 */
function displayReportHistory(reports) {
    if (reports.length === 0) {
        githubReportHistoryDiv.innerHTML = '<p style="text-align: center; padding: 20px; color: #666;">리포트 이력이 없습니다.</p>';
        return;
    }
    
    let historyHtml = '';
    reports.forEach(report => {
        const date = new Date(report.generatedAt || report.sentAt).toLocaleString();
        const typeText = report.type === 'weekly' ? '주간' : report.type === 'monthly' ? '월간' : '일반';
        const categoryText = report.category === 'preview' ? '미리보기' : '아카이브';
        const sizeText = report.size ? `${(report.size / 1024).toFixed(1)} KB` : 'N/A';
        
        historyHtml += `
            <div class="report-item clickable" onclick="showReportPreview('${report.id}')">
                <div class="report-info">
                    <div class="report-title">${typeText} 리포트 (${categoryText})</div>
                    <div class="report-meta">
                        ${date} | ${sizeText} | ID: ${report.id.substring(0, 12)}...
                    </div>
                </div>
                <div class="report-actions">
                    <button class="secondary-btn" onclick="deleteReport('${report.id}'); event.stopPropagation();">삭제</button>
                </div>
            </div>
        `;
    });
    
    githubReportHistoryDiv.innerHTML = historyHtml;
}

/**
 * 리포트 미리보기 표시
 */
async function showReportPreview(reportId) {
    try {
        showStatus(githubConfigMessageDiv, '리포트 내용을 불러오는 중...', 'info');
        
        const response = await fetch(`/github/report-content/${reportId}`);
        
        if (response.ok) {
            const result = await response.json();
            
            if (result.success) {
                // 미리보기 영역에 리포트 내용 표시
                githubReportPreviewDiv.innerHTML = `<pre>${result.data.content}</pre>`;
                
                // 상태 업데이트
                githubReportStatusSpan.textContent = '이력 조회 완료';
                githubReportStatusSpan.className = 'report-status completed';
                
                // 현재 리포트 데이터 설정 (재전송 가능하도록)
                currentReportData = result.data.content;
                currentReportType = result.data.type;
                
                // 전송 버튼 표시 (아카이브가 아닌 경우에만)
                if (result.data.category === 'preview') {
                    githubSendButtonsDiv.style.display = 'block';
                } else {
                    githubSendButtonsDiv.style.display = 'none';
                }
                
                showStatus(githubConfigMessageDiv, '리포트 내용이 미리보기 영역에 표시되었습니다.', 'success');
            } else {
                showStatus(githubConfigMessageDiv, result.message || '리포트 내용을 불러올 수 없습니다.', 'error');
                githubReportPreviewDiv.innerHTML = `
                    <div class="report-preview-placeholder">
                        <div style="color: #dc3545;">❌ 리포트 내용을 불러올 수 없습니다.</div>
                        <div style="color: #6c757d; font-size: 0.9em; margin-top: 10px;">${result.message || '알 수 없는 오류가 발생했습니다.'}</div>
                    </div>
                `;
            }
        } else {
            const errorData = await response.json();
            showStatus(githubConfigMessageDiv, errorData.message || '리포트 내용을 불러올 수 없습니다.', 'error');
        }
    } catch (error) {
        console.error('Report content load error:', error);
        showStatus(githubConfigMessageDiv, '네트워크 오류가 발생했습니다.', 'error');
    }
}

/**
 * 리포트 삭제
 */
async function deleteReport(reportId) {
    if (!confirm('이 리포트를 삭제하시겠습니까?')) {
        return;
    }
    
    try {
        const response = await fetch('/github/delete-report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reportId })
        });
        
        if (response.ok) {
            const result = await response.json();
            if (result.success) {
                showStatus(githubConfigMessageDiv, result.message, 'success');
                await loadReportHistory(); // 이력 새로고침
                await loadStorageStats(); // 통계 새로고침
            } else {
                showStatus(githubConfigMessageDiv, result.message, 'error');
            }
        } else {
            showStatus(githubConfigMessageDiv, '리포트 삭제 중 오류가 발생했습니다.', 'error');
        }
    } catch (error) {
        showStatus(githubConfigMessageDiv, '네트워크 오류가 발생했습니다.', 'error');
    }
}

// 이벤트 리스너들
githubRefreshStatusBtn.addEventListener('click', async () => {
    await loadGitHubStatus();
    showStatus(githubConfigMessageDiv, 'GitHub 상태가 새로고침되었습니다.', 'success');
});

githubPreviewWeeklyBtn.addEventListener('click', async () => {
    if (isTaskRunning) return;
    
    try {
        showStatus(githubConfigMessageDiv, 'GitHub 주간 리포트 미리보기 생성 중...', 'info');
        
        const response = await fetch('/github/preview-weekly-report', { method: 'POST' });
        
        if (response.ok) {
            const result = await response.json();
            
            if (result.isAsync) {
                // 백그라운드 작업으로 처리
                currentTaskId = result.taskId;
                isTaskRunning = true;
                setReportGeneratingState(true, 'weekly');
                startProgressTracking(result.taskId);
                showStatus(githubConfigMessageDiv, '주간 리포트 생성이 백그라운드에서 시작되었습니다.', 'info');
            } else {
                // 즉시 결과 처리 (캐시된 결과 등)
                handleReportGenerationComplete({
                    status: 'completed',
                    result: result,
                    type: 'github_weekly_report'
                });
            }
        } else {
            const errorData = await response.json();
            showStatus(githubConfigMessageDiv, errorData.message || 'GitHub 주간 리포트 미리보기 생성에 실패했습니다.', 'error');
        }
    } catch (error) {
        console.error('Weekly report preview error:', error);
        showStatus(githubConfigMessageDiv, 'GitHub 주간 리포트 미리보기 생성 중 오류가 발생했습니다.', 'error');
    }
});

githubPreviewMonthlyBtn.addEventListener('click', async () => {
    if (isTaskRunning) return;
    
    try {
        showStatus(githubConfigMessageDiv, 'GitHub 월간 리포트 미리보기 생성 중...', 'info');
        
        const response = await fetch('/github/preview-monthly-report', { method: 'POST' });
        
        if (response.ok) {
            const result = await response.json();
            
            if (result.isAsync) {
                // 백그라운드 작업으로 처리
                currentTaskId = result.taskId;
                isTaskRunning = true;
                setReportGeneratingState(true, 'monthly');
                startProgressTracking(result.taskId);
                showStatus(githubConfigMessageDiv, '월간 리포트 생성이 백그라운드에서 시작되었습니다.', 'info');
            } else {
                // 즉시 결과 처리 (캐시된 결과 등)
                handleReportGenerationComplete({
                    status: 'completed',
                    result: result,
                    type: 'github_monthly_report'
                });
            }
        } else {
            const errorData = await response.json();
            showStatus(githubConfigMessageDiv, errorData.message || 'GitHub 월간 리포트 미리보기 생성에 실패했습니다.', 'error');
        }
    } catch (error) {
        console.error('Monthly report preview error:', error);
        showStatus(githubConfigMessageDiv, 'GitHub 월간 리포트 미리보기 생성 중 오류가 발생했습니다.', 'error');
    }
});

githubCancelReportBtn.addEventListener('click', cancelReportGeneration);

githubSendReportBtn.addEventListener('click', async () => {
    if (!currentReportData) {
        showStatus(githubConfigMessageDiv, '전송할 리포트가 없습니다.', 'error');
        return;
    }

    if (confirm(`GitHub ${currentReportType === 'weekly' ? '주간' : '월간'} 리포트를 채널로 전송하시겠습니까?`)) {
        try {
            showStatus(githubConfigMessageDiv, 'GitHub 리포트 전송 중...', 'info');
            const response = await fetch('/github/send-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: currentReportData, reportType: currentReportType })
            });
            
            if (response.ok) {
                const data = await response.json();
                showStatus(githubConfigMessageDiv, data.message, 'success');
                // 전송 후 초기화
                resetReportPreview();
                githubReportPreviewDiv.innerHTML = '<div class="report-preview-placeholder">📤 리포트가 성공적으로 전송되었습니다.</div>';
                
                // 새로 생성된 리포트가 있을 수 있으므로 잠시 후 최신 리포트 로드
                setTimeout(() => {
                    loadLatestTodayReport();
                }, 1000);
            } else {
                const errorData = await response.json();
                showStatus(githubConfigMessageDiv, errorData.message, 'error');
            }
        } catch (error) {
            showStatus(githubConfigMessageDiv, 'GitHub 리포트 전송 중 오류가 발생했습니다.', 'error');
        }
    }
});

githubDiscardReportBtn.addEventListener('click', () => {
    if (confirm('생성된 리포트를 삭제하시겠습니까?')) {
        resetReportPreview();
        showStatus(githubConfigMessageDiv, '리포트가 삭제되었습니다.', 'info');
    }
});

// 나머지 이벤트 리스너들
githubCheckAlertsBtn.addEventListener('click', async () => {
    try {
        showStatus(githubConfigMessageDiv, 'GitHub 활동 알림 체크 중...', 'info');
        const response = await fetch('/github/check-alerts', { method: 'POST' });
        if (response.ok) {
            const data = await response.json();
            showStatus(githubConfigMessageDiv, data.message, data.success ? 'success' : 'info');
        } else {
            const errorData = await response.json();
            showStatus(githubConfigMessageDiv, errorData.message, 'error');
        }
    } catch (error) {
        showStatus(githubConfigMessageDiv, 'GitHub 활동 알림 체크 중 오류가 발생했습니다.', 'error');
    }
});

githubUpdateConfigBtn.addEventListener('click', async () => {
    const token = githubTokenInput.value.trim();
    const repoListText = githubRepoListTextarea.value.trim();
    const teamMembersText = githubTeamMembersTextarea.value.trim();
    
    // 업데이트할 설정만 수집
    const newConfig = {};
    
    // 토큰이 입력된 경우만 추가
    if (token) {
        newConfig.githubToken = token;
    }
    
    // 리포지토리가 입력된 경우만 추가
    if (repoListText) {
        try {
            const repositories = repoListText.split('\n').filter(line => line.trim()).map(line => {
                const [owner, name] = line.trim().split('/');
                if (!owner || !name) {
                    throw new Error(`잘못된 리포지토리 형식: ${line}`);
                }
                return { owner, name };
            });
            newConfig.repositories = repositories;
        } catch (error) {
            showStatus(githubConfigMessageDiv, `리포지토리 형식 오류: ${error.message}`, 'error');
            return;
        }
    }
    
    // 팀원 정보가 입력된 경우만 추가
    if (teamMembersText) {
        try {
            const teamMembers = teamMembersText.split('\n').filter(line => line.trim()).map(line => {
                const [githubUsername, displayName] = line.trim().split(':');
                if (!githubUsername || !displayName) {
                    throw new Error(`잘못된 팀원 형식: ${line}`);
                }
                return { githubUsername, displayName };
            });
            newConfig.teamMembers = teamMembers;
        } catch (error) {
            showStatus(githubConfigMessageDiv, `팀원 정보 형식 오류: ${error.message}`, 'error');
            return;
        }
    }
    
    // 리포트 설정은 항상 업데이트
    newConfig.reporting = {
        weeklyReports: { enabled: githubWeeklyEnabledCheckbox.checked },
        monthlyReports: { enabled: githubMonthlyEnabledCheckbox.checked }
    };
    
    // 비어있는 설정 체크
    if (Object.keys(newConfig).length === 1 && newConfig.reporting) {
        showStatus(githubConfigMessageDiv, '업데이트할 설정이 없습니다. 최소한 한 가지 설정을 입력해주세요.', 'error');
        return;
    }
    
    try {
        showStatus(githubConfigMessageDiv, 'GitHub 설정 업데이트 중...', 'info');
        const response = await fetch('/github/update-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newConfig)
        });
        
        if (response.ok) {
            const data = await response.json();
            showStatus(githubConfigMessageDiv, data.message, 'success');
            
            // 상태 새로고침
            await loadGitHubStatus();
        } else {
            const errorData = await response.json();
            showStatus(githubConfigMessageDiv, errorData.message, 'error');
        }
    } catch (error) {
        showStatus(githubConfigMessageDiv, 'GitHub 설정 업데이트 중 오류가 발생했습니다.', 'error');
    }
});

// 리포트 관리 버튼 이벤트 리스너
githubRefreshStorageBtn.addEventListener('click', async () => {
    await loadStorageStats();
    showStatus(githubConfigMessageDiv, '저장소 통계가 새로고침되었습니다.', 'success');
});

githubClearCacheBtnBtn.addEventListener('click', async () => {
    if (confirm('모든 캐시된 리포트 미리보기를 삭제하시겠습니까? 아카이브는 보존됩니다.')) {
        try {
            const response = await fetch('/github/clear-cache', { method: 'POST' });
            if (response.ok) {
                const result = await response.json();
                showStatus(githubConfigMessageDiv, result.message, result.success ? 'success' : 'error');
                await loadStorageStats(); // 통계 새로고침
                if (githubReportHistorySection.style.display !== 'none') {
                    await loadReportHistory(); // 이력 새로고침
                }
            } else {
                showStatus(githubConfigMessageDiv, '캐시 정리 중 오류가 발생했습니다.', 'error');
            }
        } catch (error) {
            showStatus(githubConfigMessageDiv, '네트워크 오류가 발생했습니다.', 'error');
        }
    }
});

githubToggleHistoryBtn.addEventListener('click', async () => {
    if (githubReportHistorySection.style.display === 'none') {
        githubReportHistorySection.style.display = 'block';
        githubToggleHistoryBtn.textContent = '리포트 이력 숨기기';
        await loadReportHistory();
    } else {
        githubReportHistorySection.style.display = 'none';
        githubToggleHistoryBtn.textContent = '리포트 이력 보기';
    }
});