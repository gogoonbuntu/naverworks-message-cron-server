// src/services/schedule-service.js
// 스케줄링 서비스

const cron = require('node-cron');
const logger = require('../../logger');
const dutyService = require('./duty-service');
const teamService = require('./team-service');
const messageService = require('./message-service');

// 스케줄 관리 변수
let scheduledJobs = {};

// GitHub 서비스 인스턴스
const GitHubService = require('./github-service');
const gitHubService = new GitHubService();

/**
 * 기존 스케줄된 작업들 중지
 */
function clearAllScheduledJobs() {
    const jobCount = Object.keys(scheduledJobs).length;
    logger.info(`Stopping ${jobCount} scheduled jobs`);
    
    for (const jobId in scheduledJobs) {
        if (scheduledJobs[jobId]) {
            scheduledJobs[jobId].stop();
            logger.debug(`Stopped scheduled job: ${jobId}`);
        }
    }
    scheduledJobs = {};
    logger.info('All scheduled jobs stopped successfully');
}

/**
 * 기본 스케줄 설정
 */
function setupDefaultSchedules() {
    logger.info('Setting up default schedules');
    
    // 주간 당직 편성 (매주 월요일 오전 8시) - 채널로 발송
    const weeklyDutyJob = cron.schedule('0 8 * * 1', async () => {
        try {
            logger.info('Executing weekly duty assignment (Monday 8 AM) - Channel');
            await dutyService.assignWeeklyDutySchedule();
        } catch (error) {
            logger.error(`Error in weekly duty assignment job: ${error.message}`, error);
        }
    }, {
        scheduled: true,
        timezone: "Asia/Seoul"
    });
    scheduledJobs['weekly_duty'] = weeklyDutyJob;
    
    // 당직자 알림 (매일 오후 2시) - 채널로 발송
    const dutyReminder2pm = cron.schedule('0 14 * * *', async () => {
        try {
            logger.info('Executing duty reminder (2 PM) - Channel');
            await dutyService.sendDutyReminderMessage();
        } catch (error) {
            logger.error(`Error in duty reminder (2 PM) job: ${error.message}`, error);
        }
    }, {
        scheduled: true,
        timezone: "Asia/Seoul"
    });
    scheduledJobs['duty_reminder_2pm'] = dutyReminder2pm;
    
    // 당직자 알림 (매일 오후 4시) - 채널로 발송
    const dutyReminder4pm = cron.schedule('0 16 * * *', async () => {
        try {
            logger.info('Executing duty reminder (4 PM) - Channel');
            await dutyService.sendDutyReminderMessage();
        } catch (error) {
            logger.error(`Error in duty reminder (4 PM) job: ${error.message}`, error);
        }
    }, {
        scheduled: true,
        timezone: "Asia/Seoul"
    });
    scheduledJobs['duty_reminder_4pm'] = dutyReminder4pm;
    
    // 코드 리뷰 짝꿍 편성 (매주 월요일 오전 9시) - 채널로 발송
    const codeReviewJob = cron.schedule('0 9 * * 1', async () => {
        try {
            logger.info('Executing code review pair assignment (Monday 9 AM) - Channel');
            await teamService.assignCodeReviewPairsAndSendMessage();
        } catch (error) {
            logger.error(`Error in code review pair assignment job: ${error.message}`, error);
        }
    }, {
        scheduled: true,
        timezone: "Asia/Seoul"
    });
    scheduledJobs['code_review_pairs'] = codeReviewJob;
    
    // 노트북 지참 알림 (매일 오전 9시) - 개별 발송
    const laptopDutyJob = cron.schedule('0 9 * * *', async () => {
        try {
            logger.info('Executing laptop duty notification (9 AM) - Individual');
            await teamService.assignLaptopDutyAndSendMessage();
        } catch (error) {
            logger.error(`Error in laptop duty notification job: ${error.message}`, error);
        }
    }, {
        scheduled: true,
        timezone: "Asia/Seoul"
    });
    scheduledJobs['laptop_duty'] = laptopDutyJob;
    
    // GitHub 주간 리포트 (매주 월요일 오전 10시) - 채널로 발송
    if (gitHubService.isEnabled && gitHubService.config?.reporting?.weeklyReports?.enabled) {
        const githubWeeklyJob = cron.schedule('0 10 * * 1', async () => {
            try {
                logger.info('Executing GitHub weekly report (Monday 10 AM) - Channel');
                const result = await gitHubService.generateWeeklyReport();
                if (result.success) {
                    await messageService.sendSingleMessage("tmddud333@naver.com", result.message);
                    logger.info('GitHub weekly report sent successfully to channel');
                } else {
                    logger.warn(`GitHub weekly report failed: ${result.message}`);
                }
            } catch (error) {
                logger.error(`Error in GitHub weekly report job: ${error.message}`, error);
            }
        }, {
            scheduled: true,
            timezone: "Asia/Seoul"
        });
        scheduledJobs['github_weekly_report'] = githubWeeklyJob;
        logger.logScheduledTask('github_weekly_report', '0 10 * * 1', 'GitHub weekly report every Monday 10 AM - Channel');
    }
    
    // GitHub 월간 리포트 (매월 1일 오전 11시) - 채널로 발송
    if (gitHubService.isEnabled && gitHubService.config?.reporting?.monthlyReports?.enabled) {
        const githubMonthlyJob = cron.schedule('0 11 1 * *', async () => {
            try {
                logger.info('Executing GitHub monthly report (1st day 11 AM) - Channel');
                const result = await gitHubService.generateMonthlyReport();
                if (result.success) {
                    await messageService.sendChannelMessage(result.message);
                    logger.info('GitHub monthly report sent successfully to channel');
                } else {
                    logger.warn(`GitHub monthly report failed: ${result.message}`);
                }
            } catch (error) {
                logger.error(`Error in GitHub monthly report job: ${error.message}`, error);
            }
        }, {
            scheduled: true,
            timezone: "Asia/Seoul"
        });
        scheduledJobs['github_monthly_report'] = githubMonthlyJob;
        logger.logScheduledTask('github_monthly_report', '0 11 1 * *', 'GitHub monthly report every 1st day 11 AM - Channel');
    }
    
    logger.info('Default schedules set up successfully');
    logger.logScheduledTask('weekly_duty', '0 8 * * 1', 'Weekly duty assignment every Monday 8 AM - Channel');
    logger.logScheduledTask('duty_reminder', '0 14,16 * * *', 'Duty reminders every day at 2 PM and 4 PM - Channel');
    logger.logScheduledTask('code_review_pairs', '0 9 * * 1', 'Code review pair assignment every Monday 9 AM - Channel');
    logger.logScheduledTask('laptop_duty', '0 9 * * *', 'Laptop duty notification every day 9 AM - Individual (for today\'s duty members)');
    
    // GitHub 기능 상태 로깅
    if (gitHubService.isEnabled) {
        logger.info('🔥 GitHub features are enabled:');
        if (gitHubService.config?.reporting?.weeklyReports?.enabled) {
            logger.info('- GitHub weekly reports: Monday 10 AM → Channel');
        }
        if (gitHubService.config?.reporting?.monthlyReports?.enabled) {
            logger.info('- GitHub monthly reports: 1st day 11 AM → Channel');
        }
    } else {
        logger.info('ℹ️ GitHub features are disabled (check github-config.json)');
    }
}

/**
 * 스케줄 재설정
 * @param {Object} config - 설정 객체
 */
function rescheduleJobs(config) {
    logger.info(`Rescheduling jobs with ${config.schedules.length} custom schedules`);
    clearAllScheduledJobs();
    
    // 기본 스케줄 먼저 설정
    setupDefaultSchedules();

    // 사용자 정의 스케줄 추가
    config.schedules.forEach((item, index) => {
        const jobId = `custom_job_${item.id || index}`;
        
        if (!cron.validate(item.cronSchedule)) {
            logger.error(`Invalid cron schedule: ${item.cronSchedule} for job ${jobId}`);
            return;
        }

        let taskFunction;
        switch(item.type) {
            case 'message':
                taskFunction = async () => {
                    try {
                        logger.info(`Executing scheduled message task: ${jobId}`);
                        logger.debug(`Message: ${item.message}, Recipients: ${item.recipients}`);
                        await messageService.sendMessagesToMultipleRecipients(item.message, item.recipients);
                    } catch (error) {
                        logger.error(`Error in scheduled message task ${jobId}: ${error.message}`, error);
                    }
                };
                break;
            case 'laptop_duty':
                taskFunction = async () => {
                    try {
                        logger.info(`Executing scheduled laptop duty notification task: ${jobId}`);
                        await teamService.assignLaptopDutyAndSendMessage();
                    } catch (error) {
                        logger.error(`Error in scheduled laptop duty notification task ${jobId}: ${error.message}`, error);
                    }
                };
                break;
            case 'code_review':
                taskFunction = async () => {
                    try {
                        logger.info(`Executing scheduled code review task: ${jobId}`);
                        await teamService.assignCodeReviewPairsAndSendMessage();
                    } catch (error) {
                        logger.error(`Error in scheduled code review task ${jobId}: ${error.message}`, error);
                    }
                };
                break;
            default:
                logger.error(`Unknown schedule type: ${item.type} for job ${jobId}`);
                return;
        }

        try {
            const job = cron.schedule(item.cronSchedule, taskFunction, {
                scheduled: true,
                timezone: "Asia/Seoul"
            });
            scheduledJobs[jobId] = job;
            logger.logScheduledTask(item.type, item.cronSchedule, `Custom job ${jobId} scheduled successfully`);
        } catch (error) {
            logger.error(`Failed to schedule custom job ${jobId}: ${error.message}`, error);
        }
    });
    
    logger.info(`Job rescheduling completed. Active jobs: ${Object.keys(scheduledJobs).length}`);
}

/**
 * 스케줄 즉시 실행
 * @param {string} scheduleId - 실행할 스케줄 ID
 * @param {Object} config - 설정 객체
 */
async function executeScheduleById(scheduleId, config) {
    const schedule = config.schedules.find(s => s.id === scheduleId);
    
    if (!schedule) {
        throw new Error('스케줄을 찾을 수 없습니다.');
    }
    
    logger.info(`Executing schedule immediately: ${scheduleId}`);
    
    // 스케줄 즉시 실행
    switch(schedule.type) {
        case 'message':
            logger.info(`Executing message schedule: ${schedule.message}`);
            await messageService.sendMessagesToMultipleRecipients(schedule.message, schedule.recipients);
            break;
        case 'laptop_duty':
            logger.info('Executing laptop duty notification schedule');
            await teamService.assignLaptopDutyAndSendMessage();
            break;
        case 'code_review':
            logger.info('Executing code review schedule');
            await teamService.assignCodeReviewPairsAndSendMessage();
            break;
        default:
            throw new Error(`Unknown schedule type: ${schedule.type}`);
    }
}

/**
 * 활성 스케줄 목록 조회
 * @returns {Array} - 활성 스케줄 목록
 */
function getActiveSchedules() {
    return Object.keys(scheduledJobs).map(jobId => ({
        id: jobId,
        isActive: scheduledJobs[jobId] ? true : false
    }));
}

/**
* GitHub 서비스 반환
* @returns {Object} - GitHub 서비스 객체
*/
function getGitHubService() {
if (!gitHubService) {
        logger.error('GitHub service not initialized');
            return null;
        }
        return gitHubService;
    }

module.exports = {
    clearAllScheduledJobs,
    setupDefaultSchedules,
    rescheduleJobs,
    executeScheduleById,
    getActiveSchedules,
    getGitHubService
};
