// src/services/config-service.js
// 설정 파일 관리 서비스

const fs = require('fs');
const path = require('path');
const logger = require('../../logger');

const CONFIG_FILE = path.join(__dirname, '../../config.json');

/**
 * 기본 설정 구조
 */
const DEFAULT_CONFIG = {
    schedules: [],
    teamMembers: [],
    codeReviewPairs: [],
    dailyDutySchedule: {},
    currentLaptopDutyPair: []
};

/**
 * 설정 파일 로드 함수
 * @returns {Object} - 설정 객체
 */
function loadConfig() {
    if (!fs.existsSync(CONFIG_FILE)) {
        logger.warn('Configuration file does not exist. Initializing with default config.');
        saveConfig(DEFAULT_CONFIG);
        return DEFAULT_CONFIG;
    }
    
    try {
        const configRaw = fs.readFileSync(CONFIG_FILE, 'utf8');
        const config = JSON.parse(configRaw);
        
        // 필수 속성 확인 및 초기화
        if (!config.schedules) config.schedules = [];
        if (!config.teamMembers) config.teamMembers = [];
        if (!config.codeReviewPairs) config.codeReviewPairs = [];
        if (!config.dailyDutySchedule) config.dailyDutySchedule = {};
        if (!config.currentLaptopDutyPair) config.currentLaptopDutyPair = [];
        
        logger.info(`Configuration loaded successfully. Schedules: ${config.schedules.length}, Team members: ${config.teamMembers.length}`);
        return config;
    } catch (e) {
        logger.error(`Configuration file parsing failed: ${e.message}`, e);
        logger.warn('Initializing with default configuration due to parsing error.');
        saveConfig(DEFAULT_CONFIG);
        return DEFAULT_CONFIG;
    }
}

/**
 * 설정 파일 저장 함수
 * @param {Object} config - 저장할 설정 객체
 */
function saveConfig(config) {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
        logger.info('Configuration file saved successfully');
        logger.debug(`Configuration saved: ${JSON.stringify(config, null, 2)}`);
    } catch (error) {
        logger.error(`Failed to save configuration file: ${error.message}`, error);
        throw error;
    }
}

/**
 * 특정 설정 섹션 업데이트
 * @param {string} section - 업데이트할 섹션 이름
 * @param {*} data - 업데이트할 데이터
 */
function updateConfigSection(section, data) {
    const config = loadConfig();
    config[section] = data;
    saveConfig(config);
    logger.logConfigChange(section, `Updated ${section}`, data);
}

/**
 * 팀원 정보 업데이트
 * @param {Array} teamMembers - 팀원 배열
 */
function updateTeamMembers(teamMembers) {
    updateConfigSection('teamMembers', teamMembers);
}

/**
 * 스케줄 정보 업데이트
 * @param {Array} schedules - 스케줄 배열
 */
function updateSchedules(schedules) {
    updateConfigSection('schedules', schedules);
}

/**
 * 일간 당직 스케줄 업데이트
 * @param {string} dateKey - 날짜 키 (YYYY-MM-DD)
 * @param {Array} members - 당직자 배열
 */
function updateDailyDutySchedule(dateKey, members) {
    const config = loadConfig();
    config.dailyDutySchedule[dateKey] = {
        members: members,
        assignedAt: new Date().toISOString()
    };
    saveConfig(config);
}

/**
 * 현재 노트북 당직 짝 업데이트
 * @param {Array} pair - 노트북 당직 짝 배열
 */
function updateCurrentLaptopDutyPair(pair) {
    updateConfigSection('currentLaptopDutyPair', pair);
}

/**
 * 코드 리뷰 짝 업데이트
 * @param {Array} pairs - 코드 리뷰 짝 배열
 */
function updateCodeReviewPairs(pairs) {
    updateConfigSection('codeReviewPairs', pairs);
}

/**
 * 설정 파일 경로 반환
 * @returns {string} - 설정 파일 경로
 */
function getConfigFilePath() {
    return CONFIG_FILE;
}

module.exports = {
    loadConfig,
    saveConfig,
    updateConfigSection,
    updateTeamMembers,
    updateSchedules,
    updateDailyDutySchedule,
    updateCurrentLaptopDutyPair,
    updateCodeReviewPairs,
    getConfigFilePath,
    DEFAULT_CONFIG
};
