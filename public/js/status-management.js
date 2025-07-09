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
    if (confirm('주간 당직을 새로 편성하시겠습니까? 기존 당직이 변경될 수 있습니다.')) {
        try {
            showStatus(statusMessageDiv, '주간 당직 편성 중...', 'info');
            const response = await fetch('/execute-weekly-duty', { method: 'POST' });
            if (response.ok) {
                const data = await response.json();
                showStatus(statusMessageDiv, data.message, 'success');
                await loadInitialConfig();
                await updateStatusTab();
            } else {
                const errorData = await response.json();
                showStatus(statusMessageDiv, '주간 당직 편성 실패: ' + errorData.message, 'error');
            }
        } catch (error) {
            showStatus(statusMessageDiv, '네트워크 오류로 주간 당직을 편성할 수 없습니다.', 'error');
        }
    }
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
