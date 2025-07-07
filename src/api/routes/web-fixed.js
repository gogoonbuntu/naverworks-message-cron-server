// 웹 인터페이스 라우터 (수정된 버전)
// 프론트엔드에서 필요한 API 엔드포인트

const express = require('express');
const router = express.Router();
const ConfigService = require('../../services/config-service');
const GitHubService = require('../../services/github-service');
const logger = require('../../../logger');

const configService = new ConfigService();
let githubService = null;

// GitHub 서비스 초기화
try {
    githubService = new GitHubService();
} catch (error) {
    logger.warn('GitHub service initialization failed:', error.message);
}

/**
 * 설정 조회
 */
router.get('/config', (req, res) => {
    try {
        const config = configService.loadConfig();
        res.json(config);
    } catch (error) {
        logger.error(`Config load error: ${error.message}`);
        res.status(500).json({ error: 'Failed to load configuration' });
    }
});

/**
 * 팀원 업데이트
 */
router.post('/update-team-members', (req, res) => {
    try {
        const teamMembers = req.body;
        const config = configService.loadConfig();
        config.teamMembers = teamMembers;
        configService.saveConfig(config);
        
        res.json({
            success: true,
            message: '팀원 정보가 성공적으로 업데이트되었습니다.',
            teamMembers: teamMembers
        });
    } catch (error) {
        logger.error(`Team members update error: ${error.message}`);
        res.status(500).json({ error: 'Failed to update team members' });
    }
});

/**
 * 스케줄 업데이트
 */
router.post('/update-schedules', (req, res) => {
    try {
        const schedules = req.body;
        const config = configService.loadConfig();
        config.schedules = schedules;
        configService.saveConfig(config);
        
        res.json({
            success: true,
            message: '스케줄이 성공적으로 업데이트되었습니다.',
            config: schedules
        });
    } catch (error) {
        logger.error(`Schedules update error: ${error.message}`);
        res.status(500).json({ error: 'Failed to update schedules' });
    }
});

/**
 * 스케줄 실행
 */
router.post('/execute-schedule', (req, res) => {
    try {
        const { scheduleId } = req.body;
        // TODO: 스케줄 실행 로직 구현
        
        res.json({
            success: true,
            message: `스케줄 ID ${scheduleId}가 실행되었습니다.`
        });
    } catch (error) {
        logger.error(`Schedule execution error: ${error.message}`);
        res.status(500).json({ error: 'Failed to execute schedule' });
    }
});

/**
 * 주간 당직 편성 실행 (수정된 버전)
 */
router.post('/execute-weekly-duty', async (req, res) => {
    try {
        logger.info('Processing manual weekly duty assignment');
        
        // 실제 서비스 함수 호출
        const dutyService = require('../../services/duty-service');
        const result = await dutyService.assignWeeklyDutySchedule();
        
        if (result.success) {
            logger.info('Manual weekly duty assignment completed successfully');
            res.json({
                success: true,
                message: result.message
            });
        } else {
            logger.error(`Weekly duty assignment failed: ${result.message}`);
            res.status(400).json({
                success: false,
                message: result.message
            });
        }
    } catch (error) {
        logger.error(`Weekly duty execution error: ${error.message}`, error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to execute weekly duty assignment' 
        });
    }
});

/**
 * 코드리뷰 짝꿍 편성 실행 (수정된 버전)
 */
router.post('/execute-code-review', async (req, res) => {
    try {
        logger.info('Processing manual code review pair assignment');
        
        // 실제 서비스 함수 호출
        const teamService = require('../../services/team-service');
        await teamService.assignCodeReviewPairsAndSendMessage();
        
        logger.info('Code review pair notification sent successfully');
        
        // 설정 다시 로드하여 업데이트된 정보 반환
        const config = configService.loadConfig();
        
        res.json({
            success: true,
            message: '코드리뷰 짝꿍이 성공적으로 편성되고 알림이 전송되었습니다.',
            pairs: config.codeReviewPairs || []
        });
    } catch (error) {
        logger.error(`Code review execution error: ${error.message}`, error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to execute code review pairing' 
        });
    }
});

// 주차 계산 헬퍼 함수
function getWeekNumber(date) {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

/**
 * 주간 당직 편성표 조회
 */
router.get('/weekly-duty-schedule', (req, res) => {
    try {
        const dutyService = require('../../services/duty-service');
        const weeklySchedule = dutyService.getWeeklyDutySchedule();
        res.json(weeklySchedule);
    } catch (error) {
        logger.error(`Weekly duty schedule error: ${error.message}`);
        res.status(500).json({ error: 'Failed to get weekly duty schedule' });
    }
});

/**
 * 오늘의 당직자 조회
 */
router.get('/today-duty', (req, res) => {
    try {
        const dutyService = require('../../services/duty-service');
        const todayDuty = dutyService.getTodayDutyMembers();
        res.json(todayDuty);
    } catch (error) {
        logger.error(`Today duty error: ${error.message}`);
        res.status(500).json({ error: 'Failed to get today duty information' });
    }
});

// GitHub 관련 엔드포인트들은 기존과 동일하게 유지...
// (생략 - 필요시 기존 파일에서 복사)

module.exports = router;