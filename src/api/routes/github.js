// GitHub API 라우터
// GitHub 관련 기능을 위한 REST API

const express = require('express');
const router = express.Router();
const logger = require('../../../logger');
const GitHubService = require('../../services/github-service');

// GitHub 서비스 인스턴스
let githubService = null;

// 미들웨어: GitHub 서비스 초기화
router.use((req, res, next) => {
    if (!githubService) {
        githubService = new GitHubService();
    }
    next();
});

/**
 * GitHub 서비스 상태 조회
 */
router.get('/status', (req, res) => {
    try {
        const status = githubService.getServiceStatus();
        res.json(status);
    } catch (error) {
        logger.error(`GitHub status error: ${error.message}`);
        res.status(500).json({ error: 'Failed to get GitHub status' });
    }
});

/**
 * 주간 리포트 생성
 */
router.post('/reports/weekly', async (req, res) => {
    try {
        const result = await githubService.generateWeeklyReport();
        
        if (result.success) {
            res.json({
                success: true,
                message: 'Weekly report generated successfully',
                reportId: result.reportId,
                cached: result.cached || false,
                content: result.message,
                data: result.data
            });
        } else {
            res.status(400).json({
                success: false,
                error: result.error || result.message
            });
        }
    } catch (error) {
        logger.error(`Weekly report generation error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Failed to generate weekly report'
        });
    }
});

/**
 * 월간 리포트 생성
 */
router.post('/reports/monthly', async (req, res) => {
    try {
        const result = await githubService.generateMonthlyReport();
        
        if (result.success) {
            res.json({
                success: true,
                message: 'Monthly report generated successfully',
                reportId: result.reportId,
                cached: result.cached || false,
                content: result.message,
                data: result.data
            });
        } else {
            res.status(400).json({
                success: false,
                error: result.error || result.message
            });
        }
    } catch (error) {
        logger.error(`Monthly report generation error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Failed to generate monthly report'
        });
    }
});

/**
 * 커스텀 기간 리포트 생성
 */
router.post('/reports/custom', async (req, res) => {
    try {
        const { startDate, endDate } = req.body;
        
        if (!startDate || !endDate) {
            return res.status(400).json({
                success: false,
                error: 'startDate and endDate are required'
            });
        }
        
        const result = await githubService.generateCustomPeriodReport(startDate, endDate);
        
        if (result.success) {
            res.json({
                success: true,
                message: 'Custom period report generated successfully',
                content: result.message,
                data: result.data
            });
        } else {
            res.status(400).json({
                success: false,
                error: result.error || result.message
            });
        }
    } catch (error) {
        logger.error(`Custom report generation error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Failed to generate custom report'
        });
    }
});

/**
 * 활동 알림 체크
 */
router.post('/alerts/activity', async (req, res) => {
    try {
        const result = await githubService.checkAndSendActivityAlerts();
        
        if (result.success) {
            res.json({
                success: true,
                message: 'Activity alerts checked successfully',
                content: result.message,
                data: result.data
            });
        } else {
            res.status(400).json({
                success: false,
                error: result.error || result.message
            });
        }
    } catch (error) {
        logger.error(`Activity alerts error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Failed to check activity alerts'
        });
    }
});

/**
 * 개별 멤버 통계 조회
 */
router.get('/members/:username/stats', async (req, res) => {
    try {
        const { username } = req.params;
        const { startDate, endDate } = req.query;
        
        if (!startDate || !endDate) {
            return res.status(400).json({
                success: false,
                error: 'startDate and endDate query parameters are required'
            });
        }
        
        const result = await githubService.getMemberStats(username, startDate, endDate);
        
        if (result.success) {
            res.json({
                success: true,
                data: result.data
            });
        } else {
            res.status(400).json({
                success: false,
                error: result.error || result.message
            });
        }
    } catch (error) {
        logger.error(`Member stats error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Failed to get member statistics'
        });
    }
});

/**
 * 설정 업데이트
 */
router.put('/config', async (req, res) => {
    try {
        const newConfig = req.body;
        const result = githubService.updateConfiguration(newConfig);
        
        if (result.success) {
            res.json({
                success: true,
                message: 'GitHub configuration updated successfully'
            });
        } else {
            res.status(400).json({
                success: false,
                error: result.error || result.message
            });
        }
    } catch (error) {
        logger.error(`GitHub config update error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Failed to update GitHub configuration'
        });
    }
});

/**
 * 진행도 추적 취소
 */
router.post('/cancel', (req, res) => {
    try {
        const result = githubService.cancelCurrentGeneration();
        
        if (result.success) {
            res.json({
                success: true,
                message: result.message
            });
        } else {
            res.status(400).json({
                success: false,
                error: result.message
            });
        }
    } catch (error) {
        logger.error(`GitHub cancel error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Failed to cancel GitHub operation'
        });
    }
});

/**
 * 진행도 상태 조회 (SSE - Server-Sent Events)
 */
router.get('/progress', (req, res) => {
    try {
        // SSE 헤더 설정
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
        });

        // 진행도 콜백 설정
        const progressCallback = (progressData) => {
            res.write(`data: ${JSON.stringify(progressData)}\n\n`);
        };

        githubService.setProgressCallback(progressCallback);

        // 연결 종료 처리
        req.on('close', () => {
            githubService.setProgressCallback(null);
        });

        // 초기 상태 전송
        res.write(`data: ${JSON.stringify({
            message: 'Progress tracking started',
            timestamp: new Date().toISOString(),
            stage: 'connected'
        })}\n\n`);

    } catch (error) {
        logger.error(`GitHub progress tracking error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Failed to start progress tracking'
        });
    }
});

/**
 * 리포트 목록 조회
 */
router.get('/reports', (req, res) => {
    try {
        const { type, limit } = req.query;
        
        if (!githubService.reportManager) {
            return res.status(503).json({
                success: false,
                error: 'GitHub service not properly initialized'
            });
        }

        const result = githubService.reportManager.listReports(type, parseInt(limit) || 10);
        
        if (result.success) {
            res.json({
                success: true,
                reports: result.reports
            });
        } else {
            res.status(400).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        logger.error(`GitHub reports list error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Failed to get reports list'
        });
    }
});

/**
 * 특정 리포트 조회
 */
router.get('/reports/:reportId', (req, res) => {
    try {
        const { reportId } = req.params;
        
        if (!githubService.reportManager) {
            return res.status(503).json({
                success: false,
                error: 'GitHub service not properly initialized'
            });
        }

        const result = githubService.reportManager.loadReport(reportId);
        
        if (result.success) {
            res.json({
                success: true,
                report: result.report
            });
        } else {
            res.status(404).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        logger.error(`GitHub report fetch error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Failed to get report'
        });
    }
});

/**
 * 리포트 삭제
 */
router.delete('/reports/:reportId', (req, res) => {
    try {
        const { reportId } = req.params;
        
        if (!githubService.reportManager) {
            return res.status(503).json({
                success: false,
                error: 'GitHub service not properly initialized'
            });
        }

        const result = githubService.reportManager.deleteReport(reportId);
        
        if (result.success) {
            res.json({
                success: true,
                message: 'Report deleted successfully'
            });
        } else {
            res.status(404).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        logger.error(`GitHub report delete error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Failed to delete report'
        });
    }
});

/**
 * 스토리지 정리
 */
router.post('/cleanup', (req, res) => {
    try {
        if (!githubService.reportManager) {
            return res.status(503).json({
                success: false,
                error: 'GitHub service not properly initialized'
            });
        }

        const oldReportsResult = githubService.reportManager.cleanupOldReports();
        const previewReportsResult = githubService.reportManager.cleanupPreviewReports();
        
        res.json({
            success: true,
            message: 'Cleanup completed successfully',
            results: {
                oldReports: oldReportsResult,
                previewReports: previewReportsResult
            }
        });
    } catch (error) {
        logger.error(`GitHub cleanup error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Failed to cleanup storage'
        });
    }
});

module.exports = router;
