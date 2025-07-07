// 스케줄 API 라우터
// 스케줄 관리를 위한 REST API

const express = require('express');
const router = express.Router();
const logger = require('../../../logger');
const ScheduleService = require('../../services/schedule-service');

// 스케줄 서비스 인스턴스
const scheduleService = new ScheduleService();

/**
 * 모든 스케줄 작업 상태 조회
 */
router.get('/', (req, res) => {
    try {
        const result = scheduleService.getAllJobsStatus();
        
        if (result.success) {
            res.json({
                success: true,
                jobs: result.jobs,
                totalJobs: result.totalJobs
            });
        } else {
            res.status(500).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        logger.error(`Schedule list error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Failed to get schedule list'
        });
    }
});

/**
 * 특정 작업 상태 조회
 */
router.get('/:name/status', (req, res) => {
    try {
        const { name } = req.params;
        const status = scheduleService.getJobStatus(name);
        
        if (status.exists) {
            res.json({
                success: true,
                job: status
            });
        } else {
            res.status(404).json({
                success: false,
                error: 'Job not found'
            });
        }
    } catch (error) {
        logger.error(`Schedule status error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Failed to get job status'
        });
    }
});

/**
 * 작업 즉시 실행
 */
router.post('/:name/run', async (req, res) => {
    try {
        const { name } = req.params;
        const result = await scheduleService.runJobNow(name);
        
        if (result.success) {
            res.json({
                success: true,
                message: `Job '${name}' executed successfully`
            });
        } else {
            res.status(400).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        logger.error(`Schedule run error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Failed to run job'
        });
    }
});

/**
 * 새 스케줄 작업 생성
 */
router.post('/', (req, res) => {
    try {
        const { name, cronExpression, description, options = {} } = req.body;
        
        if (!name || !cronExpression) {
            return res.status(400).json({
                success: false,
                error: 'Name and cronExpression are required'
            });
        }
        
        // Cron 표현식 유효성 검사
        if (!scheduleService.validateCronExpression(cronExpression)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid cron expression'
            });
        }
        
        // 기본 콜백 함수 (실제로는 더 복잡한 로직 필요)
        const callback = async () => {
            logger.info(`Custom job '${name}' executed: ${description || 'No description'}`);
        };
        
        const result = scheduleService.scheduleJob(name, cronExpression, callback, options);
        
        if (result.success) {
            res.json({
                success: true,
                message: `Job '${name}' scheduled successfully`,
                jobName: result.jobName
            });
        } else {
            res.status(400).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        logger.error(`Schedule create error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Failed to create scheduled job'
        });
    }
});

/**
 * 작업 일시 정지
 */
router.post('/:name/pause', (req, res) => {
    try {
        const { name } = req.params;
        const result = scheduleService.pauseJob(name);
        
        if (result.success) {
            res.json({
                success: true,
                message: `Job '${name}' paused successfully`
            });
        } else {
            res.status(400).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        logger.error(`Schedule pause error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Failed to pause job'
        });
    }
});

/**
 * 작업 재개
 */
router.post('/:name/resume', (req, res) => {
    try {
        const { name } = req.params;
        const result = scheduleService.resumeJob(name);
        
        if (result.success) {
            res.json({
                success: true,
                message: `Job '${name}' resumed successfully`
            });
        } else {
            res.status(400).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        logger.error(`Schedule resume error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Failed to resume job'
        });
    }
});

/**
 * 작업 삭제
 */
router.delete('/:name', (req, res) => {
    try {
        const { name } = req.params;
        const result = scheduleService.cancelJob(name);
        
        if (result.success) {
            res.json({
                success: true,
                message: `Job '${name}' cancelled successfully`
            });
        } else {
            res.status(400).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        logger.error(`Schedule delete error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Failed to cancel job'
        });
    }
});

/**
 * 모든 스케줄 작업 정리
 */
router.delete('/', (req, res) => {
    try {
        const result = scheduleService.clearAllScheduledJobs();
        
        if (result.success) {
            res.json({
                success: true,
                message: 'All scheduled jobs cleared successfully',
                clearedCount: result.clearedCount
            });
        } else {
            res.status(500).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        logger.error(`Schedule clear all error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Failed to clear all jobs'
        });
    }
});

/**
 * 스케줄 재설정
 */
router.post('/reset', (req, res) => {
    try {
        const config = req.body || {};
        const result = scheduleService.rescheduleJobs(config);
        
        if (result.success) {
            res.json({
                success: true,
                message: 'Schedules reset successfully',
                jobCount: result.jobCount
            });
        } else {
            res.status(500).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        logger.error(`Schedule reset error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Failed to reset schedules'
        });
    }
});

/**
 * 기본 스케줄 설정
 */
router.post('/setup-defaults', (req, res) => {
    try {
        const config = req.body || {};
        const result = scheduleService.setupDefaultSchedules(config);
        
        if (result.success) {
            res.json({
                success: true,
                message: 'Default schedules setup successfully',
                jobCount: result.jobCount
            });
        } else {
            res.status(500).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        logger.error(`Schedule setup defaults error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Failed to setup default schedules'
        });
    }
});

/**
 * Cron 표현식 유효성 검사
 */
router.post('/validate-cron', (req, res) => {
    try {
        const { cronExpression } = req.body;
        
        if (!cronExpression) {
            return res.status(400).json({
                success: false,
                error: 'cronExpression is required'
            });
        }
        
        const isValid = scheduleService.validateCronExpression(cronExpression);
        
        res.json({
            success: true,
            isValid: isValid,
            cronExpression: cronExpression,
            nextRunTime: isValid ? scheduleService.getNextRunTime(cronExpression) : null
        });
    } catch (error) {
        logger.error(`Cron validation error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Failed to validate cron expression'
        });
    }
});

/**
 * 다음 실행 시간 조회
 */
router.get('/:name/next-run', (req, res) => {
    try {
        const { name } = req.params;
        const jobStatus = scheduleService.getJobStatus(name);
        
        if (!jobStatus.exists) {
            return res.status(404).json({
                success: false,
                error: 'Job not found'
            });
        }
        
        const nextRunTime = scheduleService.getNextRunTime(jobStatus.cronExpression);
        
        res.json({
            success: true,
            jobName: name,
            cronExpression: jobStatus.cronExpression,
            nextRunTime: nextRunTime,
            lastRun: jobStatus.lastRun
        });
    } catch (error) {
        logger.error(`Next run time error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Failed to get next run time'
        });
    }
});

/**
 * 스케줄 통계 조회
 */
router.get('/stats', (req, res) => {
    try {
        const allJobs = scheduleService.getAllJobsStatus();
        
        if (!allJobs.success) {
            return res.status(500).json(allJobs);
        }
        
        const stats = {
            totalJobs: allJobs.totalJobs,
            runningJobs: allJobs.jobs.filter(job => job.isRunning).length,
            pausedJobs: allJobs.jobs.filter(job => !job.isRunning).length,
            totalExecutions: allJobs.jobs.reduce((sum, job) => sum + job.runCount, 0),
            jobsByType: {
                system: allJobs.jobs.filter(job => 
                    ['weeklyDutyAssignment', 'dutyReminders', 'codeReviewPairs', 'laptopDutyNotifications'].includes(job.name)
                ).length,
                github: allJobs.jobs.filter(job => 
                    job.name.startsWith('github')
                ).length,
                custom: allJobs.jobs.filter(job => 
                    !['weeklyDutyAssignment', 'dutyReminders', 'codeReviewPairs', 'laptopDutyNotifications'].includes(job.name) && 
                    !job.name.startsWith('github')
                ).length
            },
            lastExecutions: allJobs.jobs
                .filter(job => job.lastRun)
                .sort((a, b) => new Date(b.lastRun) - new Date(a.lastRun))
                .slice(0, 5)
                .map(job => ({
                    name: job.name,
                    lastRun: job.lastRun,
                    runCount: job.runCount
                }))
        };
        
        res.json({
            success: true,
            stats: stats
        });
    } catch (error) {
        logger.error(`Schedule stats error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Failed to get schedule statistics'
        });
    }
});

module.exports = router;
