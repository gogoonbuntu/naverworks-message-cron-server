// src/utils/date-utils.js
// 날짜 관련 유틸리티 함수들

/**
 * 주차 계산 함수 (년도와 주차)
 * @param {Date} date - 계산할 날짜 (기본값: 현재 날짜)
 * @returns {string} - YYYY-WXX 형식의 주차 키
 */
function getWeekKey(date = new Date()) {
    const kstDate = new Date(date.toLocaleString("en-US", {timeZone: "Asia/Seoul"}));
    const year = kstDate.getFullYear();
    const week = getWeekNumber(kstDate);
    return `${year}-W${week.toString().padStart(2, '0')}`;
}

/**
 * 주차 번호 계산 함수
 * @param {Date} date - 계산할 날짜
 * @returns {number} - 주차 번호 (1-53)
 */
function getWeekNumber(date) {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

/**
 * KST 시간대의 현재 날짜 반환
 * @returns {Date} - KST 시간대의 현재 날짜
 */
function getCurrentKSTDate() {
    return new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Seoul"}));
}

/**
 * 날짜를 YYYY-MM-DD 형식으로 변환
 * @param {Date} date - 변환할 날짜
 * @returns {string} - YYYY-MM-DD 형식의 날짜 문자열
 */
function formatDateToKey(date) {
    return date.toISOString().split('T')[0];
}

/**
 * 이번 주 월요일부터 일요일까지의 날짜 배열 반환
 * @param {Date} baseDate - 기준 날짜 (기본값: 현재 날짜)
 * @returns {string[]} - YYYY-MM-DD 형식의 날짜 배열 (월-일)
 */
function getWeekDates(baseDate = getCurrentKSTDate()) {
    const mondayDate = new Date(baseDate);
    mondayDate.setDate(baseDate.getDate() - baseDate.getDay() + 1);
    
    const weekDates = [];
    for (let i = 0; i < 7; i++) {
        const date = new Date(mondayDate);
        date.setDate(mondayDate.getDate() + i);
        weekDates.push(formatDateToKey(date));
    }
    
    return weekDates;
}

/**
 * 요일 이름 배열
 */
const DAY_NAMES = ['월', '화', '수', '목', '금', '토', '일'];

module.exports = {
    getWeekKey,
    getWeekNumber,
    getCurrentKSTDate,
    formatDateToKey,
    getWeekDates,
    DAY_NAMES
};
