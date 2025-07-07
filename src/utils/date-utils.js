// 날짜 관련 유틸리티 함수들
// 한국 시간대 기준 날짜 처리

/**
 * 한국 시간 기준 현재 날짜 반환
 */
function getKSTDate(date = null) {
    const targetDate = date ? new Date(date) : new Date();
    return new Date(targetDate.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
}

/**
 * 주간 시작일/종료일 계산 (월요일 시작)
 */
function getWeekRange(date = null) {
    const kstDate = getKSTDate(date);
    const dayOfWeek = kstDate.getDay();
    
    // 월요일을 주의 시작으로 설정 (0=일요일, 1=월요일)
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    
    const monday = new Date(kstDate);
    monday.setDate(kstDate.getDate() + mondayOffset);
    monday.setHours(0, 0, 0, 0);
    
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    
    return {
        start: monday,
        end: sunday,
        startDate: monday.toISOString().split('T')[0],
        endDate: sunday.toISOString().split('T')[0]
    };
}

/**
 * 지난 주 범위 계산
 */
function getLastWeekRange(date = null) {
    const kstDate = getKSTDate(date);
    const lastWeek = new Date(kstDate);
    lastWeek.setDate(kstDate.getDate() - 7);
    
    return getWeekRange(lastWeek);
}

/**
 * 월간 시작일/종료일 계산
 */
function getMonthRange(date = null) {
    const kstDate = getKSTDate(date);
    
    const firstDay = new Date(kstDate.getFullYear(), kstDate.getMonth(), 1);
    firstDay.setHours(0, 0, 0, 0);
    
    const lastDay = new Date(kstDate.getFullYear(), kstDate.getMonth() + 1, 0);
    lastDay.setHours(23, 59, 59, 999);
    
    return {
        start: firstDay,
        end: lastDay,
        startDate: firstDay.toISOString().split('T')[0],
        endDate: lastDay.toISOString().split('T')[0]
    };
}

/**
 * 지난 달 범위 계산
 */
function getLastMonthRange(date = null) {
    const kstDate = getKSTDate(date);
    const lastMonth = new Date(kstDate.getFullYear(), kstDate.getMonth() - 1, 1);
    
    return getMonthRange(lastMonth);
}

/**
 * 주차 번호 계산
 */
function getWeekNumber(date = null) {
    const kstDate = getKSTDate(date);
    const firstDayOfYear = new Date(kstDate.getFullYear(), 0, 1);
    const pastDaysOfYear = (kstDate - firstDayOfYear) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

/**
 * 날짜 포맷팅
 */
function formatDate(date, format = 'YYYY-MM-DD') {
    const d = new Date(date);
    
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    
    return format
        .replace('YYYY', year)
        .replace('MM', month)
        .replace('DD', day)
        .replace('HH', hours)
        .replace('mm', minutes)
        .replace('ss', seconds);
}

/**
 * 한국어 날짜 포맷팅
 */
function formatDateKorean(date, includeTime = false) {
    const d = getKSTDate(date);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const day = d.getDate();
    
    let formatted = `${year}년 ${month}월 ${day}일`;
    
    if (includeTime) {
        const hours = d.getHours();
        const minutes = d.getMinutes();
        formatted += ` ${hours}시 ${minutes}분`;
    }
    
    return formatted;
}

/**
 * 요일 반환 (한국어)
 */
function getDayOfWeekKorean(date = null) {
    const kstDate = getKSTDate(date);
    const days = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
    return days[kstDate.getDay()];
}

/**
 * 두 날짜 간의 차이 계산
 */
function getDateDiff(startDate, endDate, unit = 'days') {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end - start);
    
    switch (unit) {
        case 'days':
            return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        case 'hours':
            return Math.ceil(diffTime / (1000 * 60 * 60));
        case 'minutes':
            return Math.ceil(diffTime / (1000 * 60));
        case 'seconds':
            return Math.ceil(diffTime / 1000);
        default:
            return diffTime;
    }
}

/**
 * 날짜가 오늘인지 확인
 */
function isToday(date) {
    const today = getKSTDate();
    const targetDate = getKSTDate(date);
    
    return today.getFullYear() === targetDate.getFullYear() &&
           today.getMonth() === targetDate.getMonth() &&
           today.getDate() === targetDate.getDate();
}

/**
 * 날짜가 이번 주인지 확인
 */
function isThisWeek(date) {
    const thisWeek = getWeekRange();
    const targetDate = getKSTDate(date);
    
    return targetDate >= thisWeek.start && targetDate <= thisWeek.end;
}

/**
 * 날짜가 이번 달인지 확인
 */
function isThisMonth(date) {
    const thisMonth = getMonthRange();
    const targetDate = getKSTDate(date);
    
    return targetDate >= thisMonth.start && targetDate <= thisMonth.end;
}

/**
 * 상대적 시간 표현 (예: "2시간 전", "3일 후")
 */
function getRelativeTime(date) {
    const now = getKSTDate();
    const targetDate = getKSTDate(date);
    const diffMs = targetDate - now;
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (Math.abs(diffSeconds) < 60) {
        return '방금 전';
    } else if (Math.abs(diffMinutes) < 60) {
        return diffMinutes > 0 ? `${diffMinutes}분 후` : `${Math.abs(diffMinutes)}분 전`;
    } else if (Math.abs(diffHours) < 24) {
        return diffHours > 0 ? `${diffHours}시간 후` : `${Math.abs(diffHours)}시간 전`;
    } else if (Math.abs(diffDays) < 30) {
        return diffDays > 0 ? `${diffDays}일 후` : `${Math.abs(diffDays)}일 전`;
    } else {
        return formatDateKorean(targetDate);
    }
}

/**
 * 업무일인지 확인 (주말 제외)
 */
function isWorkday(date = null) {
    const kstDate = getKSTDate(date);
    const dayOfWeek = kstDate.getDay();
    return dayOfWeek !== 0 && dayOfWeek !== 6; // 일요일(0), 토요일(6) 제외
}

/**
 * 다음 업무일 계산
 */
function getNextWorkday(date = null) {
    let nextDay = getKSTDate(date);
    
    do {
        nextDay.setDate(nextDay.getDate() + 1);
    } while (!isWorkday(nextDay));
    
    return nextDay;
}

/**
 * 이전 업무일 계산
 */
function getPreviousWorkday(date = null) {
    let prevDay = getKSTDate(date);
    
    do {
        prevDay.setDate(prevDay.getDate() - 1);
    } while (!isWorkday(prevDay));
    
    return prevDay;
}

/**
 * 현재 한국 시간 날짜 반환 (기존 함수와 호환성 유지)
 */
function getCurrentKSTDate() {
    return getKSTDate();
}

/**
 * 주차 키 생성 (YYYY-WW 형식)
 */
function getWeekKey(date = null) {
    const kstDate = getKSTDate(date);
    const year = kstDate.getFullYear();
    const weekNumber = getWeekNumber(date);
    
    return `${year}-${String(weekNumber).padStart(2, '0')}`;
}

/**
 * 날짜를 키 형식으로 변환 (YYYY-MM-DD)
 */
function formatDateToKey(date) {
    const d = getKSTDate(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
}

/**
 * 이번 주 날짜 배열 반환 (월요일부터 일요일까지)
 */
function getWeekDates(date = null) {
    const weekRange = getWeekRange(date);
    const dates = [];
    
    for (let i = 0; i < 7; i++) {
        const currentDate = new Date(weekRange.start);
        currentDate.setDate(weekRange.start.getDate() + i);
        dates.push(formatDateToKey(currentDate));
    }
    
    return dates;
}

/**
 * 요일 이름 배열 (상수)
 */
const DAY_NAMES = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'];

module.exports = {
    getKSTDate,
    getCurrentKSTDate,
    getWeekKey,
    formatDateToKey,
    getWeekDates,
    DAY_NAMES,
    getWeekRange,
    getLastWeekRange,
    getMonthRange,
    getLastMonthRange,
    getWeekNumber,
    formatDate,
    formatDateKorean,
    getDayOfWeekKorean,
    getDateDiff,
    isToday,
    isThisWeek,
    isThisMonth,
    getRelativeTime,
    isWorkday,
    getNextWorkday,
    getPreviousWorkday
};
