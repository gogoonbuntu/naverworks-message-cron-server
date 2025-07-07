// API 라우터
// 기본 시스템 API 엔드포인트

const express = require('express');
const router = express.Router();
const logger = require('../../../logger');

/**
 * API 정보 조회
 */
router.get('/', (req, res) => {
    try {
        res.json({
            name: 'Naverworks Message Cron Server API',
            version: '1.0.0',
            description: '팀 자동 알림 및 GitHub 활동 분석 서비스',
            endpoints: {
                system: {
                    status: 'GET /api/status',
                    health: 'GET /api/health'
                },
                config: {
                    get: 'GET /api/config',
                    update: 'PUT /api/config',
                    validate: 'POST /api/config/validate'
                },
                schedule: {
                    list: 'GET /api/schedule',
                    run: 'POST /api/schedule/:name/run',
                    status: 'GET /api/schedule/:name/status'
                },
                github: {
                    status: 'GET /api/github/status',
                    weeklyReport: 'POST /api/github/reports/weekly',
                    monthlyReport: 'POST /api/github/reports/monthly'
                }
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`API info error: ${error.message}`);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * 시스템 상태 조회
 */
router.get('/status', (req, res) => {
    try {
        const status = {
            service: 'Naverworks Message Cron Server',
            status: 'running',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            version: {
                node: process.version,
                service: '1.0.0'
            },
            environment: process.env.NODE_ENV || 'development'
        };

        res.json(status);
    } catch (error) {
        logger.error(`Status check error: ${error.message}`);
        res.status(500).json({ error: 'Failed to get status' });
    }
});

/**
 * 헬스 체크
 */
router.get('/health', (req, res) => {
    try {
        const healthStatus = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            checks: {
                memory: checkMemoryHealth(),
                uptime: checkUptimeHealth(),
                dependencies: checkDependenciesHealth()
            }
        };

        // 전체 헬스 상태 확인
        const isHealthy = Object.values(healthStatus.checks).every(check => check.status === 'ok');
        
        if (!isHealthy) {
            healthStatus.status = 'degraded';
            return res.status(503).json(healthStatus);
        }

        res.json(healthStatus);
    } catch (error) {
        logger.error(`Health check error: ${error.message}`);
        res.status(500).json({
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * 시스템 통계 조회
 */
router.get('/stats', (req, res) => {
    try {
        const stats = {
            system: {
                platform: process.platform,
                arch: process.arch,
                nodeVersion: process.version,
                pid: process.pid,
                uptime: process.uptime()
            },
            memory: process.memoryUsage(),
            cpu: process.cpuUsage(),
            timestamp: new Date().toISOString()
        };

        res.json(stats);
    } catch (error) {
        logger.error(`Stats error: ${error.message}`);
        res.status(500).json({ error: 'Failed to get statistics' });
    }
});

/**
 * 시스템 정보 조회
 */
router.get('/info', (req, res) => {
    try {
        const info = {
            name: 'Naverworks Message Cron Server',
            description: '팀 업무 자동화 및 GitHub 활동 분석 서비스',
            version: '1.0.0',
            features: [
                '자동 업무 배정',
                '업무 리마인더',
                '코드 리뷰 페어링',
                '노트북 관리 알림',
                'GitHub 활동 분석',
                '다중 메시징 채널 지원'
            ],
            supportedChannels: [
                'NaverWorks',
                'Slack',
                'Email'
            ],
            author: 'Team Automation System',
            license: 'ISC',
            timestamp: new Date().toISOString()
        };

        res.json(info);
    } catch (error) {
        logger.error(`Info error: ${error.message}`);
        res.status(500).json({ error: 'Failed to get info' });
    }
});

// 헬스 체크 헬퍼 함수들
function checkMemoryHealth() {
    const memUsage = process.memoryUsage();
    const memLimit = 512 * 1024 * 1024; // 512MB limit
    
    return {
        status: memUsage.heapUsed < memLimit ? 'ok' : 'warning',
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        limit: memLimit
    };
}

function checkUptimeHealth() {
    const uptime = process.uptime();
    
    return {
        status: uptime > 0 ? 'ok' : 'error',
        uptime: uptime,
        startTime: new Date(Date.now() - uptime * 1000).toISOString()
    };
}

function checkDependenciesHealth() {
    // 기본적인 의존성 체크
    const checks = {};
    
    try {
        require('fs');
        checks.fs = 'ok';
    } catch (error) {
        checks.fs = 'error';
    }
    
    try {
        require('path');
        checks.path = 'ok';
    } catch (error) {
        checks.path = 'error';
    }
    
    const allOk = Object.values(checks).every(status => status === 'ok');
    
    return {
        status: allOk ? 'ok' : 'error',
        details: checks
    };
}

module.exports = router;
