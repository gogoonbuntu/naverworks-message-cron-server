// src/services/team-service.js
// 팀원 관리 서비스

const logger = require('../../logger');
const configService = require('./config-service');
const messageService = require('./message-service');
const { getWeekKey, getCurrentKSTDate } = require('../utils/date-utils');

/**
 * 코드 리뷰 짝꿍 배정 및 전송 (매주 월요일 오전 9시) - 채널로 전송
 */
async function assignCodeReviewPairsAndSendMessage() {
    try {
        const config = configService.loadConfig();
        let teamMembers = config.teamMembers;

        logger.info('Starting code review pair assignment');
        logger.debug(`Team members: ${teamMembers.map(m => `${m.name}(${m.id})`).join(', ')}`);

        if (teamMembers.length < 2) {
            const message = "👥 코드 리뷰 짝꿍 알림 👥\n\n팀원이 부족하여 코드 리뷰 짝꿍을 배정할 수 없습니다.";
            logger.warn('Insufficient team members for code review pair assignment');
            await messageService.sendChannelMessage(message);
            return;
        }

        const shuffledMembers = [...teamMembers].sort(() => 0.5 - Math.random());
        let pairs = [];
        let remainingMembers = [...shuffledMembers];

        while (remainingMembers.length >= 2) {
            if (remainingMembers.length === 3) {
                pairs.push(remainingMembers.splice(0, 3));
            } else {
                pairs.push(remainingMembers.splice(0, 2));
            }
        }

        logger.info(`Created ${pairs.length} code review pairs`);
        pairs.forEach((pair, index) => {
            const pairInfo = pair.map(member => `${member.name}(${member.id})`).join(' & ');
            logger.debug(`Pair ${index + 1}: ${pairInfo}`);
        });

        let message = "👥 이번 주 코드 리뷰 짝꿍 알림 👥\n\n";
        pairs.forEach((pair, index) => {
            const pairNames = pair.map(member => teamMembers.find(m => m.id === member.id)?.name || member.id);
            message += `${index + 1}. ${pairNames.join(' & ')}\n`;
            
            pair.forEach(member => {
                const teamMember = teamMembers.find(m => m.id === member.id);
                if (teamMember) {
                    teamMember.codeReviewCount = (teamMember.codeReviewCount || 0) + 1;
                }
            });
        });

        message += "\n💡 코드 리뷰 가이드:\n";
        message += "- 서로의 코드를 정기적으로 리뷰해주세요\n";
        message += "- 건설적인 피드백 제공\n";
        message += "- 코드 품질 향상에 집중\n";
        message += "- 학습과 성장의 기회로 활용";

        // 짝꿍 정보 저장
        const codeReviewPairs = pairs.map((pair, index) => ({
            pairNumber: index + 1,
            members: pair.map(member => ({
                id: member.id,
                name: member.name
            })),
            weekKey: getWeekKey()
        }));

        configService.updateCodeReviewPairs(codeReviewPairs);
        configService.updateTeamMembers(teamMembers);

        // 채널로 알림 발송
        await messageService.sendChannelMessage(message);
        logger.info('Code review pair notification sent successfully to channel');
    } catch (error) {
        logger.error(`Error in code review pair assignment: ${error.message}`, error);
    }
}

/**
 * 노트북 지참 알림 배정 및 전송 (기존 기능 유지 - 개별 발송)
 */
async function assignLaptopDutyAndSendMessage() {
    try {
        const config = configService.loadConfig();
        let teamMembers = config.teamMembers;

        const todayKST = getCurrentKSTDate().getDay();
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        
        logger.info(`Starting laptop duty assignment for ${dayNames[todayKST]} (day ${todayKST})`);
        logger.debug(`Current team members: ${teamMembers.map(m => `${m.name}(${m.id})`).join(', ')}`);
        
        let selectedPair = [];
        let message = "⚠️ 노트북 지참 알림 ⚠️\n\n오늘 노트북 지참 당번은 다음과 같습니다:\n";

        if (todayKST === 5) { // 금요일
            logger.info('Processing Friday laptop duty assignment (weekend included)');
            const result = assignLaptopDutyPair(teamMembers, 'friday');
            selectedPair = result.selectedPair;
            message += result.message;
            
            configService.updateCurrentLaptopDutyPair(selectedPair);
            configService.updateTeamMembers(teamMembers);

        } else if (todayKST === 6 || todayKST === 0) { // 토/일요일
            logger.info('Processing weekend laptop duty (using Friday assignment)');
            if (config.currentLaptopDutyPair && config.currentLaptopDutyPair.length === 2) {
                selectedPair = config.currentLaptopDutyPair;
                const member1 = teamMembers.find(m => m.id === selectedPair[0]);
                const member2 = teamMembers.find(m => m.id === selectedPair[1]);
                message += `- ${member1 ? member1.name : selectedPair[0]} (${selectedPair[0]})\n`;
                message += `- ${member2 ? member2.name : selectedPair[1]} (${selectedPair[1]})\n`;
                logger.info(`Weekend assignment: ${selectedPair[0]} + ${selectedPair[1]} (from Friday)`);
            } else {
                message = "⚠️ 노트북 지참 알림 ⚠️\n\n금요일 당번 정보가 없어 당번을 배정할 수 없습니다.";
                selectedPair = [];
                logger.warn('No Friday assignment data available for weekend');
            }
        } else { // 월~목요일
            logger.info('Processing weekday laptop duty assignment');
            const result = assignLaptopDutyPair(teamMembers, 'weekday');
            selectedPair = result.selectedPair;
            message += result.message;
            
            configService.updateCurrentLaptopDutyPair([]);
            configService.updateTeamMembers(teamMembers);
        }

        if (selectedPair.length > 0 || message.includes("부족")) {
            const recipients = teamMembers.map(m => m.id).join(',');
            logger.info(`Sending laptop duty notification to all team members: ${recipients}`);
            await messageService.sendMessagesToMultipleRecipients(message, recipients);
            logger.info('Laptop duty notification sent successfully');
        }
    } catch (error) {
        logger.error(`Error in laptop duty assignment: ${error.message}`, error);
    }
}

/**
 * 노트북 당직 짝 배정 로직
 * @param {Array} teamMembers - 팀원 배열
 * @param {string} type - 배정 타입 ('friday', 'weekday')
 * @returns {Object} - 배정 결과 객체
 */
function assignLaptopDutyPair(teamMembers, type) {
    const authorizedMembers = teamMembers.filter(member => member.isAuthorized);
    authorizedMembers.sort((a, b) => (a.laptopDutyCount || 0) - (b.laptopDutyCount || 0));
    const selectedAuthorized = authorizedMembers.length > 0 ? authorizedMembers[0] : null;

    const otherMembers = teamMembers.filter(member => !member.isAuthorized || member.id !== (selectedAuthorized ? selectedAuthorized.id : null));
    otherMembers.sort((a, b) => (a.laptopDutyCount || 0) - (b.laptopDutyCount || 0));
    const selectedOther = otherMembers.length > 0 ? otherMembers[0] : null;

    let selectedPair = [];
    let message = "";

    if (selectedAuthorized && selectedOther) {
        selectedPair = [selectedAuthorized.id, selectedOther.id];
        teamMembers.find(m => m.id === selectedAuthorized.id).laptopDutyCount = (teamMembers.find(m => m.id === selectedAuthorized.id).laptopDutyCount || 0) + 1;
        teamMembers.find(m => m.id === selectedOther.id).laptopDutyCount = (teamMembers.find(m => m.id === selectedOther.id).laptopDutyCount || 0) + 1;
        message += `- ${teamMembers.find(m => m.id === selectedAuthorized.id).name} (${selectedAuthorized.id})\n`;
        message += `- ${teamMembers.find(m => m.id === selectedOther.id).name} (${selectedOther.id})\n`;
        logger.info(`${type} assignment: ${selectedAuthorized.id} (authorized) + ${selectedOther.id}`);
    } else if (teamMembers.length >= 2) {
        teamMembers.sort((a, b) => (a.laptopDutyCount || 0) - (b.laptopDutyCount || 0));
        selectedPair = [teamMembers[0].id, teamMembers[1].id];
        teamMembers.find(m => m.id === teamMembers[0].id).laptopDutyCount = (teamMembers.find(m => m.id === teamMembers[0].id).laptopDutyCount || 0) + 1;
        teamMembers.find(m => m.id === teamMembers[1].id).laptopDutyCount = (teamMembers.find(m => m.id === teamMembers[1].id).laptopDutyCount || 0) + 1;
        message += `- ${teamMembers.find(m => m.id === teamMembers[0].id).name} (${teamMembers[0].id})\n`;
        message += `- ${teamMembers.find(m => m.id === teamMembers[1].id).name} (${teamMembers[1].id})\n`;
        logger.info(`${type} assignment (fallback): ${teamMembers[0].id} + ${teamMembers[1].id}`);
    } else {
        message = "⚠️ 노트북 지참 알림 ⚠️\n\n팀원이 부족하여 노트북 당번을 배정할 수 없습니다.";
        selectedPair = [];
        logger.warn(`Insufficient team members for ${type} laptop duty assignment`);
    }

    return { selectedPair, message };
}

/**
 * 팀원 통계 정보 조회
 * @returns {Object} - 팀원 통계 정보
 */
function getTeamMemberStats() {
    try {
        const config = configService.loadConfig();
        const stats = {
            totalMembers: config.teamMembers.length,
            authorizedMembers: config.teamMembers.filter(m => m.isAuthorized).length,
            regularMembers: config.teamMembers.filter(m => !m.isAuthorized).length,
            dutyStats: config.teamMembers.map(m => ({
                id: m.id,
                name: m.name,
                dailyDutyCount: m.dailyDutyCount || 0,
                laptopDutyCount: m.laptopDutyCount || 0,
                codeReviewCount: m.codeReviewCount || 0
            }))
        };
        
        return stats;
    } catch (error) {
        logger.error(`Error getting team member stats: ${error.message}`, error);
        return null;
    }
}

/**
 * 팀원 당직 횟수 초기화
 */
function resetTeamMemberCounts() {
    try {
        const config = configService.loadConfig();
        config.teamMembers.forEach(member => {
            member.dailyDutyCount = 0;
            member.laptopDutyCount = 0;
            member.codeReviewCount = 0;
        });
        
        configService.updateTeamMembers(config.teamMembers);
        logger.info('Team member counts reset successfully');
        
        return { success: true, message: '팀원 당직 횟수가 초기화되었습니다.' };
    } catch (error) {
        logger.error(`Error resetting team member counts: ${error.message}`, error);
        return { success: false, message: '팀원 당직 횟수 초기화 중 오류가 발생했습니다.' };
    }
}

module.exports = {
    assignCodeReviewPairsAndSendMessage,
    assignLaptopDutyAndSendMessage,
    assignLaptopDutyPair,
    getTeamMemberStats,
    resetTeamMemberCounts
};
