// GitHub 리포트 관리 모듈
// 리포트 생성, 저장, 캐싱, 아카이브 기능 제공

const fs = require('fs');
const path = require('path');
const logger = require('../../logger');

class GitHubReportManager {
    constructor(cacheDir = null) {
        this.cacheDir = cacheDir || path.join(__dirname, '../../cache/github-reports');
        this.archiveDir = path.join(this.cacheDir, 'archive');
        this.initializeDirectories();
    }

    /**
     * 디렉토리 초기화
     */
    initializeDirectories() {
        try {
            if (!fs.existsSync(this.cacheDir)) {
                fs.mkdirSync(this.cacheDir, { recursive: true });
            }
            if (!fs.existsSync(this.archiveDir)) {
                fs.mkdirSync(this.archiveDir, { recursive: true });
            }
        } catch (error) {
            logger.error(`Failed to initialize report directories: ${error.message}`);
        }
    }

    /**
     * 리포트 ID 생성
     */
    generateReportId() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const random = Math.random().toString(36).substring(2, 8);
        return `github-report-${timestamp}-${random}`;
    }

    /**
     * 리포트 저장
     */
    saveReport(type, content, metadata = {}) {
        try {
            const reportId = this.generateReportId();
            const timestamp = new Date().toISOString();
            
            const reportData = {
                id: reportId,
                type: type, // 'weekly', 'monthly', 'custom'
                content: content,
                metadata: {
                    ...metadata,
                    generatedAt: timestamp,
                    version: '1.0'
                }
            };

            const filename = `${reportId}.json`;
            const filepath = path.join(this.cacheDir, filename);
            
            fs.writeFileSync(filepath, JSON.stringify(reportData, null, 2), 'utf8');
            
            // 최신 리포트 링크 업데이트
            this.updateLatestReportLink(type, reportId);
            
            logger.info(`GitHub report saved: ${reportId}`);
            return { success: true, reportId, filepath };
        } catch (error) {
            logger.error(`Failed to save GitHub report: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * 미리보기 리포트 저장 (임시 캐시)
     */
    savePreviewReport(type, content, metadata = {}) {
        try {
            const reportId = this.generateReportId();
            const timestamp = new Date().toISOString();
            
            const reportData = {
                id: reportId,
                type: `${type}-preview`,
                content: content,
                metadata: {
                    ...metadata,
                    generatedAt: timestamp,
                    isPreview: true,
                    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24시간 후 만료
                }
            };

            const filename = `preview-${reportId}.json`;
            const filepath = path.join(this.cacheDir, filename);
            
            fs.writeFileSync(filepath, JSON.stringify(reportData, null, 2), 'utf8');
            
            logger.info(`GitHub preview report saved: ${reportId}`);
            return { success: true, reportId, filepath };
        } catch (error) {
            logger.error(`Failed to save GitHub preview report: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * 리포트 로드
     */
    loadReport(reportId) {
        try {
            const filename = `${reportId}.json`;
            const filepath = path.join(this.cacheDir, filename);
            
            if (!fs.existsSync(filepath)) {
                // preview 파일 확인
                const previewFilepath = path.join(this.cacheDir, `preview-${reportId}.json`);
                if (fs.existsSync(previewFilepath)) {
                    const reportData = JSON.parse(fs.readFileSync(previewFilepath, 'utf8'));
                    return { success: true, report: reportData };
                }
                return { success: false, error: 'Report not found' };
            }
            
            const reportData = JSON.parse(fs.readFileSync(filepath, 'utf8'));
            return { success: true, report: reportData };
        } catch (error) {
            logger.error(`Failed to load GitHub report ${reportId}: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * 최신 리포트 로드
     */
    loadLatestReport(type) {
        try {
            const linkFilepath = path.join(this.cacheDir, `latest-${type}.json`);
            
            if (!fs.existsSync(linkFilepath)) {
                return { success: false, error: 'No latest report found' };
            }
            
            const linkData = JSON.parse(fs.readFileSync(linkFilepath, 'utf8'));
            return this.loadReport(linkData.reportId);
        } catch (error) {
            logger.error(`Failed to load latest GitHub report: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * 캐시된 리포트 로드 (유효성 검사 포함)
     */
    loadLatestCachedReport(type, maxAgeHours = 24) {
        try {
            const result = this.loadLatestReport(type);
            
            if (!result.success || !result.report) {
                return null;
            }
            
            const report = result.report;
            const generatedAt = new Date(report.metadata.generatedAt);
            const now = new Date();
            const ageHours = (now - generatedAt) / (1000 * 60 * 60);
            
            if (ageHours > maxAgeHours) {
                logger.info(`Cached report expired (${ageHours.toFixed(1)} hours old)`);
                return null;
            }
            
            logger.info(`Using cached report (${ageHours.toFixed(1)} hours old)`);
            return report;
        } catch (error) {
            logger.error(`Failed to load cached report: ${error.message}`);
            return null;
        }
    }

    /**
     * 최신 리포트 링크 업데이트
     */
    updateLatestReportLink(type, reportId) {
        try {
            const linkData = {
                type: type,
                reportId: reportId,
                updatedAt: new Date().toISOString()
            };
            
            const linkFilepath = path.join(this.cacheDir, `latest-${type}.json`);
            fs.writeFileSync(linkFilepath, JSON.stringify(linkData, null, 2), 'utf8');
        } catch (error) {
            logger.error(`Failed to update latest report link: ${error.message}`);
        }
    }

    /**
     * 리포트 목록 조회
     */
    listReports(type = null, limit = 10) {
        try {
            const files = fs.readdirSync(this.cacheDir)
                .filter(file => file.endsWith('.json') && !file.startsWith('latest-') && !file.startsWith('preview-'))
                .map(file => {
                    const filepath = path.join(this.cacheDir, file);
                    const stats = fs.statSync(filepath);
                    
                    try {
                        const reportData = JSON.parse(fs.readFileSync(filepath, 'utf8'));
                        return {
                            id: reportData.id,
                            type: reportData.type,
                            generatedAt: reportData.metadata.generatedAt,
                            size: stats.size,
                            filename: file
                        };
                    } catch (error) {
                        return null;
                    }
                })
                .filter(report => report !== null);

            // 타입 필터링
            let filteredReports = files;
            if (type) {
                filteredReports = files.filter(report => report.type === type);
            }

            // 생성일 기준 내림차순 정렬
            filteredReports.sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt));

            // 제한
            if (limit > 0) {
                filteredReports = filteredReports.slice(0, limit);
            }

            return { success: true, reports: filteredReports };
        } catch (error) {
            logger.error(`Failed to list GitHub reports: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * 리포트 삭제
     */
    deleteReport(reportId) {
        try {
            const filename = `${reportId}.json`;
            const filepath = path.join(this.cacheDir, filename);
            
            if (fs.existsSync(filepath)) {
                fs.unlinkSync(filepath);
                logger.info(`GitHub report deleted: ${reportId}`);
                return { success: true };
            }
            
            return { success: false, error: 'Report not found' };
        } catch (error) {
            logger.error(`Failed to delete GitHub report ${reportId}: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * 오래된 리포트 정리
     */
    cleanupOldReports(maxAgeHours = 168) { // 7일
        try {
            const files = fs.readdirSync(this.cacheDir);
            const now = new Date();
            let deletedCount = 0;
            
            for (const file of files) {
                if (!file.endsWith('.json') || file.startsWith('latest-')) {
                    continue;
                }
                
                const filepath = path.join(this.cacheDir, file);
                const stats = fs.statSync(filepath);
                const ageHours = (now - stats.mtime) / (1000 * 60 * 60);
                
                if (ageHours > maxAgeHours) {
                    // 아카이브로 이동
                    const archiveFilepath = path.join(this.archiveDir, file);
                    fs.renameSync(filepath, archiveFilepath);
                    deletedCount++;
                }
            }
            
            logger.info(`Cleaned up ${deletedCount} old GitHub reports`);
            return { success: true, deletedCount };
        } catch (error) {
            logger.error(`Failed to cleanup old GitHub reports: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * 미리보기 리포트 정리
     */
    cleanupPreviewReports() {
        try {
            const files = fs.readdirSync(this.cacheDir);
            const now = new Date();
            let deletedCount = 0;
            
            for (const file of files) {
                if (!file.startsWith('preview-') || !file.endsWith('.json')) {
                    continue;
                }
                
                const filepath = path.join(this.cacheDir, file);
                
                try {
                    const reportData = JSON.parse(fs.readFileSync(filepath, 'utf8'));
                    const expiresAt = new Date(reportData.metadata.expiresAt);
                    
                    if (now > expiresAt) {
                        fs.unlinkSync(filepath);
                        deletedCount++;
                    }
                } catch (error) {
                    // 잘못된 파일이면 삭제
                    fs.unlinkSync(filepath);
                    deletedCount++;
                }
            }
            
            logger.info(`Cleaned up ${deletedCount} expired preview reports`);
            return { success: true, deletedCount };
        } catch (error) {
            logger.error(`Failed to cleanup preview reports: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * 스토리지 사용량 조회
     */
    getStorageStats() {
        try {
            const stats = {
                totalReports: 0,
                previewReports: 0,
                archivedReports: 0,
                totalSize: 0,
                cacheSize: 0,
                archiveSize: 0
            };
            
            // 캐시 디렉토리 분석
            if (fs.existsSync(this.cacheDir)) {
                const cacheFiles = fs.readdirSync(this.cacheDir);
                for (const file of cacheFiles) {
                    const filepath = path.join(this.cacheDir, file);
                    const fileStats = fs.statSync(filepath);
                    
                    if (file.endsWith('.json')) {
                        if (file.startsWith('preview-')) {
                            stats.previewReports++;
                        } else if (!file.startsWith('latest-')) {
                            stats.totalReports++;
                        }
                        stats.cacheSize += fileStats.size;
                    }
                }
            }
            
            // 아카이브 디렉토리 분석
            if (fs.existsSync(this.archiveDir)) {
                const archiveFiles = fs.readdirSync(this.archiveDir);
                for (const file of archiveFiles) {
                    const filepath = path.join(this.archiveDir, file);
                    const fileStats = fs.statSync(filepath);
                    
                    if (file.endsWith('.json')) {
                        stats.archivedReports++;
                        stats.archiveSize += fileStats.size;
                    }
                }
            }
            
            stats.totalSize = stats.cacheSize + stats.archiveSize;
            
            return stats;
        } catch (error) {
            logger.error(`Failed to get storage stats: ${error.message}`);
            return {
                totalReports: 0,
                previewReports: 0,
                archivedReports: 0,
                totalSize: 0,
                cacheSize: 0,
                archiveSize: 0
            };
        }
    }

    /**
     * 백업 생성
     */
    createBackup(backupDir = null) {
        try {
            const defaultBackupDir = path.join(__dirname, '../../backups/github-reports');
            const targetDir = backupDir || defaultBackupDir;
            
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = path.join(targetDir, `github-reports-backup-${timestamp}`);
            
            // 캐시 디렉토리 복사
            fs.cpSync(this.cacheDir, backupPath, { recursive: true });
            
            logger.info(`GitHub reports backup created: ${backupPath}`);
            return { success: true, backupPath };
        } catch (error) {
            logger.error(`Failed to create backup: ${error.message}`);
            return { success: false, error: error.message };
        }
    }
}

module.exports = GitHubReportManager;
