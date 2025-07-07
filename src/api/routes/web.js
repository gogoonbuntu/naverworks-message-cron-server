// 웹 인터페이스 라우터 (수정된 버전)
// 프론트엔드에서 필요한 API 엔드포인트

const express = require('express');
const router = express.Router();
const ConfigService = require('../../services/config-service');
const logger = require('../../../logger');

const configService = new ConfigService();

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
        
        // 입력 검증
        if (!Array.isArray(teamMembers)) {
            return res.status(400).json({ 
                success: false, 
                message: '팀원 데이터는 배열 형식이어야 합니다.' 
            });
        }

        // 설정 업데이트
        configService.updateTeamMembers(teamMembers);
        
        res.json({
            success: true,
            message: '팀원 정보가 성공적으로 업데이트되었습니다.',
            teamMembers: teamMembers
        });
    } catch (error) {
        logger.error(`Team members update error: ${error.message}`);
        res.status(500).json({ 
            success: false, 
            message: '팀원 정보 업데이트 중 오류가 발생했습니다.' 
        });
    }
});

/**
 * 스케줄 업데이트
 */
router.post('/update-schedules', (req, res) => {
    try {
        const schedules = req.body;
        
        // 입력 검증
        if (!Array.isArray(schedules)) {
            return res.status(400).json({ 
                success: false, 
                message: '스케줄 데이터는 배열 형식이어야 합니다.' 
            });
        }

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
        res.status(500).json({ 
            success: false, 
            message: '스케줄 업데이트 중 오류가 발생했습니다.' 
        });
    }
});

/**
 * 스케줄 실행
 */
router.post('/execute-schedule', (req, res) => {
    try {
        const { scheduleId } = req.body;
        
        if (!scheduleId) {
            return res.status(400).json({ 
                success: false, 
                message: '스케줄 ID가 필요합니다.' 
            });
        }

        // TODO: 실제 스케줄 실행 로직 구현
        logger.info(`Executing schedule: ${scheduleId}`);
        
        res.json({
            success: true,
            message: `스케줄 ID ${scheduleId}가 실행되었습니다.`
        });
    } catch (error) {
        logger.error(`Schedule execution error: ${error.message}`);
        res.status(500).json({ 
            success: false, 
            message: '스케줄 실행 중 오류가 발생했습니다.' 
        });
    }
});

/**
 * 주간 당직 편성 실행
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
            message: '주간 당직 편성 중 오류가 발생했습니다.' 
        });
    }
});

/**
 * 코드리뷰 짝꿍 편성 실행
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
            message: '코드리뷰 짝꿍 편성 중 오류가 발생했습니다.' 
        });
    }
});

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
        res.status(500).json({ 
            success: false, 
            message: '주간 당직 편성표 조회 중 오류가 발생했습니다.' 
        });
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
        res.status(500).json({ 
            success: false, 
            message: '오늘의 당직자 조회 중 오류가 발생했습니다.' 
        });
    }
});

/**
 * 주간 당직 편성 미리보기
 */
router.post('/preview-weekly-duty', async (req, res) => {
    try {
        logger.info('Processing weekly duty preview request');
        
        const config = configService.loadConfig();
        const authorizedMembers = config.teamMembers.filter(m => m.isAuthorized);
        
        if (authorizedMembers.length < 2) {
            return res.status(400).json({
                success: false,
                message: '당직 편성을 위한 권한 팀원이 부족합니다. (최소 2명 필요)'
            });
        }
        
        // 미리보기 메시지 생성
        const dutyService = require('../../services/duty-service');
        const previewData = dutyService.generateWeeklyDutyPreview();
        
        res.json({
            success: true,
            previewMessage: previewData.message,
            authorizedCount: authorizedMembers.length,
            weekRange: previewData.weekRange,
            assignments: previewData.assignments
        });
    } catch (error) {
        logger.error(`Weekly duty preview error: ${error.message}`, error);
        res.status(500).json({ 
            success: false, 
            message: '주간 당직 편성 미리보기 생성 중 오류가 발생했습니다.' 
        });
    }
});

/**
 * 코드리뷰 짝꿍 편성 미리보기
 */
router.post('/preview-code-review', async (req, res) => {
    try {
        logger.info('Processing code review preview request');
        
        const config = configService.loadConfig();
        const teamMembers = config.teamMembers;
        
        if (teamMembers.length < 2) {
            return res.status(400).json({
                success: false,
                message: '코드리뷰 짝꿍 편성을 위한 팀원이 부족합니다. (최소 2명 필요)'
            });
        }
        
        // 미리보기 메시지 생성
        const teamService = require('../../services/team-service');
        const previewData = teamService.generateCodeReviewPreview();
        
        res.json({
            success: true,
            previewMessage: previewData.message,
            totalMembers: teamMembers.length,
            weekKey: previewData.weekKey,
            pairs: previewData.pairs
        });
    } catch (error) {
        logger.error(`Code review preview error: ${error.message}`, error);
        res.status(500).json({ 
            success: false, 
            message: '코드리뷰 짝꿍 편성 미리보기 생성 중 오류가 발생했습니다.' 
        });
    }
});

/**
 * GitHub 상태 조회 (기본 구현)
 */
router.get('/github/status', (req, res) => {
    try {
        // GitHub 서비스 로드 시도
        let githubService = null;
        try {
            const GitHubService = require('../../services/github-service');
            githubService = new GitHubService();
        } catch (error) {
            logger.debug('GitHub service not available:', error.message);
        }

        if (githubService && githubService.isEnabled) {
            const status = githubService.getServiceStatus();
            res.json(status);
        } else {
            res.json({ 
                isEnabled: false, 
                message: 'GitHub service not available',
                config: {
                    repositoryCount: 0,
                    teamMemberCount: 0,
                    weeklyReportsEnabled: false
                }
            });
        }
    } catch (error) {
        logger.error(`GitHub status error: ${error.message}`);
        res.status(500).json({ 
            success: false, 
            message: 'GitHub 상태 조회 중 오류가 발생했습니다.' 
        });
    }
});

module.exports = router;