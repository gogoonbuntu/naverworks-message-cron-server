// src/github/storage-manager.js
// 저장소 관리 서비스 - 파일 저장/관리 담당

const fs = require('fs');
const path = require('path');
const logger = require('../../logger');

class StorageManager {
    constructor() {
        this.CACHE_DIR = path.join(__dirname, '../../cache');
        this.GITHUB_REPORTS_DIR = path.join(this.CACHE_DIR, 'github-reports');
        this.ARCHIVE_DIR = path.join(this.GITHUB_REPORTS_DIR, 'archive');
        
        this.ensureDirectories();
    }

    /**
     * 필요한 디렉토리 생성
     */
    ensureDirectories() {
        try {
            [this.CACHE_DIR, this.GITHUB_REPORTS_DIR, this.ARCHIVE_DIR].forEach(dir => {
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                    logger.info(`Created directory: ${dir}`);
                }
            });
        } catch (error) {
            logger.error(`Error creating directories: ${error.message}`, error);
        }
    }

    /**
     * 리포트 ID 생성
     */
    generateReportId() {
        return `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * 미리보기 리포트 저장
     */
    savePreviewReport(type, content, metadata = {}) {
        try {
            const reportId = this.generateReportId();
            const reportData = {
                id: reportId,
                type,
                content,
                metadata: {
                    ...metadata,
                    generatedAt: new Date().toISOString()
                },
                timestamp: new Date().toISOString(),
                category: 'preview'
            };

            const fileName = `${type}_${reportId}.json`;
            const filePath = path.join(this.GITHUB_REPORTS_DIR, fileName);

            fs.writeFileSync(filePath, JSON.stringify(reportData, null, 2));
            logger.info(`Report saved: ${fileName}`);

            return { success: true, reportId, filePath };
        } catch (error) {
            logger.error(`Error saving preview report: ${error.message}`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 리포트 발송 및 아카이브
     */
    sendAndArchiveReport(message, type, metadata = {}) {
        try {
            const reportId = this.generateReportId();
            const reportData = {
                id: reportId,
                type,
                content: message,
                metadata: {
                    ...metadata,
                    sentAt: new Date().toISOString(),
                    archivedAt: new Date().toISOString()
                },
                timestamp: new Date().toISOString(),
                category: 'archive'
            };

            const fileName = `${type}_${reportId}.json`;
            const filePath = path.join(this.ARCHIVE_DIR, fileName);

            fs.writeFileSync(filePath, JSON.stringify(reportData, null, 2));
            logger.info(`Report archived: ${fileName}`);

            return { success: true, reportId, filePath, category: 'archive' };

        } catch (error) {
            logger.error(`Error archiving report: ${error.message}`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 리포트 히스토리 조회
     */
    getReportHistory(type = null, limit = 20) {
        try {
            const history = [];
            
            // 미리보기 리포트 조회
            if (fs.existsSync(this.GITHUB_REPORTS_DIR)) {
                const files = fs.readdirSync(this.GITHUB_REPORTS_DIR);
                files.forEach(file => {
                    if (file.endsWith('.json')) {
                        try {
                            const filePath = path.join(this.GITHUB_REPORTS_DIR, file);
                            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                            
                            if (!type || data.type === type) {
                                history.push({
                                    id: data.id,
                                    type: data.type,
                                    timestamp: data.timestamp,
                                    category: data.category || 'preview',
                                    metadata: data.metadata || {},
                                    fileName: file
                                });
                            }
                        } catch (error) {
                            logger.warn(`Error reading report file ${file}: ${error.message}`);
                        }
                    }
                });
            }
            
            // 아카이브 리포트 조회
            if (fs.existsSync(this.ARCHIVE_DIR)) {
                const archiveFiles = fs.readdirSync(this.ARCHIVE_DIR);
                archiveFiles.forEach(file => {
                    if (file.endsWith('.json')) {
                        try {
                            const filePath = path.join(this.ARCHIVE_DIR, file);
                            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                            
                            if (!type || data.type === type) {
                                history.push({
                                    id: data.id,
                                    type: data.type,
                                    timestamp: data.timestamp,
                                    category: data.category || 'archive',
                                    metadata: data.metadata || {},
                                    fileName: file
                                });
                            }
                        } catch (error) {
                            logger.warn(`Error reading archive file ${file}: ${error.message}`);
                        }
                    }
                });
            }
            
            // 타임스탬프 기준 내림차순 정렬 후 제한
            history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            return history.slice(0, limit);
            
        } catch (error) {
            logger.error(`Error getting report history: ${error.message}`, error);
            return [];
        }
    }

    /**
     * 리포트 삭제
     */
    deleteReport(reportId) {
        try {
            let deleted = false;
            let deletedFrom = null;
            
            // 미리보기 리포트에서 찾기
            if (fs.existsSync(this.GITHUB_REPORTS_DIR)) {
                const files = fs.readdirSync(this.GITHUB_REPORTS_DIR);
                for (const file of files) {
                    if (file.endsWith('.json')) {
                        const filePath = path.join(this.GITHUB_REPORTS_DIR, file);
                        try {
                            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                            if (data.id === reportId) {
                                fs.unlinkSync(filePath);
                                deleted = true;
                                deletedFrom = 'preview';
                                break;
                            }
                        } catch (error) {
                            logger.warn(`Error reading file ${file}: ${error.message}`);
                        }
                    }
                }
            }
            
            // 아카이브에서 찾기
            if (!deleted && fs.existsSync(this.ARCHIVE_DIR)) {
                const archiveFiles = fs.readdirSync(this.ARCHIVE_DIR);
                for (const file of archiveFiles) {
                    if (file.endsWith('.json')) {
                        const filePath = path.join(this.ARCHIVE_DIR, file);
                        try {
                            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                            if (data.id === reportId) {
                                fs.unlinkSync(filePath);
                                deleted = true;
                                deletedFrom = 'archive';
                                break;
                            }
                        } catch (error) {
                            logger.warn(`Error reading archive file ${file}: ${error.message}`);
                        }
                    }
                }
            }
            
            if (deleted) {
                logger.info(`Report ${reportId} deleted from ${deletedFrom}`);
                return {
                    success: true,
                    message: `리포트가 성공적으로 삭제되었습니다.`,
                    deletedFrom
                };
            } else {
                return {
                    success: false,
                    message: `리포트 ID ${reportId}를 찾을 수 없습니다.`
                };
            }
            
        } catch (error) {
            logger.error(`Error deleting report ${reportId}: ${error.message}`, error);
            return {
                success: false,
                message: `리포트 삭제 중 오류가 발생했습니다: ${error.message}`
            };
        }
    }

    /**
     * 리포트 내용 조회
     */
    getReportContent(reportId) {
        try {
            // 미리보기 리포트에서 찾기
            if (fs.existsSync(this.GITHUB_REPORTS_DIR)) {
                const files = fs.readdirSync(this.GITHUB_REPORTS_DIR);
                for (const file of files) {
                    if (file.endsWith('.json')) {
                        const filePath = path.join(this.GITHUB_REPORTS_DIR, file);
                        try {
                            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                            if (data.id === reportId) {
                                return data;
                            }
                        } catch (error) {
                            logger.warn(`Error reading file ${file}: ${error.message}`);
                        }
                    }
                }
            }
            
            // 아카이브에서 찾기
            if (fs.existsSync(this.ARCHIVE_DIR)) {
                const archiveFiles = fs.readdirSync(this.ARCHIVE_DIR);
                for (const file of archiveFiles) {
                    if (file.endsWith('.json')) {
                        const filePath = path.join(this.ARCHIVE_DIR, file);
                        try {
                            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                            if (data.id === reportId) {
                                return data;
                            }
                        } catch (error) {
                            logger.warn(`Error reading archive file ${file}: ${error.message}`);
                        }
                    }
                }
            }
            
            return null;
            
        } catch (error) {
            logger.error(`Error getting report content ${reportId}: ${error.message}`, error);
            return null;
        }
    }

    /**
     * 오늘의 최근 리포트 조회
     */
    getLatestTodayReport() {
        try {
            const today = new Date().toISOString().split('T')[0];
            const allHistory = this.getReportHistory(null, 100);
            
            const todayReports = allHistory.filter(report => {
                const reportDate = new Date(report.timestamp).toISOString().split('T')[0];
                return reportDate === today;
            });
            
            return todayReports.length > 0 ? todayReports[0] : null;
            
        } catch (error) {
            logger.error(`Error getting latest today report: ${error.message}`, error);
            return null;
        }
    }

    /**
     * 저장소 통계 조회
     */
    getStorageStats() {
        try {
            const stats = {
                preview: { count: 0, size: 0 },
                archive: { count: 0, size: 0 },
                total: { count: 0, size: 0, sizeMB: '0.00' }
            };

            if (fs.existsSync(this.GITHUB_REPORTS_DIR)) {
                const files = fs.readdirSync(this.GITHUB_REPORTS_DIR);
                files.forEach(file => {
                    const filePath = path.join(this.GITHUB_REPORTS_DIR, file);
                    if (fs.statSync(filePath).isFile()) {
                        const stat = fs.statSync(filePath);
                        stats.preview.count++;
                        stats.preview.size += stat.size;
                    }
                });
            }

            if (fs.existsSync(this.ARCHIVE_DIR)) {
                const archiveFiles = fs.readdirSync(this.ARCHIVE_DIR);
                archiveFiles.forEach(file => {
                    const filePath = path.join(this.ARCHIVE_DIR, file);
                    if (fs.statSync(filePath).isFile()) {
                        const stat = fs.statSync(filePath);
                        stats.archive.count++;
                        stats.archive.size += stat.size;
                    }
                });
            }

            stats.total.count = stats.preview.count + stats.archive.count;
            stats.total.size = stats.preview.size + stats.archive.size;
            stats.total.sizeMB = (stats.total.size / (1024 * 1024)).toFixed(2);

            return stats;

        } catch (error) {
            logger.error(`Error getting storage stats: ${error.message}`, error);
            return {
                preview: { count: 0, size: 0 },
                archive: { count: 0, size: 0 },
                total: { count: 0, size: 0, sizeMB: '0.00' },
                error: error.message
            };
        }
    }

    /**
     * 캐시 정리
     */
    clearCache() {
        try {
            let deletedCount = 0;
            let deletedSize = 0;

            if (fs.existsSync(this.GITHUB_REPORTS_DIR)) {
                const files = fs.readdirSync(this.GITHUB_REPORTS_DIR);
                files.forEach(file => {
                    const filePath = path.join(this.GITHUB_REPORTS_DIR, file);
                    if (fs.statSync(filePath).isFile()) {
                        const stat = fs.statSync(filePath);
                        deletedSize += stat.size;
                        fs.unlinkSync(filePath);
                        deletedCount++;
                    }
                });
            }

            logger.info(`Cache cleared: ${deletedCount} files deleted, ${deletedSize} bytes freed`);

            return {
                success: true,
                deletedCount,
                deletedSize,
                message: `캐시가 정리되었습니다. ${deletedCount}개 파일 삭제`
            };

        } catch (error) {
            logger.error(`Error clearing cache: ${error.message}`, error);
            return {
                success: false,
                error: error.message,
                message: `캐시 정리 중 오류가 발생했습니다: ${error.message}`
            };
        }
    }
}

module.exports = StorageManager;