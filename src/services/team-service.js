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
 * 노트북 지참 알림 전송 (당일 당직자에게 노트북 지참 알림)
 * 기존 복잡한 로직을 단순화: 오늘의 당직자 = 노트북 지참자
 */
async function assignLaptopDutyAndSendMessage() {
    try {
        const config = configService.loadConfig();
        const dutyService = require('./duty-service');
        
        logger.info('Starting laptop duty notification (using today\'s duty members)');
        
        // 오늘의 당직자 조회
        const todayDuty = dutyService.getTodayDutyMembers();
        
        if (!todayDuty || todayDuty.hasNoDuty || todayDuty.members.length === 0) {
            logger.warn('No duty assignment found for today - laptop duty notification skipped');
            
            // 당직자가 없으면 알림만 보내고 종료
            const message = "⚠️ 노트북 지참 알림 ⚠️\n\n" +
                          "오늘 당직자가 배정되지 않았습니다.\n" +
                          "주간 당직 편성을 확인해주세요.";
            
            const recipients = config.teamMembers.map(m => m.id).join(',');
            await messageService.sendMessagesToMultipleRecipients(message, recipients);
            return;
        }
        
        // 당직자들에게 노트북 지참 알림 발송
        const memberNames = todayDuty.members.map(m => `${m.name}(${m.id})`).join(' & ');
        
        let message = "⚠️ 노트북 지참 알림 ⚠️\n\n";
        message += `오늘(${todayDuty.displayDate}) 당직자 노트북 지참 안내:\n\n`;
        todayDuty.members.forEach(member => {
            message += `- ${member.name} (${member.id})\n`;
        });
        message += "\n📱 당직 업무 안내:\n";
        message += "- 노트북 지참 필수\n";
        message += "- 긴급상황 대응 준비\n";
        message += "- 당직 업무 수행\n\n";
        message += "수고하세요! 💪";
        
        // 모든 팀원에게 개별 발송
        const recipients = config.teamMembers.map(m => m.id).join(',');
        logger.info(`Sending laptop duty notification to all team members: ${recipients}`);
        logger.info(`Today's duty members for laptop notification: ${memberNames}`);
        
        await messageService.sendMessagesToMultipleRecipients(message, recipients);
        logger.info('Laptop duty notification sent successfully');
        
    } catch (error) {
        logger.error(`Error in laptop duty notification: ${error.message}`, error);
    }
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
                dutyCount: m.dutyCount || 0,
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
            member.dutyCount = 0;
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
    getTeamMemberStats,
    resetTeamMemberCounts
};
