// 스케줄 관리 서비스
// Cron 기반 정기 분석 및 메시지 전송 스케줄링

const cron = require('node-cron');
const logger = require('../../logger');

class ScheduleService {
    constructor() {
        this.scheduledJobs = new Map();
        this.defaultSchedules = {
            weeklyDutyAssignment: '0 8 * * 1', // 매주 월요일 오전 8시
            dutyReminders: '0 14,16 * * *', // 매일 오후 2시, 4시
            codeReviewPairs: '0 9 * * 1', // 매주 월요일 오전 9시
            laptopDutyNotifications: '0 9 * * *', // 매일 오전 9시
            githubWeeklyReport: '0 9 * * 1', // 매주 월요일 오전 9시
            githubMonthlyReport: '0 9 1 * *', // 매월 1일 오전 9시
            githubActivityAlerts: '0 17 * * 5' // 매주 금요일 오후 5시
        };
    }

    /**
     * 스케줄 작업 등록
     */
    scheduleJob(name, cronExpression, callback, options = {}) {
        try {
            // 기존 작업이 있으면 중지
            if (this.scheduledJobs.has(name)) {
                this.cancelJob(name);
            }

            // 새 작업 생성
            const job = cron.schedule(cronExpression, async () => {
                try {
                    logger.info(`Executing scheduled job: ${name}`);
                    await callback();
                    logger.info(`Scheduled job completed: ${name}`);
                } catch (error) {
                    logger.error(`Scheduled job failed: ${name} - ${error.message}`, error);
                }
            }, {
                scheduled: false,
                timezone: options.timezone || 'Asia/Seoul'
            });

            // 작업 정보 저장
            this.scheduledJobs.set(name, {
                job: job,
                cronExpression: cronExpression,
                callback: callback,
                options: options,
                createdAt: new Date(),
                lastRun: null,
                runCount: 0
            });

            // 즉시 시작 옵션
            if (options.startImmediately !== false) {
                job.start();
                logger.info(`Scheduled job created and started: ${name} (${cronExpression})`);
            } else {
                logger.info(`Scheduled job created: ${name} (${cronExpression})`);
            }

            return { success: true, jobName: name };
        } catch (error) {
            logger.error(`Failed to schedule job ${name}: ${error.message}`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 기본 스케줄 설정
     */
    setupDefaultSchedules(config = {}) {
        try {
            const services = config.services || {};
            
            // 주간 업무 배정
            if (config.enableWeeklyDutyAssignment !== false) {
                this.scheduleJob('weeklyDutyAssignment', 
                    config.weeklyDutySchedule || this.defaultSchedules.weeklyDutyAssignment,
                    async () => {
                        if (services.dutyService) {
                            await services.dutyService.assignWeeklyDuty();
                        }
                    }
                );
            }

            // 업무 리마인더
            if (config.enableDutyReminders !== false) {
                this.scheduleJob('dutyReminders',
                    config.dutyRemindersSchedule || this.defaultSchedules.dutyReminders,
                    async () => {
                        if (services.dutyService) {
                            await services.dutyService.sendDutyReminders();
                        }
                    }
                );
            }

            // 코드 리뷰 페어링
            if (config.enableCodeReviewPairs !== false) {
                this.scheduleJob('codeReviewPairs',
                    config.codeReviewPairsSchedule || this.defaultSchedules.codeReviewPairs,
                    async () => {
                        if (services.reviewService) {
                            await services.reviewService.assignReviewPairs();
                        }
                    }
                );
            }

            // 노트북 업무 알림
            if (config.enableLaptopDutyNotifications !== false) {
                this.scheduleJob('laptopDutyNotifications',
                    config.laptopDutySchedule || this.defaultSchedules.laptopDutyNotifications,
                    async () => {
                        if (services.laptopService) {
                            await services.laptopService.sendLaptopDutyNotifications();
                        }
                    }
                );
            }

            // GitHub 주간 리포트
            if (config.enableGithubWeeklyReport && services.githubService) {
                this.scheduleJob('githubWeeklyReport',
                    config.githubWeeklySchedule || this.defaultSchedules.githubWeeklyReport,
                    async () => {
                        const result = await services.githubService.generateAndSendWeeklyReport();
                        if (result.success && services.messageService) {
                            await services.messageService.sendMessage('naverworks', result.message);
                        }
                    }
                );
            }

            // GitHub 월간 리포트
            if (config.enableGithubMonthlyReport && services.githubService) {
                this.scheduleJob('githubMonthlyReport',
                    config.githubMonthlySchedule || this.defaultSchedules.githubMonthlyReport,
                    async () => {
                        const result = await services.githubService.generateAndSendMonthlyReport();
                        if (result.success && services.messageService) {
                            await services.messageService.sendMessage('naverworks', result.message);
                        }
                    }
                );
            }

            // GitHub 활동 알림
            if (config.enableGithubActivityAlerts && services.githubService) {
                this.scheduleJob('githubActivityAlerts',
                    config.githubActivityAlertsSchedule || this.defaultSchedules.githubActivityAlerts,
                    async () => {
                        const result = await services.githubService.checkAndSendActivityAlerts();
                        if (result.success && services.messageService) {
                            await services.messageService.sendMessage('naverworks', result.message);
                        }
                    }
                );
            }

            logger.info(`Default schedules setup completed: ${this.scheduledJobs.size} jobs`);
            return { success: true, jobCount: this.scheduledJobs.size };
        } catch (error) {
            logger.error(`Failed to setup default schedules: ${error.message}`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 스케줄 재설정
     */
    rescheduleJobs(config = {}) {
        try {
            // 모든 기존 작업 정리
            this.clearAllScheduledJobs();
            
            // 새로운 스케줄 설정
            this.setupDefaultSchedules(config);
            
            logger.info('All schedules have been reset and reconfigured');
            return { success: true, jobCount: this.scheduledJobs.size };
        } catch (error) {
            logger.error(`Failed to reschedule jobs: ${error.message}`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 작업 취소
     */
    cancelJob(name) {
        try {
            const jobInfo = this.scheduledJobs.get(name);
            if (jobInfo) {
                jobInfo.job.stop();
                jobInfo.job.destroy();
                this.scheduledJobs.delete(name);
                logger.info(`Scheduled job cancelled: ${name}`);
                return { success: true };
            }
            return { success: false, error: 'Job not found' };
        } catch (error) {
            logger.error(`Failed to cancel job ${name}: ${error.message}`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 모든 스케줄된 작업 정리
     */
    clearAllScheduledJobs() {
        try {
            let clearedCount = 0;
            for (const [name, jobInfo] of this.scheduledJobs) {
                jobInfo.job.stop();
                jobInfo.job.destroy();
                clearedCount++;
            }
            this.scheduledJobs.clear();
            logger.info(`All scheduled jobs cleared: ${clearedCount} jobs`);
            return { success: true, clearedCount };
        } catch (error) {
            logger.error(`Failed to clear scheduled jobs: ${error.message}`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 작업 즉시 실행
     */
    async runJobNow(name) {
        try {
            const jobInfo = this.scheduledJobs.get(name);
            if (!jobInfo) {
                return { success: false, error: 'Job not found' };
            }

            logger.info(`Running job immediately: ${name}`);
            await jobInfo.callback();
            
            // 실행 통계 업데이트
            jobInfo.lastRun = new Date();
            jobInfo.runCount++;
            
            logger.info(`Job executed successfully: ${name}`);
            return { success: true };
        } catch (error) {
            logger.error(`Failed to run job ${name}: ${error.message}`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 작업 상태 조회
     */
    getJobStatus(name) {
        try {
            const jobInfo = this.scheduledJobs.get(name);
            if (!jobInfo) {
                return { exists: false };
            }

            return {
                exists: true,
                name: name,
                cronExpression: jobInfo.cronExpression,
                isRunning: jobInfo.job.running,
                createdAt: jobInfo.createdAt,
                lastRun: jobInfo.lastRun,
                runCount: jobInfo.runCount,
                options: jobInfo.options
            };
        } catch (error) {
            logger.error(`Failed to get job status ${name}: ${error.message}`, error);
            return { exists: false, error: error.message };
        }
    }

    /**
     * 모든 작업 상태 조회
     */
    getAllJobsStatus() {
        try {
            const jobs = [];
            for (const [name, jobInfo] of this.scheduledJobs) {
                jobs.push({
                    name: name,
                    cronExpression: jobInfo.cronExpression,
                    isRunning: jobInfo.job.running,
                    createdAt: jobInfo.createdAt,
                    lastRun: jobInfo.lastRun,
                    runCount: jobInfo.runCount
                });
            }
            
            return { success: true, jobs: jobs, totalJobs: jobs.length };
        } catch (error) {
            logger.error(`Failed to get all jobs status: ${error.message}`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Cron 표현식 유효성 검사
     */
    validateCronExpression(expression) {
        try {
            return cron.validate(expression);
        } catch (error) {
            return false;
        }
    }

    /**
     * 다음 실행 시간 계산
     */
    getNextRunTime(cronExpression) {
        try {
            // 간단한 다음 실행 시간 계산 로직
            // 실제로는 cron-parser 등의 라이브러리 사용 권장
            const task = cron.schedule(cronExpression, () => {}, { scheduled: false });
            // task.nextDates() 등의 메서드가 있다면 사용
            return new Date(Date.now() + 60000); // 임시로 1분 후 반환
        } catch (error) {
            logger.error(`Failed to calculate next run time: ${error.message}`);
            return null;
        }
    }

    /**
     * 작업 일시 정지/재개
     */
    pauseJob(name) {
        try {
            const jobInfo = this.scheduledJobs.get(name);
            if (!jobInfo) {
                return { success: false, error: 'Job not found' };
            }

            jobInfo.job.stop();
            logger.info(`Job paused: ${name}`);
            return { success: true };
        } catch (error) {
            logger.error(`Failed to pause job ${name}: ${error.message}`, error);
            return { success: false, error: error.message };
        }
    }

    resumeJob(name) {
        try {
            const jobInfo = this.scheduledJobs.get(name);
            if (!jobInfo) {
                return { success: false, error: 'Job not found' };
            }

            jobInfo.job.start();
            logger.info(`Job resumed: ${name}`);
            return { success: true };
        } catch (error) {
            logger.error(`Failed to resume job ${name}: ${error.message}`, error);
            return { success: false, error: error.message };
        }
    }
}

module.exports = ScheduleService;
