// 유틸리티 함수들
function showStatus(messageDiv, message, type = 'info') {
    messageDiv.textContent = message;
    messageDiv.className = `status-message ${type}`;
    messageDiv.style.display = 'block';
    setTimeout(() => {
        messageDiv.style.display = 'none';
    }, 5000);
}

function getWeekKey(date = new Date()) {
    const kstDate = new Date(date.toLocaleString("en-US", {timeZone: "Asia/Seoul"}));
    const year = kstDate.getFullYear();
    const week = getWeekNumber(kstDate);
    return `${year}-W${week.toString().padStart(2, '0')}`;
}

function getWeekNumber(date) {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

// 전역 변수
let currentConfig = { 
    schedules: [], 
    teamMembers: [], 
    currentLaptopDutyPair: [],
    dailyDutySchedule: {},
    codeReviewPairs: []
};

// 전역 설정 로드
async function loadInitialConfig() {
    try {
        const response = await fetch('/config');
        if (response.ok) {
            const data = await response.json();
            currentConfig = data;
            renderTeamMemberList();
            renderScheduledList();
            await updateStatusTab();
            scheduleTypeSelect.dispatchEvent(new Event('change'));
        } else {
            showStatus(statusMessageDiv, '설정을 불러오지 못했습니다.', 'error');
            showStatus(teamMemberStatusMessageDiv, '설정을 불러오지 못했습니다.', 'error');
            showStatus(scheduleStatusMessageDiv, '설정을 불러오지 못했습니다.', 'error');
        }
    } catch (error) {
        showStatus(statusMessageDiv, '네트워크 오류로 설정을 불러올 수 없습니다.', 'error');
        showStatus(teamMemberStatusMessageDiv, '네트워크 오류로 설정을 불러올 수 없습니다.', 'error');
        showStatus(scheduleStatusMessageDiv, '네트워크 오류로 설정을 불러올 수 없습니다.', 'error');
        console.error('Initial config load error:', error);
    }
}
