// 웹 인터페이스 라우터
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
 * 주간 당직 편성 실행
 */
router.post('/execute-weekly-duty', (req, res) => {
    try {
        const config = configService.loadConfig();
        
        // 권한이 있는 팀원들만 당직 대상
        const authorizedMembers = config.teamMembers.filter(member => member.isAuthorized);
        
        if (authorizedMembers.length < 2) {
            return res.status(400).json({
                success: false,
                message: '당직 편성을 위해서는 최소 2명의 권한 있는 팀원이 필요합니다.'
            });
        }
        
        // 이번 주 당직 편성 생성
        const today = new Date();
        const kstToday = new Date(today.toLocaleString("en-US", {timeZone: "Asia/Seoul"}));
        const currentDayOfWeek = kstToday.getDay();
        const mondayOffset = currentDayOfWeek === 0 ? -6 : 1 - currentDayOfWeek;
        
        const monday = new Date(kstToday);
        monday.setDate(kstToday.getDate() + mondayOffset);
        
        // 주간 편성표 생성 (월-금)
        const weeklyDuty = [];
        const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
        
        // 팀원들을 순환하면서 배정
        for (let i = 0; i < 5; i++) {
            const day = dayNames[i];
            const membersForDay = [];
            
            // 각 요일에 2명씩 배정 (팀원 수에 따라 조정)
            const membersPerDay = Math.min(2, authorizedMembers.length);
            
            for (let j = 0; j < membersPerDay; j++) {
                const memberIndex = (i * membersPerDay + j) % authorizedMembers.length;
                const member = authorizedMembers[memberIndex];
                membersForDay.push(member.id);
                
                // 당직 횟수 증가
                member.weeklyDutyCount = (member.weeklyDutyCount || 0) + 1;
            }
            
            weeklyDuty.push({
                day: day,
                members: membersForDay
            });
        }
        
        // 주차 키 생성 (ISO 주차)
        const year = monday.getFullYear();
        const weekNumber = getWeekNumber(monday);
        const weekKey = `${year}-W${weekNumber.toString().padStart(2, '0')}`;
        
        // config 업데이트
        config.currentWeekDuty = weeklyDuty;
        config.weeklyDutySchedule = config.weeklyDutySchedule || {};
        config.weeklyDutySchedule[weekKey] = weeklyDuty;
        
        configService.saveConfig(config);
        
        res.json({
            success: true,
            message: `${weekKey} 주간 당직이 성공적으로 편성되었습니다.`,
            weekKey: weekKey,
            schedule: weeklyDuty
        });
    } catch (error) {
        logger.error(`Weekly duty execution error: ${error.message}`);
        res.status(500).json({ error: 'Failed to execute weekly duty assignment' });
    }
});

// 주차 계산 헬퍼 함수
function getWeekNumber(date) {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

/**
 * 코드리뷰 짝꿍 편성 실행
 */
router.post('/execute-code-review', (req, res) => {
    try {
        const config = configService.loadConfig();
        const allMembers = config.teamMembers || [];
        
        if (allMembers.length < 2) {
            return res.status(400).json({
                success: false,
                message: '코드리뷰 짝꿍 편성을 위해서는 최소 2명의 팀원이 필요합니다.'
            });
        }
        
        // 주차 키 생성
        const today = new Date();
        const kstToday = new Date(today.toLocaleString("en-US", {timeZone: "Asia/Seoul"}));
        const year = kstToday.getFullYear();
        const weekNumber = getWeekNumber(kstToday);
        const weekKey = `${year}-W${weekNumber.toString().padStart(2, '0')}`;
        
        // 팀원들을 섞어서 짝꿍 생성
        const shuffledMembers = [...allMembers].sort(() => Math.random() - 0.5);
        const pairs = [];
        
        let pairNumber = 1;
        for (let i = 0; i < shuffledMembers.length; i += 2) {
            const pairMembers = [];
            
            // 첫 번째 멤버
            pairMembers.push({
                id: shuffledMembers[i].id,
                name: shuffledMembers[i].name
            });
            
            // 두 번째 멤버 (있는 경우)
            if (i + 1 < shuffledMembers.length) {
                pairMembers.push({
                    id: shuffledMembers[i + 1].id,
                    name: shuffledMembers[i + 1].name
                });
            }
            
            // 홀수 명수인 경우 마지막 그룹에 세 번째 멤버 추가
            if (i + 2 === shuffledMembers.length - 1) {
                pairMembers.push({
                    id: shuffledMembers[i + 2].id,
                    name: shuffledMembers[i + 2].name
                });
                break;
            }
            
            pairs.push({
                pairNumber: pairNumber++,
                members: pairMembers,
                weekKey: weekKey
            });
            
            // 코드리뷰 횟수 증가
            pairMembers.forEach(member => {
                const teamMember = config.teamMembers.find(m => m.id === member.id);
                if (teamMember) {
                    teamMember.codeReviewCount = (teamMember.codeReviewCount || 0) + 1;
                }
            });
        }
        
        // config 업데이트
        config.codeReviewPairs = pairs;
        configService.saveConfig(config);
        
        res.json({
            success: true,
            message: `${weekKey} 코드리뷰 짝꿍이 성공적으로 편성되었습니다.`,
            weekKey: weekKey,
            pairs: pairs
        });
    } catch (error) {
        logger.error(`Code review execution error: ${error.message}`);
        res.status(500).json({ error: 'Failed to execute code review pairing' });
    }
});

/**
 * 주간 당직 편성표 조회
 */
router.get('/weekly-duty-schedule', (req, res) => {
    try {
        const config = configService.loadConfig();
        
        // 현재 날짜 기준으로 이번 주의 당직 편성표를 생성
        const today = new Date();
        const kstToday = new Date(today.toLocaleString("en-US", {timeZone: "Asia/Seoul"}));
        
        // 이번 주의 월요일부터 일요일까지 계산
        const currentDayOfWeek = kstToday.getDay(); // 0 = 일요일, 1 = 월요일, ...
        const mondayOffset = currentDayOfWeek === 0 ? -6 : 1 - currentDayOfWeek;
        
        const monday = new Date(kstToday);
        monday.setDate(kstToday.getDate() + mondayOffset);
        
        const weeklySchedule = [];
        const dayNames = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
        
        // 월요일부터 금요일까지 (업무일)
        for (let i = 0; i < 5; i++) {
            const currentDate = new Date(monday);
            currentDate.setDate(monday.getDate() + i);
            
            const dateStr = currentDate.toISOString().split('T')[0];
            const dayOfWeek = currentDate.getDay();
            const dayName = dayNames[dayOfWeek];
            const displayDate = `${currentDate.getMonth() + 1}/${currentDate.getDate()}`;
            
            // config.json에서 해당 요일의 당직자 찾기
            let members = [];
            if (config.currentWeekDuty) {
                const daySchedule = config.currentWeekDuty.find(d => 
                    d.day === dayName.replace('요일', '').toLowerCase() || 
                    d.day === dayName || 
                    d.day === ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'][i]
                );
                
                if (daySchedule && daySchedule.members) {
                    members = daySchedule.members.map(memberId => {
                        const teamMember = config.teamMembers.find(m => m.id === memberId);
                        return {
                            id: memberId,
                            name: teamMember ? teamMember.name : memberId
                        };
                    });
                }
            }
            
            weeklySchedule.push({
                date: dateStr,
                dayName: dayName,
                displayDate: displayDate,
                members: members
            });
        }
        
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
        const config = configService.loadConfig();
        const today = new Date();
        const kstToday = new Date(today.toLocaleString("en-US", {timeZone: "Asia/Seoul"}));
        const dayOfWeek = kstToday.getDay(); // 0 = 일요일, 1 = 월요일, ...
        const displayDate = kstToday.toLocaleDateString('ko-KR');
        
        // 주말은 당직 없음
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            return res.json({
                hasNoDuty: true,
                displayDate: displayDate,
                members: [],
                reason: 'weekend'
            });
        }
        
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const koreanDayNames = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
        const todayDayName = dayNames[dayOfWeek];
        const todayKoreanDayName = koreanDayNames[dayOfWeek];
        
        let todayDutyMembers = [];
        
        // config.json에서 오늘의 당직자 찾기
        if (config.currentWeekDuty) {
            const todaySchedule = config.currentWeekDuty.find(d => 
                d.day === todayDayName ||
                d.day === todayDayName.toLowerCase() ||
                d.day === todayKoreanDayName ||
                d.day === todayKoreanDayName.replace('요일', '')
            );
            
            if (todaySchedule && todaySchedule.members && todaySchedule.members.length > 0) {
                todayDutyMembers = todaySchedule.members.map(memberId => {
                    const teamMember = config.teamMembers.find(m => m.id === memberId);
                    return {
                        id: memberId,
                        name: teamMember ? teamMember.name : memberId
                    };
                });
            }
        }
        
        // 당직자가 있는 경우
        if (todayDutyMembers.length > 0) {
            res.json({
                hasNoDuty: false,
                displayDate: displayDate,
                members: todayDutyMembers,
                dayName: todayKoreanDayName
            });
        } else {
            // 당직자가 없는 경우
            res.json({
                hasNoDuty: true,
                displayDate: displayDate,
                members: [],
                reason: 'no_assignment'
            });
        }
    } catch (error) {
        logger.error(`Today duty error: ${error.message}`);
        res.status(500).json({ error: 'Failed to get today duty information' });
    }
});

// GitHub 관련 엔드포인트들

/**
 * GitHub 상태 조회
 */
router.get('/github/status', (req, res) => {
    try {
        if (!githubService) {
            return res.json({
                isEnabled: false,
                message: 'GitHub service not available'
            });
        }
        
        const status = githubService.getServiceStatus();
        res.json(status);
    } catch (error) {
        logger.error(`GitHub status error: ${error.message}`);
        res.json({ isEnabled: false, error: error.message });
    }
});

/**
 * GitHub 설정 조회
 */
router.get('/github/config', (req, res) => {
    try {
        if (!githubService) {
            return res.status(503).json({ error: 'GitHub service not available' });
        }
        
        const config = githubService.getConfiguration();
        res.json(config);
    } catch (error) {
        logger.error(`GitHub config error: ${error.message}`);
        res.status(500).json({ error: 'Failed to get GitHub configuration' });
    }
});

/**
 * GitHub 주간 리포트 미리보기
 */
router.post('/github/preview-weekly-report', async (req, res) => {
    try {
        if (!githubService) {
            return res.status(503).json({ success: false, message: 'GitHub service not available' });
        }
        
        const result = await githubService.generateWeeklyReport();
        res.json({
            success: result.success,
            preview: result.message,
            message: result.success ? 'Weekly report preview generated' : result.error
        });
    } catch (error) {
        logger.error(`GitHub weekly preview error: ${error.message}`);
        res.status(500).json({ success: false, message: 'Failed to generate weekly report preview' });
    }
});

/**
 * GitHub 월간 리포트 미리보기
 */
router.post('/github/preview-monthly-report', async (req, res) => {
    try {
        if (!githubService) {
            return res.status(503).json({ success: false, message: 'GitHub service not available' });
        }
        
        const result = await githubService.generateMonthlyReport();
        res.json({
            success: result.success,
            preview: result.message,
            message: result.success ? 'Monthly report preview generated' : result.error
        });
    } catch (error) {
        logger.error(`GitHub monthly preview error: ${error.message}`);
        res.status(500).json({ success: false, message: 'Failed to generate monthly report preview' });
    }
});

/**
 * GitHub 리포트 전송
 */
router.post('/github/send-report', async (req, res) => {
    try {
        const { message } = req.body;
        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }
        
        // TODO: 메시지 전송 로직 구현
        res.json({
            success: true,
            message: 'GitHub 리포트가 성공적으로 전송되었습니다.'
        });
    } catch (error) {
        logger.error(`GitHub send report error: ${error.message}`);
        res.status(500).json({ error: 'Failed to send GitHub report' });
    }
});

/**
 * GitHub 활동 알림 체크
 */
router.post('/github/check-alerts', async (req, res) => {
    try {
        if (!githubService) {
            return res.status(503).json({ success: false, message: 'GitHub service not available' });
        }
        
        // TODO: 활동 알림 체크 로직 구현
        res.json({
            success: true,
            message: 'GitHub 활동 알림이 체크되었습니다.'
        });
    } catch (error) {
        logger.error(`GitHub check alerts error: ${error.message}`);
        res.status(500).json({ success: false, message: 'Failed to check GitHub alerts' });
    }
});

/**
 * GitHub 커스텀 리포트 생성
 */
router.post('/github/custom-report', async (req, res) => {
    try {
        const { startDate, endDate, sendToChannel } = req.body;
        
        if (!githubService) {
            return res.status(503).json({ success: false, message: 'GitHub service not available' });
        }
        
        if (!startDate || !endDate) {
            return res.status(400).json({ success: false, message: 'Start date and end date are required' });
        }
        
        const result = await githubService.generateCustomPeriodReport(startDate, endDate);
        
        if (sendToChannel && result.success) {
            // TODO: 채널로 전송 로직 구현
        }
        
        res.json({
            success: result.success,
            message: result.success ? 'Custom report generated successfully' : result.error,
            report: result.message
        });
    } catch (error) {
        logger.error(`GitHub custom report error: ${error.message}`);
        res.status(500).json({ success: false, message: 'Failed to generate custom report' });
    }
});

/**
 * GitHub 멤버 통계 조회
 */
router.post('/github/member-stats', async (req, res) => {
    try {
        const { githubUsername, startDate, endDate } = req.body;
        
        if (!githubService) {
            return res.status(503).json({ success: false, message: 'GitHub service not available' });
        }
        
        if (!githubUsername || !startDate || !endDate) {
            return res.status(400).json({ success: false, message: 'GitHub username, start date and end date are required' });
        }
        
        const result = await githubService.getMemberStats(githubUsername, startDate, endDate);
        res.json(result);
    } catch (error) {
        logger.error(`GitHub member stats error: ${error.message}`);
        res.status(500).json({ success: false, message: 'Failed to get member statistics' });
    }
});

/**
 * GitHub 설정 업데이트
 */
router.post('/github/update-config', async (req, res) => {
    try {
        const newConfig = req.body;
        
        if (!githubService) {
            return res.status(503).json({ success: false, message: 'GitHub service not available' });
        }
        
        const result = githubService.updateConfiguration(newConfig);
        res.json({
            success: result.success,
            message: result.success ? 'GitHub configuration updated successfully' : result.error
        });
    } catch (error) {
        logger.error(`GitHub config update error: ${error.message}`);
        res.status(500).json({ success: false, message: 'Failed to update GitHub configuration' });
    }
});

/**
 * GitHub 저장소 통계 조회
 */
router.get('/github/storage-stats', (req, res) => {
    try {
        if (!githubService || !githubService.reportManager) {
            return res.json({
                success: true,
                data: {
                    preview: { count: 0, sizeMB: '0.00' },
                    archive: { count: 0, sizeMB: '0.00' },
                    total: { count: 0, sizeMB: '0.00' }
                }
            });
        }
        
        const stats = githubService.reportManager.getStorageStats();
        res.json({ success: true, data: stats });
    } catch (error) {
        logger.error(`GitHub storage stats error: ${error.message}`);
        res.status(500).json({ success: false, error: 'Failed to get storage statistics' });
    }
});

/**
 * GitHub 리포트 이력 조회
 */
router.get('/github/report-history', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        
        if (!githubService || !githubService.reportManager) {
            return res.json({ success: true, data: [] });
        }
        
        const reports = githubService.reportManager.listReports(null, limit);
        res.json({ success: true, data: reports.reports || [] });
    } catch (error) {
        logger.error(`GitHub report history error: ${error.message}`);
        res.status(500).json({ success: false, error: 'Failed to get report history' });
    }
});

/**
 * GitHub 리포트 삭제
 */
router.post('/github/delete-report', (req, res) => {
    try {
        const { reportId } = req.body;
        
        if (!reportId) {
            return res.status(400).json({ success: false, message: 'Report ID is required' });
        }
        
        if (!githubService || !githubService.reportManager) {
            return res.status(503).json({ success: false, message: 'GitHub service not available' });
        }
        
        const result = githubService.reportManager.deleteReport(reportId);
        res.json({
            success: result.success,
            message: result.success ? 'Report deleted successfully' : result.error
        });
    } catch (error) {
        logger.error(`GitHub delete report error: ${error.message}`);
        res.status(500).json({ success: false, message: 'Failed to delete report' });
    }
});

/**
 * GitHub 캐시 정리
 */
router.post('/github/clear-cache', (req, res) => {
    try {
        if (!githubService || !githubService.reportManager) {
            return res.json({ success: true, message: 'No cache to clear' });
        }
        
        const result = githubService.reportManager.cleanupPreviewReports();
        res.json({
            success: true,
            message: `Cache cleared successfully. Removed ${result.deletedCount || 0} preview reports.`
        });
    } catch (error) {
        logger.error(`GitHub clear cache error: ${error.message}`);
        res.status(500).json({ success: false, message: 'Failed to clear cache' });
    }
});

module.exports = router;
