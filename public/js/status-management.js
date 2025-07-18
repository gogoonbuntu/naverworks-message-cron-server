// 상태 관리 함수들
const totalMembersSpan = document.getElementById('totalMembers');
const authorizedMembersSpan = document.getElementById('authorizedMembers');
const activeSchedulesSpan = document.getElementById('activeSchedules');
const currentWeekSpan = document.getElementById('currentWeek');
const weeklyDutyScheduleDiv = document.getElementById('weeklyDutySchedule');
const todayDutyStatusDiv = document.getElementById('todayDutyStatus');
const currentCodeReviewPairsDiv = document.getElementById('currentCodeReviewPairs');
const statusMessageDiv = document.getElementById('statusMessage');
const executeWeeklyDutyBtn = document.getElementById('executeWeeklyDuty');
const executeCodeReviewBtn = document.getElementById('executeCodeReview');
const refreshStatusBtn = document.getElementById('refreshStatus');

// 전역 변수 추가
let currentPreviewData = null;

// 상태 탭 업데이트
async function updateStatusTab() {
    const totalMembers = currentConfig.teamMembers.length;
    const authorizedCount = currentConfig.teamMembers.filter(m => m.isAuthorized).length;
    const activeScheduleCount = currentConfig.schedules.length + 4; // 기본 스케줄 4개 포함
    const weekKey = getWeekKey();

    totalMembersSpan.textContent = `${totalMembers}명`;
    authorizedMembersSpan.textContent = `${authorizedCount}명`;
    activeSchedulesSpan.textContent = `${activeScheduleCount}개`;
    currentWeekSpan.textContent = weekKey;

    // 이번주 당직 편성표 로드
    await loadWeeklyDutySchedule();
    
    // 오늘의 당직자 로드
    await loadTodayDutyStatus();
    
    // 현재 코드리뷰 짝꿍 현황
    const codeReviewPairs = currentConfig.codeReviewPairs || [];
    if (codeReviewPairs.length > 0) {
        let pairsHtml = '';
        codeReviewPairs.forEach(pair => {
            const memberNames = pair.members.map(member => `${member.name}(${member.id})`).join(' & ');
            pairsHtml += `
                <div class="review-pair-item">
                    <p><strong>짝꿍 ${pair.pairNumber}:</strong> ${memberNames}</p>
                    <p><strong>편성 주:</strong> ${pair.weekKey}</p>
                </div>
            `;
        });
        currentCodeReviewPairsDiv.innerHTML = pairsHtml;
    } else {
        currentCodeReviewPairsDiv.innerHTML = `
            <div class="review-pair-item">
                <p>이번 주 코드리뷰 짝꿍이 아직 편성되지 않았습니다.</p>
                <p>매주 월요일 오전 9시에 자동으로 편성되거나, 수동으로 편성할 수 있습니다.</p>
            </div>
        `;
    }
}

// 이번주 당직 편성표 로드
async function loadWeeklyDutySchedule() {
    try {
        const response = await fetch('/weekly-duty-schedule');
        if (response.ok) {
            const weeklySchedule = await response.json();
            displayWeeklyDutySchedule(weeklySchedule);
        } else {
            weeklyDutyScheduleDiv.innerHTML = '<p>주간 당직 편성표를 불러올 수 없습니다.</p>';
        }
    } catch (error) {
        console.error('Weekly duty schedule load error:', error);
        weeklyDutyScheduleDiv.innerHTML = '<p>주간 당직 편성표 로드 중 오류가 발생했습니다.</p>';
    }
}

// 주간 당직 편성표 표시
function displayWeeklyDutySchedule(weeklySchedule) {
    if (weeklySchedule.length === 0) {
        weeklyDutyScheduleDiv.innerHTML = '<p>이번주 당직 편성표가 없습니다. 주간 당직 편성을 실행해주세요.</p>';
        return;
    }

    let scheduleHtml = '<div class="weekly-schedule-grid">';
    weeklySchedule.forEach(day => {
        const isToday = day.date === new Date().toISOString().split('T')[0];
        const todayClass = isToday ? 'today' : '';
        
        const membersText = day.members.length > 0 
            ? day.members.map(m => `${m.name}(${m.id})`).join(' & ')
            : '미배정';
        
        scheduleHtml += `
            <div class="duty-day ${todayClass}">
                <div class="day-header">
                    <strong>${day.dayName}</strong> (${day.displayDate})
                    ${isToday ? '<span class="today-badge">오늘</span>' : ''}
                </div>
                <div class="duty-members">
                    ${membersText}
                </div>
            </div>
        `;
    });
    scheduleHtml += '</div>';
    
    weeklyDutyScheduleDiv.innerHTML = scheduleHtml;
}

// 오늘의 당직자 로드
async function loadTodayDutyStatus() {
    try {
        const response = await fetch('/today-duty');
        if (response.ok) {
            const todayDuty = await response.json();
            displayTodayDutyStatus(todayDuty);
        } else {
            todayDutyStatusDiv.innerHTML = '<p>오늘의 당직자 정보를 불러올 수 없습니다.</p>';
        }
    } catch (error) {
        console.error('Today duty load error:', error);
        todayDutyStatusDiv.innerHTML = '<p>오늘의 당직자 정보 로드 중 오류가 발생했습니다.</p>';
    }
}

// 오늘의 당직자 표시
function displayTodayDutyStatus(todayDuty) {
    // 당직자가 없거나 hasNoDuty가 true인 경우
    if (!todayDuty || todayDuty.hasNoDuty || !todayDuty.members || todayDuty.members.length === 0) {
        const currentDate = todayDuty?.displayDate || new Date().toLocaleDateString('ko-KR');
        todayDutyStatusDiv.innerHTML = `
            <div class="today-duty-card no-duty">
                <div class="duty-info">
                    <h3>📅 오늘(${currentDate})</h3>
                    <p><strong>당직자가 배정되지 않았습니다.</strong></p>
                    <p>주간 당직 편성을 실행하여 당직자를 배정해주세요.</p>
                </div>
            </div>
        `;
        return;
    }

    const membersText = todayDuty.members.map(m => `${m.name}(${m.id})`).join(' & ');
    todayDutyStatusDiv.innerHTML = `
        <div class="today-duty-card">
            <div class="duty-info">
                <h3>🚨 오늘의 당직자</h3>
                <p class="duty-members-large">${membersText}</p>
                <p class="duty-date">날짜: ${todayDuty.displayDate}</p>
            </div>
            <div class="duty-tasks">
                <h4>당직 업무</h4>
                <ul>
                    <li>매일 오후 2시, 4시 당직 체크</li>
                    <li>사무실 보안 상태 확인</li>
                    <li>시설 이상 유무 점검</li>
                    <li>긴급상황 발생시 즉시 보고</li>
                </ul>
            </div>
        </div>
    `;
}

// 수동 실행 버튼 이벤트
executeWeeklyDutyBtn.addEventListener('click', async () => {
    // 기존의 confirm 대화상자 대신 미리보기 모달 열기
    await openWeeklyDutyPreviewModal();
});

/**
 * 주간당직 미리보기 모달 열기
 */
async function openWeeklyDutyPreviewModal() {
    const modal = document.getElementById('weeklyDutyPreviewModal');
    const previewContent = document.getElementById('previewContent');
    const previewScheduleGrid = document.getElementById('previewScheduleGrid');
    const previewMessage = document.getElementById('previewMessage');
    const generateNewBtn = document.getElementById('generateNewCombination');
    const confirmBtn = document.getElementById('confirmWeeklyDuty');
    
    // 모달 초기화
    modal.style.display = 'flex';
    previewContent.className = 'preview-content loading';
    previewScheduleGrid.style.display = 'none';
    previewMessage.style.display = 'none';
    generateNewBtn.style.display = 'none';
    confirmBtn.style.display = 'none';
    
    try {
        // 미리보기 데이터 요청
        const response = await fetch('/preview-weekly-duty', { method: 'POST' });
        const result = await response.json();
        
        if (result.status === 'success') {
            currentPreviewData = result.data;
            displayWeeklyDutyPreview(result.data, result.preview);
            
            // 버튼들 표시
            generateNewBtn.style.display = 'inline-block';
            confirmBtn.style.display = 'inline-block';
        } else {
            showPreviewError(result.message);
        }
        
        previewContent.className = 'preview-content loaded';
        
    } catch (error) {
        console.error('Preview generation error:', error);
        showPreviewError('미리보기 생성 중 네트워크 오류가 발생했습니다.');
        previewContent.className = 'preview-content loaded';
    }
}

/**
 * 주간당직 미리보기 표시
 */
function displayWeeklyDutyPreview(scheduleData, previewMessage) {
    const previewScheduleGrid = document.getElementById('previewScheduleGrid');
    const previewMessageDiv = document.getElementById('previewMessage');
    
    // 금요일 당직자 찾기 (주말 연속 당직자)
    const fridayData = scheduleData.find(day => day.dayName === '금요일');
    const weekendDutyPersonId = fridayData && fridayData.members.length > 0 ? fridayData.members[0].id : null;
    
    // 스케줄 그리드 생성
    let gridHtml = '';
    scheduleData.forEach(day => {
        const isToday = day.date === new Date().toISOString().split('T')[0];
        const todayClass = isToday ? 'today' : '';
        const weekendClass = day.isWeekend ? 'weekend' : '';
        
        // 금토일 연속 당직 표시
        const isWeekendDuty = (day.dayName === '금요일' || day.dayName === '토요일' || day.dayName === '일요일');
        const specialClass = isWeekendDuty ? 'weekend-duty' : '';
        
        const membersText = day.members.length > 0 
            ? day.members.map(m => {
                const isWeekendDutyPerson = m.id === weekendDutyPersonId;
                const highlight = isWeekendDutyPerson && isWeekendDuty ? ' 🎆' : '';
                return `${m.name}(${m.id})${highlight}`;
            }).join(' & ')
            : '미배정';
        
        const memberClass = day.members.length === 0 ? 'no-duty' : '';
        const emoji = day.isWeekend ? '🌴' : '🏢';
        const specialNote = isWeekendDuty ? ' ✨' : '';
        
        gridHtml += `
            <div class="preview-day-card ${todayClass} ${weekendClass} ${specialClass}">
                <div class="preview-day-header">
                    ${emoji} ${day.dayName}${specialNote}
                    ${isToday ? '<span class="today-badge">오늘</span>' : ''}
                </div>
                <div class="preview-day-date">${day.displayDate}</div>
                <div class="preview-day-members ${memberClass}">
                    ${membersText}
                </div>
                ${day.members.length === 2 ? '<div class="member-count-badge">2명 배정</div>' : ''}
            </div>
        `;
    });
    
    previewScheduleGrid.innerHTML = gridHtml;
    previewScheduleGrid.style.display = 'grid';
    
    // 미리보기 메시지 표시
    previewMessageDiv.textContent = previewMessage;
    previewMessageDiv.style.display = 'block';
}

/**
 * 미리보기 오류 표시
 */
function showPreviewError(message) {
    const previewContent = document.getElementById('previewContent');
    previewContent.innerHTML = `
        <div class="preview-error" style="text-align: center; padding: 40px 20px; color: #dc3545;">
            <h4>❌ 미리보기 생성 실패</h4>
            <p>${message}</p>
        </div>
    `;
}

/**
 * 새로운 조합 생성
 */
async function generateNewWeeklyDutyCombination() {
    const previewContent = document.getElementById('previewContent');
    const generateNewBtn = document.getElementById('generateNewCombination');
    const confirmBtn = document.getElementById('confirmWeeklyDuty');
    
    // 로딩 상태로 변경
    previewContent.className = 'preview-content loading';
    generateNewBtn.disabled = true;
    confirmBtn.disabled = true;
    
    try {
        // 새로운 미리보기 생성
        const response = await fetch('/preview-weekly-duty', { method: 'POST' });
        const result = await response.json();
        
        if (result.status === 'success') {
            currentPreviewData = result.data;
            displayWeeklyDutyPreview(result.data, result.preview);
        } else {
            showPreviewError(result.message);
        }
    } catch (error) {
        console.error('New combination generation error:', error);
        showPreviewError('새로운 조합 생성 중 오류가 발생했습니다.');
    } finally {
        previewContent.className = 'preview-content loaded';
        generateNewBtn.disabled = false;
        confirmBtn.disabled = false;
    }
}

/**
 * 주간당직 확정
 */
async function confirmWeeklyDutySchedule() {
    if (!currentPreviewData) {
        alert('미리보기 데이터가 없습니다.');
        return;
    }
    
    const confirmBtn = document.getElementById('confirmWeeklyDuty');
    const originalText = confirmBtn.textContent;
    
    try {
        confirmBtn.disabled = true;
        confirmBtn.textContent = '확정 중...';
        
        const response = await fetch('/confirm-weekly-duty', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ previewData: currentPreviewData })
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            // 모달 닫기
            closeWeeklyDutyPreviewModal();
            
            // 성공 메시지 표시
            showStatus(statusMessageDiv, result.message, 'success');
            
            // 상태 탭 새로고침
            await loadInitialConfig();
            await updateStatusTab();
        } else {
            alert('확정 실패: ' + result.message);
        }
    } catch (error) {
        console.error('Confirmation error:', error);
        alert('확정 중 네트워크 오류가 발생했습니다.');
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.textContent = originalText;
    }
}

/**
 * 모달 닫기
 */
function closeWeeklyDutyPreviewModal() {
    const modal = document.getElementById('weeklyDutyPreviewModal');
    modal.style.display = 'none';
    currentPreviewData = null;
}

// 모달 이벤트 리스너 설정
document.addEventListener('DOMContentLoaded', () => {
    // 모달 닫기 버튼
    const closeBtn = document.getElementById('closePreviewModal');
    const cancelBtn = document.getElementById('cancelWeeklyDuty');
    
    if (closeBtn) {
        closeBtn.addEventListener('click', closeWeeklyDutyPreviewModal);
    }
    
    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeWeeklyDutyPreviewModal);
    }
    
    // 새로운 조합 생성 버튼
    const generateNewBtn = document.getElementById('generateNewCombination');
    if (generateNewBtn) {
        generateNewBtn.addEventListener('click', generateNewWeeklyDutyCombination);
    }
    
    // 확정 버튼
    const confirmBtn = document.getElementById('confirmWeeklyDuty');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', confirmWeeklyDutySchedule);
    }
    
    // 모달 배경 클릭시 닫기
    const modal = document.getElementById('weeklyDutyPreviewModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target.id === 'weeklyDutyPreviewModal') {
                closeWeeklyDutyPreviewModal();
            }
        });
    }
    
    // ESC 키로 모달 닫기
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const modal = document.getElementById('weeklyDutyPreviewModal');
            if (modal && modal.style.display === 'flex') {
                closeWeeklyDutyPreviewModal();
            }
        }
    });
});

executeCodeReviewBtn.addEventListener('click', async () => {
    if (confirm('코드리뷰 짝꿍을 새로 편성하시겠습니까?')) {
        try {
            showStatus(statusMessageDiv, '코드리뷰 짝꿍 편성 중...', 'info');
            const response = await fetch('/execute-code-review', { method: 'POST' });
            if (response.ok) {
                const data = await response.json();
                showStatus(statusMessageDiv, data.message, 'success');
                await loadInitialConfig();
                await updateStatusTab();
            } else {
                const errorData = await response.json();
                showStatus(statusMessageDiv, '코드리뷰 짝꿍 편성 실패: ' + errorData.message, 'error');
            }
        } catch (error) {
            showStatus(statusMessageDiv, '네트워크 오류로 코드리뷰 짝꿍을 편성할 수 없습니다.', 'error');
        }
    }
});

refreshStatusBtn.addEventListener('click', async () => {
    await loadInitialConfig();
    await updateStatusTab();
    showStatus(statusMessageDiv, '현황이 새로고침되었습니다.', 'success');
});
