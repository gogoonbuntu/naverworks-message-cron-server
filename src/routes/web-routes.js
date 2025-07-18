// src/routes/web-routes.js
// 웹 라우팅 핸들러

const fs = require('fs');
const path = require('path');
const logger = require('../../logger');
const configService = require('../services/config-service');
const scheduleService = require('../services/schedule-service');
const dutyService = require('../services/duty-service');
const teamService = require('../services/team-service');
const messageService = require('../services/message-service');

/**
 * 웹 라우팅 핸들러
 * @param {Object} req - 요청 객체
 * @param {Object} res - 응답 객체
 */
async function handleWebRoutes(req, res) {
    // CORS 헤더 설정
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    try {
        // 라우팅 처리
        if (req.url === '/' && req.method === 'GET') {
            await handleIndexPage(req, res);
        }
        else if (req.url === '/config' && req.method === 'GET') {
            await handleGetConfig(req, res);
        }
        else if (req.url === '/update-schedules' && req.method === 'POST') {
            await handleUpdateSchedules(req, res);
        }
        else if (req.url === '/update-team-members' && req.method === 'POST') {
            await handleUpdateTeamMembers(req, res);
        }
        else if (req.url === '/execute-schedule' && req.method === 'POST') {
            await handleExecuteSchedule(req, res);
        }
        else if (req.url === '/execute-weekly-duty' && req.method === 'POST') {
            await handleExecuteWeeklyDuty(req, res);
        }
        else if (req.url === '/preview-weekly-duty' && req.method === 'POST') {
            await handlePreviewWeeklyDuty(req, res);
        }
        else if (req.url === '/confirm-weekly-duty' && req.method === 'POST') {
            await handleConfirmWeeklyDuty(req, res);
        }
        else if (req.url === '/execute-code-review' && req.method === 'POST') {
            await handleExecuteCodeReview(req, res);
        }
        else if (req.url === '/weekly-duty-schedule' && req.method === 'GET') {
            await handleWeeklyDutySchedule(req, res);
        }
        else if (req.url === '/today-duty' && req.method === 'GET') {
            await handleTodayDuty(req, res);
        }
        // GitHub 관련 엔드포인트
        else if (req.url === '/github/status' && req.method === 'GET') {
            await handleGitHubStatus(req, res);
        }
        else if (req.url === '/github/config' && req.method === 'GET') {
            await handleGitHubConfig(req, res);
        }
        else if (req.url === '/github/update-config' && req.method === 'POST') {
            await handleGitHubUpdateConfig(req, res);
        }
        else if (req.url === '/github/preview-weekly-report' && req.method === 'POST') {
            await handleGitHubWeeklyReportPreview(req, res);
        }
        else if (req.url === '/github/execute-weekly-report' && req.method === 'POST') {
            await handleGitHubWeeklyReport(req, res);
        }
        else if (req.url === '/github/preview-monthly-report' && req.method === 'POST') {
            await handleGitHubMonthlyReportPreview(req, res);
        }
        else if (req.url === '/github/execute-monthly-report' && req.method === 'POST') {
            await handleGitHubMonthlyReport(req, res);
        }
        else if (req.url === '/github/send-report' && req.method === 'POST') {
            await handleGitHubSendReport(req, res);
        }
        else if (req.url === '/github/custom-report' && req.method === 'POST') {
            await handleGitHubCustomReport(req, res);
        }
        else if (req.url === '/github/member-stats' && req.method === 'POST') {
            await handleGitHubMemberStats(req, res);
        }
        else if (req.url === '/github/check-alerts' && req.method === 'POST') {
            await handleGitHubCheckAlerts(req, res);
        }
        // 새로운 GitHub 관련 엔드포인트
        else if (req.url === '/github/cancel-generation' && req.method === 'POST') {
            await handleGitHubCancelGeneration(req, res);
        }
        else if ((req.url === '/github/report-history' || req.url.startsWith('/github/report-history?')) && req.method === 'GET') {
            await handleGitHubReportHistory(req, res);
        }
        else if (req.url === '/github/delete-report' && req.method === 'POST') {
            await handleGitHubDeleteReport(req, res);
        }
        else if (req.url === '/github/storage-stats' && req.method === 'GET') {
            await handleGitHubStorageStats(req, res);
        }
        else if (req.url === '/github/clear-cache' && req.method === 'POST') {
            await handleGitHubClearCache(req, res);
        }
        else if (req.url.startsWith('/github/task-status/') && req.method === 'GET') {
            await handleGitHubTaskStatus(req, res);
        }
        else if (req.url === '/github/running-tasks' && req.method === 'GET') {
            await handleGitHubRunningTasks(req, res);
        }
        else if (req.url.startsWith('/github/report-content/') && req.method === 'GET') {
            await handleGitHubReportContent(req, res);
        }
        else if (req.url === '/github/task-status' && req.method === 'GET') {
            await handleGitHubTaskStatusAll(req, res);
        }
        else if (req.url.startsWith('/github/task-progress') && req.method === 'GET') {
            await handleGitHubTaskProgress(req, res);
        }
        else if (req.url === '/github/cancel-task' && req.method === 'POST') {
            await handleGitHubCancelTask(req, res);
        }
        else if (req.url === '/github/latest-report' && req.method === 'GET') {
            await handleGitHubLatestReport(req, res);
        }
        // 정적 파일 제공
        else if (req.url.startsWith('/public/') && req.method === 'GET') {
            await handleStaticFile(req, res);
        }
        else {
            await handle404(req, res);
        }
    } catch (error) {
        logger.error(`Error handling route ${req.method} ${req.url}: ${error.message}`, error);
        res.writeHead(500, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ status: 'error', message: '서버 내부 오류가 발생했습니다.' }));
    }
}

/**
 * 메인 페이지 핸들러
 */
async function handleIndexPage(req, res) {
    logger.debug('Serving index.html');
    fs.readFile(path.join(__dirname, '../../index.html'), (err, data) => {
        if (err) {
            logger.error('Failed to read index.html file', err);
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=UTF-8' });
            res.end('서버 오류: index.html 파일을 찾을 수 없습니다.');
            return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
        res.end(data);
        logger.debug('index.html served successfully');
    });
}

/**
 * 설정 조회 핸들러
 */
async function handleGetConfig(req, res) {
    logger.debug('Serving configuration data');
    const config = configService.loadConfig();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
    res.end(JSON.stringify(config));
}

/**
 * 스케줄 업데이트 핸들러
 */
async function handleUpdateSchedules(req, res) {
    logger.info('Processing schedule update request');
    const body = await getRequestBody(req);
    
    const updatedSchedules = JSON.parse(body);
    logger.debug(`Updating schedules: ${updatedSchedules.length} schedules received`);
    
    const config = configService.loadConfig();
    config.schedules = updatedSchedules;
    configService.saveConfig(config);
    scheduleService.rescheduleJobs(config);
    
    logger.logConfigChange('schedules', `Updated ${updatedSchedules.length} schedules`, updatedSchedules);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
    res.end(JSON.stringify({ 
        status: 'success', 
        message: '스케줄 설정이 성공적으로 업데이트되었습니다.', 
        config: config.schedules 
    }));
}

/**
 * 팀원 업데이트 핸들러
 */
async function handleUpdateTeamMembers(req, res) {
    logger.info('Processing team members update request');
    const body = await getRequestBody(req);
    
    const updatedTeamMembers = JSON.parse(body);
    logger.debug(`Updating team members: ${updatedTeamMembers.length} members received`);
    
    configService.updateTeamMembers(updatedTeamMembers);
    logger.logConfigChange('team-members', `Updated ${updatedTeamMembers.length} team members`, updatedTeamMembers);
    
    res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
    res.end(JSON.stringify({ 
        status: 'success', 
        message: '팀원 정보가 성공적으로 업데이트되었습니다.', 
        teamMembers: updatedTeamMembers 
    }));
}

/**
 * 스케줄 실행 핸들러
 */
async function handleExecuteSchedule(req, res) {
    logger.info('Processing schedule execution request');
    const body = await getRequestBody(req);
    
    const { scheduleId } = JSON.parse(body);
    logger.info(`Executing schedule immediately: ${scheduleId}`);
    
    const config = configService.loadConfig();
    await scheduleService.executeScheduleById(scheduleId, config);
    
    res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
    res.end(JSON.stringify({ status: 'success', message: '스케줄이 성공적으로 실행되었습니다.' }));
}

/**
 * 주간 당직 실행 핸들러
 */
async function handleExecuteWeeklyDuty(req, res) {
    logger.info('Processing manual weekly duty assignment');
    const result = await dutyService.assignWeeklyDutySchedule();
    
    res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
    res.end(JSON.stringify({ 
        status: result.success ? 'success' : 'error', 
        message: result.message 
    }));
}

/**
 * 주간 당직 미리보기 핸들러
 */
async function handlePreviewWeeklyDuty(req, res) {
    logger.info('Processing weekly duty preview request');
    const previewResult = await dutyService.previewWeeklyDutySchedule();
    
    res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
    res.end(JSON.stringify({ 
        status: previewResult.success ? 'success' : 'error', 
        message: previewResult.message,
        data: previewResult.data,
        preview: previewResult.preview
    }));
}

/**
 * 주간 당직 확정 핸들러
 */
async function handleConfirmWeeklyDuty(req, res) {
    logger.info('Processing weekly duty confirmation');
    const body = await getRequestBody(req);
    const { previewData } = JSON.parse(body);
    
    const result = await dutyService.confirmWeeklyDutySchedule(previewData);
    
    res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
    res.end(JSON.stringify({ 
        status: result.success ? 'success' : 'error', 
        message: result.message 
    }));
}

/**
 * 코드리뷰 실행 핸들러
 */
async function handleExecuteCodeReview(req, res) {
    logger.info('Processing manual code review pair assignment');
    await teamService.assignCodeReviewPairsAndSendMessage();
    
    res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
    res.end(JSON.stringify({ 
        status: 'success', 
        message: '코드 리뷰 짝꿍이 성공적으로 편성되었습니다.' 
    }));
}

/**
 * 주간 당직 스케줄 조회 핸들러
 */
async function handleWeeklyDutySchedule(req, res) {
    logger.debug('Serving weekly duty schedule');
    const weeklySchedule = dutyService.getWeeklyDutySchedule();
    
    res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
    res.end(JSON.stringify(weeklySchedule));
}

/**
 * 오늘 당직 조회 핸들러
 */
async function handleTodayDuty(req, res) {
    logger.debug('Serving today duty information');
    const todayDuty = dutyService.getTodayDutyMembers();
    
    res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
    res.end(JSON.stringify(todayDuty));
}

/**
 * GitHub 상태 조회 핸들러
 */
async function handleGitHubStatus(req, res) {
    logger.debug('Serving GitHub service status');
    const gitHubService = scheduleService.getGitHubService();
    const status = gitHubService.getServiceStatus();
    
    res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
    res.end(JSON.stringify(status));
}

/**
 * GitHub 설정 조회 핸들러
 */
async function handleGitHubConfig(req, res) {
    logger.debug('Serving GitHub configuration');
    const gitHubService = scheduleService.getGitHubService();
    
    if (!gitHubService.isEnabled) {
        res.writeHead(503, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ error: 'GitHub service is not enabled' }));
        return;
    }
    
    // 민감한 정보 제외 후 반환
    const safeConfig = {
        ...gitHubService.config,
        githubToken: gitHubService.config.githubToken ? '[CONFIGURED]' : '[NOT_CONFIGURED]'
    };
    
    res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
    res.end(JSON.stringify(safeConfig));
}

/**
 * GitHub 설정 업데이트 핸들러
 */
async function handleGitHubUpdateConfig(req, res) {
    logger.info('Processing GitHub configuration update');
    const body = await getRequestBody(req);
    
    const newConfig = JSON.parse(body);
    const gitHubService = scheduleService.getGitHubService();
    const result = gitHubService.updateConfiguration(newConfig);
    
    if (result.success) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify(result));
    } else {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify(result));
    }
}

/**
 * GitHub 주간 리포트 미리보기 핸들러
 */
async function handleGitHubWeeklyReportPreview(req, res) {
    logger.info('Processing GitHub weekly report preview');
    const gitHubService = scheduleService.getGitHubService();
    
    try {
        const result = await gitHubService.generateWeeklyReport();
        
        res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ 
            success: result.success, 
            message: result.message,
            data: result.data,
            preview: result.message,
            reportType: 'weekly',
            cached: result.cached || false,
            taskId: result.taskId,
            isAsync: result.isAsync
        }));
    } catch (error) {
        logger.error('Error generating weekly report preview:', error);
        res.writeHead(500, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ 
            success: false, 
            message: 'GitHub 주간 리포트 미리보기 생성 중 오류가 발생했습니다.',
            error: error.message
        }));
    }
}

/**
 * GitHub 주간 리포트 실행 핸들러 (즉시 발송)
 */
async function handleGitHubWeeklyReport(req, res) {
    logger.info('Processing manual GitHub weekly report execution');
    const gitHubService = scheduleService.getGitHubService();
    const result = await gitHubService.generateWeeklyReport();
    
    if (result.success) {
        // 메시지 발송
        await messageService.sendChannelMessage(result.message);
        
        // 아카이브에 저장
        const archiveResult = gitHubService.sendAndArchiveReport(result.message, 'weekly', {
            period: result.data.periodInfo,
            teamMemberCount: gitHubService.config.teamMembers.length,
            repositoryCount: gitHubService.config.repositories.length,
            totalCommits: result.data.teamSummary.totalCommits,
            totalPRs: result.data.teamSummary.totalPRs,
            totalReviews: result.data.teamSummary.totalReviews
        });
        
        res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ 
            success: true, 
            message: 'GitHub 주간 리포트가 성공적으로 전송되었습니다.',
            archiveInfo: archiveResult
        }));
    } else {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ success: false, message: result.message }));
    }
}

/**
 * GitHub 월간 리포트 미리보기 핸들러
 */
async function handleGitHubMonthlyReportPreview(req, res) {
    logger.info('Processing GitHub monthly report preview');
    const gitHubService = scheduleService.getGitHubService();
    
    try {
        const result = await gitHubService.generateMonthlyReport();
        
        res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ 
            success: result.success, 
            message: result.message,
            data: result.data,
            preview: result.message,
            reportType: 'monthly',
            cached: result.cached || false,
            taskId: result.taskId,
            isAsync: result.isAsync
        }));
    } catch (error) {
        logger.error('Error generating monthly report preview:', error);
        res.writeHead(500, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ 
            success: false, 
            message: 'GitHub 월간 리포트 미리보기 생성 중 오류가 발생했습니다.',
            error: error.message
        }));
    }
}

/**
 * GitHub 월간 리포트 실행 핸들러 (즉시 발송)
 */
async function handleGitHubMonthlyReport(req, res) {
    logger.info('Processing manual GitHub monthly report execution');
    const gitHubService = scheduleService.getGitHubService();
    const result = await gitHubService.generateMonthlyReport();
    
    if (result.success) {
        // 메시지 발송
        await messageService.sendChannelMessage(result.message);
        
        // 아카이브에 저장
        const archiveResult = gitHubService.sendAndArchiveReport(result.message, 'monthly', {
            period: result.data.periodInfo,
            teamMemberCount: gitHubService.config.teamMembers.length,
            repositoryCount: gitHubService.config.repositories.length,
            totalCommits: result.data.teamSummary.totalCommits,
            totalPRs: result.data.teamSummary.totalPRs,
            totalReviews: result.data.teamSummary.totalReviews
        });
        
        res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ 
            success: true, 
            message: 'GitHub 월간 리포트가 성공적으로 전송되었습니다.',
            archiveInfo: archiveResult
        }));
    } else {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ success: false, message: result.message }));
    }
}

/**
 * GitHub 리포트 공통 발송 핸들러
 */
async function handleGitHubSendReport(req, res) {
    logger.info('Processing GitHub report sending request');
    
    try {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        
        req.on('end', async () => {
            try {
                const { message, reportType } = JSON.parse(body);
                
                if (!message) {
                    res.writeHead(400, { 'Content-Type': 'application/json; charset=UTF-8' });
                    res.end(JSON.stringify({ success: false, message: '전송할 메시지가 없습니다.' }));
                    return;
                }
                
                // 메시지 발송
                await messageService.sendChannelMessage(message);
                
                // 아카이브에 저장 (reportType이 있는 경우만)
                let archiveResult = null;
                if (reportType) {
                    const gitHubService = scheduleService.getGitHubService();
                    archiveResult = gitHubService.sendAndArchiveReport(message, reportType, {
                        sentVia: 'manual_send',
                        originalReportType: reportType
                    });
                }
                
                res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
                res.end(JSON.stringify({ 
                    success: true, 
                    message: 'GitHub 리포트가 성공적으로 전송되었습니다.',
                    archiveInfo: archiveResult
                }));
            } catch (error) {
                logger.error('Error sending GitHub report:', error);
                res.writeHead(500, { 'Content-Type': 'application/json; charset=UTF-8' });
                res.end(JSON.stringify({ success: false, message: '리포트 전송 중 오류가 발생했습니다.' }));
            }
        });
    } catch (error) {
        logger.error('Error processing GitHub report sending request:', error);
        res.writeHead(500, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ success: false, message: '요청 처리 중 오류가 발생했습니다.' }));
    }
}

/**
 * GitHub 커스텀 리포트 실행 핸들러
 */
async function handleGitHubCustomReport(req, res) {
    logger.info('Processing custom GitHub report request');
    const body = await getRequestBody(req);
    
    const { startDate, endDate, sendToChannel } = JSON.parse(body);
    const gitHubService = scheduleService.getGitHubService();
    const result = await gitHubService.generateCustomPeriodReport(startDate, endDate);
    
    if (result.success) {
        if (sendToChannel) {
            await messageService.sendChannelMessage(result.message);
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({
            success: true,
            message: sendToChannel ? '커스텀 리포트가 채널로 전송되었습니다.' : '커스텀 리포트가 생성되었습니다.',
            data: result.data,
            report: result.message
        }));
    } else {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ success: false, message: result.message }));
    }
}

/**
 * GitHub 멤버 통계 핸들러
 */
async function handleGitHubMemberStats(req, res) {
    logger.info('Processing member stats request');
    const body = await getRequestBody(req);
    
    const { githubUsername, startDate, endDate } = JSON.parse(body);
    const gitHubService = scheduleService.getGitHubService();
    const result = await gitHubService.getMemberStats(githubUsername, startDate, endDate);
    
    if (result.success) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify(result));
    } else {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify(result));
    }
}

/**
 * GitHub 활동 알림 체크 핸들러
 */
async function handleGitHubCheckAlerts(req, res) {
    logger.info('Processing GitHub activity alerts check');
    const gitHubService = scheduleService.getGitHubService();
    const result = await gitHubService.checkAndSendActivityAlerts();
    
    if (result.success) {
        await messageService.sendChannelMessage(result.message);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ success: true, message: '활동 알림이 전송되었습니다.' }));
    } else {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ success: false, message: '알림이 필요한 활동이 없습니다.' }));
    }
}

/**
 * 정적 파일 핸들러
 */
async function handleStaticFile(req, res) {
    const filePath = path.join(__dirname, '../../', req.url);
    const extname = path.extname(filePath).toLowerCase();
    
    // MIME 타입 설정
    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.gif': 'image/gif',
        '.ico': 'image/x-icon',
        '.svg': 'image/svg+xml',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
        '.ttf': 'font/ttf',
        '.eot': 'application/vnd.ms-fontobject'
    };
    
    const contentType = mimeTypes[extname] || 'application/octet-stream';
    
    // 파일 읽기
    fs.readFile(filePath, (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                logger.debug(`Static file not found: ${req.url}`);
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
                res.end('File not found');
            } else {
                logger.error(`Error reading static file ${req.url}:`, err);
                res.writeHead(500, { 'Content-Type': 'text/plain; charset=UTF-8' });
                res.end('Internal Server Error');
            }
            return;
        }
        
        // 캐시 헤더 설정
        res.setHeader('Cache-Control', 'public, max-age=3600'); // 1시간 캐시
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
        logger.debug(`Static file served: ${req.url}`);
    });
}

/**
 * 404 핸들러
 */
async function handle404(req, res) {
    logger.debug(`404 Not Found: ${req.method} ${req.url}`);
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
    res.end('404 Not Found');
}

/**
 * 요청 본문 읽기 유틸리티
 * @param {Object} req - 요청 객체
 * @returns {Promise<string>} - 요청 본문 문자열
 */
function getRequestBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => resolve(body));
        req.on('error', reject);
    });
}

/**
 * GitHub 리포트 생성 취소 핸들러
 */
async function handleGitHubCancelGeneration(req, res) {
    logger.info('Processing GitHub report generation cancellation');
    const gitHubService = scheduleService.getGitHubService();
    
    const result = gitHubService.cancelCurrentGeneration();
    
    res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
    res.end(JSON.stringify(result));
}

/**
 * GitHub 리포트 이력 조회 핸들러
 */
async function handleGitHubReportHistory(req, res) {
    logger.info(`Serving GitHub report history: ${req.url}`);
    
    try {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const type = url.searchParams.get('type');
        const limit = parseInt(url.searchParams.get('limit')) || 20;
        
        logger.debug(`Request params - type: ${type}, limit: ${limit}`);
        
        const gitHubService = scheduleService.getGitHubService();
        
        if (!gitHubService) {
            logger.error('GitHub service not available');
            res.writeHead(503, { 'Content-Type': 'application/json; charset=UTF-8' });
            res.end(JSON.stringify({ success: false, message: 'GitHub 서비스를 사용할 수 없습니다.' }));
            return;
        }
        
        if (!gitHubService.isEnabled) {
            logger.warn('GitHub service is disabled');
            res.writeHead(503, { 'Content-Type': 'application/json; charset=UTF-8' });
            res.end(JSON.stringify({ success: false, message: 'GitHub 서비스가 비활성화되어 있습니다.' }));
            return;
        }
        
        logger.debug('Calling getReportHistory method');
        const history = gitHubService.getReportHistory(type, limit);
        logger.debug(`Retrieved ${history.length} history records`);
        
        res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ success: true, data: history }));
    } catch (error) {
        logger.error('Error getting GitHub report history:', error);
        res.writeHead(500, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ success: false, message: '리포트 이력 조회 중 오류가 발생했습니다.' }));
    }
}

/**
 * GitHub 리포트 삭제 핸들러
 */
async function handleGitHubDeleteReport(req, res) {
    logger.info('Processing GitHub report deletion');
    
    try {
        const body = await getRequestBody(req);
        const { reportId } = JSON.parse(body);
        
        if (!reportId) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=UTF-8' });
            res.end(JSON.stringify({ success: false, message: '리포트 ID가 필요합니다.' }));
            return;
        }
        
        const gitHubService = scheduleService.getGitHubService();
        const result = gitHubService.deleteReport(reportId);
        
        res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify(result));
    } catch (error) {
        logger.error('Error deleting GitHub report:', error);
        res.writeHead(500, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ success: false, message: '리포트 삭제 중 오류가 발생했습니다.' }));
    }
}

/**
 * GitHub 저장소 통계 조회 핸들러
 */
async function handleGitHubStorageStats(req, res) {
    logger.debug('Serving GitHub storage statistics');
    
    try {
        const gitHubService = scheduleService.getGitHubService();
        const stats = gitHubService.getStorageStats();
        
        res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ success: true, data: stats }));
    } catch (error) {
        logger.error('Error getting GitHub storage stats:', error);
        res.writeHead(500, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ success: false, message: '저장소 통계 조회 중 오류가 발생했습니다.' }));
    }
}

/**
 * GitHub 캐시 정리 핸들러
 */
async function handleGitHubClearCache(req, res) {
    logger.info('Processing GitHub cache clear request');
    
    try {
        const gitHubService = scheduleService.getGitHubService();
        const result = gitHubService.clearCache();
        
        res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({
            success: result.success,
            message: result.success 
                ? `캐시가 정리되었습니다. (${result.deletedCount}개 파일 삭제)`
                : '캐시 정리 중 오류가 발생했습니다.',
            data: result
        }));
    } catch (error) {
        logger.error('Error clearing GitHub cache:', error);
        res.writeHead(500, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ success: false, message: '캐시 정리 중 오류가 발생했습니다.' }));
    }
}

/**
 * GitHub 작업 상태 조회 핸들러
 */
async function handleGitHubTaskStatus(req, res) {
    logger.debug('Serving GitHub task status');
    
    try {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const taskId = url.pathname.split('/').pop();
        
        if (!taskId) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=UTF-8' });
            res.end(JSON.stringify({ success: false, message: '작업 ID가 필요합니다.' }));
            return;
        }
        
        const gitHubService = scheduleService.getGitHubService();
        const status = gitHubService.getTaskStatus(taskId);
        
        if (!status) {
            res.writeHead(404, { 'Content-Type': 'application/json; charset=UTF-8' });
            res.end(JSON.stringify({ success: false, message: '작업을 찾을 수 없습니다.' }));
            return;
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ success: true, data: status }));
    } catch (error) {
        logger.error('Error getting GitHub task status:', error);
        res.writeHead(500, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ success: false, message: '작업 상태 조회 중 오류가 발생했습니다.' }));
    }
}

/**
 * GitHub 실행 중인 작업 조회 핸들러
 */
async function handleGitHubRunningTasks(req, res) {
    logger.debug('Serving GitHub running tasks');
    
    try {
        const gitHubService = scheduleService.getGitHubService();
        const runningTasks = gitHubService.getRunningTasks();
        
        res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ success: true, data: runningTasks }));
    } catch (error) {
        logger.error('Error getting GitHub running tasks:', error);
        res.writeHead(500, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ success: false, message: '실행 중인 작업 조회 중 오류가 발생했습니다.' }));
    }
}

/**
 * GitHub 리포트 내용 조회 핸들러
 */
async function handleGitHubReportContent(req, res) {
    logger.debug('Serving GitHub report content');
    
    try {
        const reportId = req.url.split('/').pop();
        
        if (!reportId) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=UTF-8' });
            res.end(JSON.stringify({ success: false, message: '리포트 ID가 필요합니다.' }));
            return;
        }
        
        const gitHubService = scheduleService.getGitHubService();
        
        if (!gitHubService || !gitHubService.isEnabled) {
            res.writeHead(503, { 'Content-Type': 'application/json; charset=UTF-8' });
            res.end(JSON.stringify({ success: false, message: 'GitHub 서비스를 사용할 수 없습니다.' }));
            return;
        }
        
        const reportContent = gitHubService.getReportContent(reportId);
        
        if (!reportContent) {
            res.writeHead(404, { 'Content-Type': 'application/json; charset=UTF-8' });
            res.end(JSON.stringify({ success: false, message: '리포트를 찾을 수 없습니다.' }));
            return;
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ success: true, data: reportContent }));
    } catch (error) {
        logger.error('Error getting GitHub report content:', error);
        res.writeHead(500, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ success: false, message: '리포트 내용 조회 중 오류가 발생했습니다.' }));
    }
}

/**
 * GitHub 작업 상태 전체 조회 핸들러
 */
async function handleGitHubTaskStatusAll(req, res) {
    logger.debug('Serving all GitHub task status');
    
    try {
        const gitHubService = scheduleService.getGitHubService();
        
        if (!gitHubService || !gitHubService.backgroundTaskManager) {
            res.writeHead(503, { 'Content-Type': 'application/json; charset=UTF-8' });
            res.end(JSON.stringify({ success: false, message: 'GitHub 서비스를 사용할 수 없습니다.' }));
            return;
        }
        
        const allTasks = gitHubService.backgroundTaskManager.getAllTasks();
        
        res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ success: true, data: allTasks }));
    } catch (error) {
        logger.error('Error getting all GitHub task status:', error);
        res.writeHead(500, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ success: false, message: '작업 상태 조회 중 오류가 발생했습니다.' }));
    }
}

/**
 * GitHub 작업 진행도 조회 핸들러
 */
async function handleGitHubTaskProgress(req, res) {
    logger.debug('Serving GitHub task progress');
    
    try {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const taskId = url.searchParams.get('taskId');
        
        if (!taskId) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=UTF-8' });
            res.end(JSON.stringify({ success: false, message: '작업 ID가 필요합니다.' }));
            return;
        }
        
        const gitHubService = scheduleService.getGitHubService();
        
        if (!gitHubService || !gitHubService.backgroundTaskManager) {
            res.writeHead(503, { 'Content-Type': 'application/json; charset=UTF-8' });
            res.end(JSON.stringify({ success: false, message: 'GitHub 서비스를 사용할 수 없습니다.' }));
            return;
        }
        
        const taskStatus = gitHubService.backgroundTaskManager.getTaskStatus(taskId);
        
        if (!taskStatus) {
            res.writeHead(404, { 'Content-Type': 'application/json; charset=UTF-8' });
            res.end(JSON.stringify({ success: false, message: '작업을 찾을 수 없습니다.' }));
            return;
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ success: true, data: taskStatus }));
    } catch (error) {
        logger.error('Error getting GitHub task progress:', error);
        res.writeHead(500, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ success: false, message: '작업 진행도 조회 중 오류가 발생했습니다.' }));
    }
}

/**
 * GitHub 작업 취소 핸들러
 */
async function handleGitHubCancelTask(req, res) {
    logger.info('Processing GitHub task cancellation');
    
    try {
        const body = await getRequestBody(req);
        const { taskId } = JSON.parse(body);
        
        if (!taskId) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=UTF-8' });
            res.end(JSON.stringify({ success: false, message: '작업 ID가 필요합니다.' }));
            return;
        }
        
        const gitHubService = scheduleService.getGitHubService();
        
        if (!gitHubService || !gitHubService.backgroundTaskManager) {
            res.writeHead(503, { 'Content-Type': 'application/json; charset=UTF-8' });
            res.end(JSON.stringify({ success: false, message: 'GitHub 서비스를 사용할 수 없습니다.' }));
            return;
        }
        
        const cancelled = gitHubService.backgroundTaskManager.cancelTask(taskId);
        
        if (cancelled) {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
            res.end(JSON.stringify({ success: true, message: '작업이 취소되었습니다.' }));
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json; charset=UTF-8' });
            res.end(JSON.stringify({ success: false, message: '작업을 찾을 수 없거나 취소할 수 없습니다.' }));
        }
    } catch (error) {
        logger.error('Error cancelling GitHub task:', error);
        res.writeHead(500, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ success: false, message: '작업 취소 중 오류가 발생했습니다.' }));
    }
}

/**
 * GitHub 최근 리포트 조회 핸들러
 */
async function handleGitHubLatestReport(req, res) {
    logger.debug('Serving latest GitHub report');
    
    try {
        const gitHubService = scheduleService.getGitHubService();
        
        if (!gitHubService || !gitHubService.isEnabled) {
            res.writeHead(503, { 'Content-Type': 'application/json; charset=UTF-8' });
            res.end(JSON.stringify({ success: false, message: 'GitHub 서비스를 사용할 수 없습니다.' }));
            return;
        }
        
        const latestReport = gitHubService.getLatestTodayReport();
        
        if (!latestReport) {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
            res.end(JSON.stringify({ success: false, message: '오늘 생성된 리포트가 없습니다.' }));
            return;
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ success: true, data: latestReport }));
    } catch (error) {
        logger.error('Error getting latest GitHub report:', error);
        res.writeHead(500, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ success: false, message: '최근 리포트 조회 중 오류가 발생했습니다.' }));
    }
}

module.exports = {
    handleWebRoutes
};
