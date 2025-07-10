// src/services/duty-service.js
// 당직 관리 서비스

const logger = require('../../logger');
const configService = require('./config-service');
const messageService = require('./message-service');
const { getCurrentKSTDate, formatDateToKey, getWeekDates, DAY_NAMES } = require('../utils/date-utils');

/**
 * 주간 당직 편성표 조회 (7일간의 일일 당직자)
 * @returns {Array} - 주간 당직 스케줄 배열
 */
function getWeeklyDutySchedule() {
    try {
        const config = configService.loadConfig();
        const weekDates = getWeekDates();
        
        const weeklySchedule = [];
        
        weekDates.forEach((dateKey, index) => {
            const date = new Date(dateKey);
            let members = [];
            
            // dailyDutySchedule에서 해당 날짜의 당직자 찾기
            const dutyData = config.dailyDutySchedule?.[dateKey];
            if (dutyData && dutyData.members) {
                members = dutyData.members;
            }
            
            weeklySchedule.push({
                date: dateKey,
                dayName: DAY_NAMES[index],
                displayDate: `${date.getMonth() + 1}/${date.getDate()}`,
                members: members.map(id => {
                    const member = config.teamMembers.find(m => m.id === id);
                    return member ? { id: member.id, name: member.name } : { id: id, name: id };
                })
            });
        });
        
        return weeklySchedule;
    } catch (error) {
        logger.error(`Error getting weekly duty schedule: ${error.message}`, error);
        return [];
    }
}

/**
 * 당일 당직자 조회 함수
 * @returns {Object|null} - 당일 당직자 정보 또는 null
 */
function getTodayDutyMembers() {
    try {
        const config = configService.loadConfig();
        const kstDate = getCurrentKSTDate();
        const dateKey = formatDateToKey(kstDate);
        
        logger.debug(`Looking for today's duty for date: ${dateKey}`);
        
        // dailyDutySchedule에서 당일 당직자 찾기
        const todayDuty = config.dailyDutySchedule?.[dateKey];
        
        if (!todayDuty || !todayDuty.members || todayDuty.members.length === 0) {
            logger.debug(`No duty found for today: ${dateKey}`);
            return {
                date: dateKey,
                members: [],
                displayDate: kstDate.toLocaleDateString('ko-KR'),
                hasNoDuty: true
            };
        }
        
        // 당직자 정보 반환
        const dutyMembers = todayDuty.members.map(id => {
            const member = config.teamMembers.find(m => m.id === id);
            return member ? { id: member.id, name: member.name } : { id: id, name: id };
        });
        
        logger.debug(`Today's duty members: ${dutyMembers.map(m => m.name).join(', ')}`);
        
        return {
            date: dateKey,
            members: dutyMembers,
            displayDate: kstDate.toLocaleDateString('ko-KR'),
            hasNoDuty: false
        };
        
    } catch (error) {
        logger.error(`Error getting today's duty members: ${error.message}`, error);
        return {
            date: null,
            members: [],
            displayDate: new Date().toLocaleDateString('ko-KR'),
            hasNoDuty: true,
            error: true
        };
    }
}

/**
 * 일간 당직 편성 함수
 * @param {string} date - 날짜 (YYYY-MM-DD)
 * @param {Array} dutyMembers - 당직자 ID 배열
 * @returns {Object} - 결과 객체
 */
async function assignDailyDuty(date, dutyMembers) {
    try {
        const config = configService.loadConfig();
        const dateKey = date; // YYYY-MM-DD 형식
        
        logger.info(`Setting daily duty for ${dateKey}`);
        
        // 일간 당직 저장
        configService.updateDailyDutySchedule(dateKey, dutyMembers);
        
        // 각 팀원의 당직 횟수 업데이트
        dutyMembers.forEach(memberId => {
            const member = config.teamMembers.find(m => m.id === memberId);
            if (member) {
                member.dailyDutyCount = (member.dailyDutyCount || 0) + 1;
            }
        });
        
        configService.updateTeamMembers(config.teamMembers);
        logger.info('Daily duty schedule saved successfully');
        
        return { success: true, message: '일간 당직이 성공적으로 저장되었습니다.' };
        
    } catch (error) {
        logger.error(`Error in daily duty assignment: ${error.message}`, error);
        return { success: false, message: '일간 당직 저장 중 오류가 발생했습니다.' };
    }
}

/**
 * 주간 당직표 자동 편성 함수
 * @returns {Object} - 결과 객체
 */
async function assignWeeklyDutySchedule() {
    try {
        const config = configService.loadConfig();
        const weekDates = getWeekDates();
        
        logger.info(`Assigning weekly duty schedule for ${weekDates[0]} to ${weekDates[6]}`);
        
        // 팀원들을 당직 횟수 기준으로 정렬
        const availableMembers = [...config.teamMembers];
        availableMembers.sort((a, b) => (a.dailyDutyCount || 0) - (b.dailyDutyCount || 0));
        
        if (availableMembers.length < 2) {
            logger.warn('Not enough team members for duty assignment');
            return { success: false, message: '당직 편성을 위한 팀원이 부족합니다.' };
        }
        
        // 각 날짜에 대해 당직자 배정
        let memberIndex = 0;
        const assignments = [];
        
        for (const dateKey of weekDates) {
            const dutyMembers = [];
            
            // 권한자 1명 + 일반 팀원 1명 구성
            const authorizedMembers = availableMembers.filter(m => m.isAuthorized);
            const regularMembers = availableMembers.filter(m => !m.isAuthorized);
            
            if (authorizedMembers.length > 0) {
                dutyMembers.push(authorizedMembers[memberIndex % authorizedMembers.length].id);
            }
            
            if (regularMembers.length > 0) {
                dutyMembers.push(regularMembers[memberIndex % regularMembers.length].id);
            } else if (availableMembers.length > 1) {
                dutyMembers.push(availableMembers[(memberIndex + 1) % availableMembers.length].id);
            }
            
            // 1명만 있는 경우 해당 팀원 배정
            if (dutyMembers.length === 0 && availableMembers.length > 0) {
                dutyMembers.push(availableMembers[0].id);
            }
            
            assignments.push({ date: dateKey, members: dutyMembers });
            memberIndex++;
        }
        
        // 모든 일간 당직 저장
        for (const assignment of assignments) {
            await assignDailyDuty(assignment.date, assignment.members);
        }
        
        logger.info('Weekly duty schedule assigned successfully');
        
        // 채널로 알림 발송
        const weeklyMessage = generateWeeklyDutyMessage(assignments, config);
        await messageService.sendChannelMessage(weeklyMessage);
        
        return { success: true, message: '주간 당직표가 성공적으로 편성되었습니다.' };
        
    } catch (error) {
        logger.error(`Error in weekly duty assignment: ${error.message}`, error);
        return { success: false, message: '주간 당직 편성 중 오류가 발생했습니다.' };
    }
}

/**
 * 주간 당직표 메시지 생성
 * @param {Array} assignments - 당직 배정 배열
 * @param {Object} config - 설정 객체
 * @returns {string} - 생성된 메시지
 */
function generateWeeklyDutyMessage(assignments, config) {
    let message = "📅 이번 주 당직 편성표 📅\n\n";
    
    assignments.forEach((assignment, index) => {
        const members = assignment.members.map(id => {
            const member = config.teamMembers.find(m => m.id === id);
            return member ? `${member.name}(${id})` : id;
        }).join(' & ');
        
        const date = new Date(assignment.date);
        const displayDate = `${date.getMonth() + 1}/${date.getDate()}`;
        
        message += `${DAY_NAMES[index]} (${displayDate}): ${members}\n`;
    });
    
    message += "\n💡 당직 안내:\n";
    message += "- 당직 시간: 매일 오후 2시, 4시 알림\n";
    message += "- 당직 업무: 사무실 보안 및 시설 점검\n";
    message += "- 긴급상황 발생시 즉시 보고\n\n";
    message += "수고하세요! 💪";
    
    return message;
}

/**
 * 당직자 알림 (매일 오후 2시, 4시) - 채널로 전송
 */
async function sendDutyReminderMessage() {
    try {
        const config = configService.loadConfig();
        const kstDate = getCurrentKSTDate();
        const dateKey = formatDateToKey(kstDate);
        const currentHour = kstDate.getHours();

        // 오늘의 당직자 찾기
        const todayDuty = config.dailyDutySchedule[dateKey];
        if (!todayDuty || !todayDuty.members || todayDuty.members.length === 0) {
            logger.warn(`No duty assignment found for ${dateKey}`);
            return;
        }

        const timeSlot = currentHour === 14 ? '오후 2시' : '오후 4시';
        const dutyMembers = todayDuty.members;
        const memberNames = dutyMembers.map(id => {
            const member = config.teamMembers.find(m => m.id === id);
            return member ? `${member.name}(${id})` : id;
        }).join(' & ');

        const displayDate = kstDate.toLocaleDateString('ko-KR');
        const message = `🔔 당직 알림 (${timeSlot}) 🔔\n\n` +
                       `오늘(${displayDate}) 당직자: ${memberNames}\n\n` +
                       `당직 체크사항:\n` +
                       `- 사무실 보안 상태 확인\n` +
                       `- 시설 이상 유무 점검\n` +
                       `- 긴급상황 대응 준비\n\n` +
                       `수고하세요! 💪`;

        // 채널로 알림 발송
        await messageService.sendChannelMessage(message);
        logger.info(`Duty reminder sent to channel for ${memberNames} at ${timeSlot}`);

    } catch (error) {
        logger.error(`Error in duty reminder: ${error.message}`, error);
    }
}

module.exports = {
    getWeeklyDutySchedule,
    getTodayDutyMembers,
    assignDailyDuty,
    assignWeeklyDutySchedule,
    generateWeeklyDutyMessage,
    sendDutyReminderMessage
};
