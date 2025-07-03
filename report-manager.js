// report-manager.js
// GitHub 리포트 파일 저장 및 관리 시스템

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

// 리포트 저장 디렉토리
const REPORTS_DIR = path.join(__dirname, 'reports');
const PREVIEWS_DIR = path.join(REPORTS_DIR, 'previews');
const ARCHIVES_DIR = path.join(REPORTS_DIR, 'archives');

// 최대 보관 파일 수
const MAX_PREVIEW_FILES = 20;
const MAX_ARCHIVE_FILES = 100;

class ReportManager {
    constructor() {
        this.initializeDirectories();
    }

    /**
     * 필요한 디렉토리 초기화
     */
    initializeDirectories() {
        try {
            [REPORTS_DIR, PREVIEWS_DIR, ARCHIVES_DIR].forEach(dir => {
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                    logger.info(`Created directory: ${dir}`);
                }
            });
        } catch (error) {
            logger.error(`Failed to initialize report directories: ${error.message}`, error);
        }
    }

    /**
     * 리포트 미리보기 저장
     * @param {string} type - 리포트 타입 (weekly/monthly/custom)
     * @param {string} content - 리포트 내용
     * @param {Object} metadata - 리포트 메타데이터
     * @returns {Object} - 저장 결과
     */
    savePreviewReport(type, content, metadata = {}) {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `${type}-preview-${timestamp}.json`;
            const filepath = path.join(PREVIEWS_DIR, filename);
            
            const reportData = {
                id: this.generateReportId(),
                type,
                content,
                metadata: {
                    ...metadata,
                    generatedAt: new Date().toISOString(),
                    version: '1.0',
                    size: Buffer.byteLength(content, 'utf8')
                },
                filename,
                filepath
            };
            
            // 파일 저장
            fs.writeFileSync(filepath, JSON.stringify(reportData, null, 2), 'utf8');
            
            // 최신 미리보기 심볼릭 링크 업데이트
            this.updateLatestPreviewLink(type, filename);
            
            // 오래된 미리보기 파일 정리
            this.cleanupOldPreviews();
            
            logger.info(`Preview report saved: ${filename}`);
            return {
                success: true,
                reportId: reportData.id,
                filename,
                filepath,
                metadata: reportData.metadata
            };
            
        } catch (error) {
            logger.error(`Failed to save preview report: ${error.message}`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 리포트 아카이브 저장 (실제 발송된 리포트)
     * @param {string} type - 리포트 타입
     * @param {string} content - 리포트 내용
     * @param {Object} metadata - 리포트 메타데이터
     * @returns {Object} - 저장 결과
     */
    archiveReport(type, content, metadata = {}) {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `${type}-sent-${timestamp}.json`;
            const filepath = path.join(ARCHIVES_DIR, filename);
            
            const reportData = {
                id: this.generateReportId(),
                type,
                content,
                metadata: {
                    ...metadata,
                    sentAt: new Date().toISOString(),
                    version: '1.0',
                    size: Buffer.byteLength(content, 'utf8')
                },
                filename,
                filepath
            };
            
            // 파일 저장
            fs.writeFileSync(filepath, JSON.stringify(reportData, null, 2), 'utf8');
            
            // 오래된 아카이브 파일 정리
            this.cleanupOldArchives();
            
            logger.info(`Report archived: ${filename}`);
            return {
                success: true,
                reportId: reportData.id,
                filename,
                filepath,
                metadata: reportData.metadata
            };
            
        } catch (error) {
            logger.error(`Failed to archive report: ${error.message}`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 최신 미리보기 링크 업데이트
     * @param {string} type - 리포트 타입
     * @param {string} filename - 파일명
     */
    updateLatestPreviewLink(type, filename) {
        try {
            const latestPath = path.join(PREVIEWS_DIR, `latest-${type}-preview.json`);
            const targetPath = path.join(PREVIEWS_DIR, filename);
            
            // 기존 링크 제거
            if (fs.existsSync(latestPath)) {
                fs.unlinkSync(latestPath);
            }
            
            // 새 링크 생성 (Windows에서는 copy 사용)
            if (process.platform === 'win32') {
                fs.copyFileSync(targetPath, latestPath);
            } else {
                fs.symlinkSync(filename, latestPath);
            }
            
        } catch (error) {
            logger.warn(`Failed to update latest preview link: ${error.message}`);
        }
    }

    /**
     * 리포트 로드
     * @param {string} reportId - 리포트 ID
     * @returns {Object|null} - 리포트 데이터
     */
    loadReport(reportId) {
        try {
            // 미리보기 및 아카이브에서 검색
            const directories = [PREVIEWS_DIR, ARCHIVES_DIR];
            
            for (const dir of directories) {
                const files = fs.readdirSync(dir).filter(file => file.endsWith('.json'));
                
                for (const file of files) {
                    try {
                        const filepath = path.join(dir, file);
                        const content = fs.readFileSync(filepath, 'utf8');
                        const reportData = JSON.parse(content);
                        
                        if (reportData.id === reportId) {
                            return reportData;
                        }
                    } catch (parseError) {
                        logger.warn(`Failed to parse report file ${file}: ${parseError.message}`);
                    }
                }
            }
            
            return null;
            
        } catch (error) {
            logger.error(`Failed to load report ${reportId}: ${error.message}`, error);
            return null;
        }
    }

    /**
     * 최신 캐시된 리포트 로드
     * @param {string} type - 리포트 타입
     * @returns {Object|null} - 리포트 데이터
     */
    loadLatestCachedReport(type) {
        try {
            const latestPath = path.join(PREVIEWS_DIR, `latest-${type}-preview.json`);
            
            if (!fs.existsSync(latestPath)) {
                return null;
            }
            
            const content = fs.readFileSync(latestPath, 'utf8');
            const reportData = JSON.parse(content);
            
            // 캐시 유효성 검사 (24시간 이내)
            const generatedAt = new Date(reportData.metadata.generatedAt);
            const now = new Date();
            const hoursDiff = (now - generatedAt) / (1000 * 60 * 60);
            
            if (hoursDiff > 24) {
                logger.info(`Cached report for ${type} is older than 24 hours, ignoring cache`);
                return null;
            }
            
            return reportData;
            
        } catch (error) {
            logger.error(`Failed to load latest cached report: ${error.message}`, error);
            return null;
        }
    }

    /**
     * 리포트 목록 조회
     * @param {string} type - 리포트 타입 (optional)
     * @param {number} limit - 최대 개수 (기본: 20)
     * @returns {Array} - 리포트 목록
     */
    getReportList(type = null, limit = 20) {
        try {
            const reports = [];
            const directories = [
                { path: PREVIEWS_DIR, category: 'preview' },
                { path: ARCHIVES_DIR, category: 'archive' }
            ];
            
            for (const { path: dir, category } of directories) {
                const files = fs.readdirSync(dir)
                    .filter(file => file.endsWith('.json') && !file.startsWith('latest-'))
                    .sort()
                    .reverse(); // 최신순
                
                for (const file of files) {
                    try {
                        const filepath = path.join(dir, file);
                        const content = fs.readFileSync(filepath, 'utf8');
                        const reportData = JSON.parse(content);
                        
                        if (!type || reportData.type === type) {
                            reports.push({
                                id: reportData.id,
                                type: reportData.type,
                                category,
                                filename: reportData.filename,
                                generatedAt: reportData.metadata.generatedAt,
                                sentAt: reportData.metadata.sentAt,
                                size: reportData.metadata.size
                            });
                        }
                        
                        if (reports.length >= limit) {
                            break;
                        }
                    } catch (parseError) {
                        logger.warn(`Failed to parse report file ${file}: ${parseError.message}`);
                    }
                }
                
                if (reports.length >= limit) {
                    break;
                }
            }
            
            return reports.slice(0, limit);
            
        } catch (error) {
            logger.error(`Failed to get report list: ${error.message}`, error);
            return [];
        }
    }

    /**
     * 리포트 삭제
     * @param {string} reportId - 리포트 ID
     * @returns {boolean} - 삭제 성공 여부
     */
    deleteReport(reportId) {
        try {
            const reportData = this.loadReport(reportId);
            if (!reportData) {
                logger.warn(`Report not found for deletion: ${reportId}`);
                return false;
            }
            
            fs.unlinkSync(reportData.filepath);
            logger.info(`Report deleted: ${reportData.filename}`);
            return true;
            
        } catch (error) {
            logger.error(`Failed to delete report ${reportId}: ${error.message}`, error);
            return false;
        }
    }

    /**
     * 오래된 미리보기 파일 정리
     */
    cleanupOldPreviews() {
        try {
            this.cleanupOldFiles(PREVIEWS_DIR, MAX_PREVIEW_FILES);
        } catch (error) {
            logger.error(`Failed to cleanup old previews: ${error.message}`, error);
        }
    }

    /**
     * 오래된 아카이브 파일 정리
     */
    cleanupOldArchives() {
        try {
            this.cleanupOldFiles(ARCHIVES_DIR, MAX_ARCHIVE_FILES);
        } catch (error) {
            logger.error(`Failed to cleanup old archives: ${error.message}`, error);
        }
    }

    /**
     * 오래된 파일 정리 (공통 로직)
     * @param {string} directory - 대상 디렉토리
     * @param {number} maxFiles - 최대 파일 수
     */
    cleanupOldFiles(directory, maxFiles) {
        const files = fs.readdirSync(directory)
            .filter(file => file.endsWith('.json') && !file.startsWith('latest-'))
            .map(file => ({
                name: file,
                path: path.join(directory, file),
                mtime: fs.statSync(path.join(directory, file)).mtime
            }))
            .sort((a, b) => b.mtime - a.mtime); // 최신순 정렬
        
        if (files.length > maxFiles) {
            const filesToDelete = files.slice(maxFiles);
            
            for (const file of filesToDelete) {
                try {
                    fs.unlinkSync(file.path);
                    logger.debug(`Cleaned up old file: ${file.name}`);
                } catch (deleteError) {
                    logger.warn(`Failed to delete old file ${file.name}: ${deleteError.message}`);
                }
            }
            
            logger.info(`Cleaned up ${filesToDelete.length} old files from ${directory}`);
        }
    }

    /**
     * 리포트 ID 생성
     * @returns {string} - 고유 리포트 ID
     */
    generateReportId() {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 8);
        return `report_${timestamp}_${random}`;
    }

    /**
     * 저장소 통계 조회
     * @returns {Object} - 저장소 통계
     */
    getStorageStats() {
        try {
            const previewFiles = fs.readdirSync(PREVIEWS_DIR).filter(file => file.endsWith('.json'));
            const archiveFiles = fs.readdirSync(ARCHIVES_DIR).filter(file => file.endsWith('.json'));
            
            let previewSize = 0;
            let archiveSize = 0;
            
            // 미리보기 파일 크기 계산
            for (const file of previewFiles) {
                try {
                    const stat = fs.statSync(path.join(PREVIEWS_DIR, file));
                    previewSize += stat.size;
                } catch (error) {
                    logger.warn(`Failed to get file size for ${file}: ${error.message}`);
                }
            }
            
            // 아카이브 파일 크기 계산
            for (const file of archiveFiles) {
                try {
                    const stat = fs.statSync(path.join(ARCHIVES_DIR, file));
                    archiveSize += stat.size;
                } catch (error) {
                    logger.warn(`Failed to get file size for ${file}: ${error.message}`);
                }
            }
            
            return {
                preview: {
                    count: previewFiles.length,
                    sizeBytes: previewSize,
                    sizeMB: (previewSize / 1024 / 1024).toFixed(2)
                },
                archive: {
                    count: archiveFiles.length,
                    sizeBytes: archiveSize,
                    sizeMB: (archiveSize / 1024 / 1024).toFixed(2)
                },
                total: {
                    count: previewFiles.length + archiveFiles.length,
                    sizeBytes: previewSize + archiveSize,
                    sizeMB: ((previewSize + archiveSize) / 1024 / 1024).toFixed(2)
                }
            };
            
        } catch (error) {
            logger.error(`Failed to get storage stats: ${error.message}`, error);
            return {
                preview: { count: 0, sizeBytes: 0, sizeMB: '0.00' },
                archive: { count: 0, sizeBytes: 0, sizeMB: '0.00' },
                total: { count: 0, sizeBytes: 0, sizeMB: '0.00' }
            };
        }
    }

    /**
     * 전체 캐시 정리
     */
    clearAllCache() {
        try {
            let deletedCount = 0;
            
            // 미리보기 파일 정리
            const previewFiles = fs.readdirSync(PREVIEWS_DIR).filter(file => file.endsWith('.json'));
            for (const file of previewFiles) {
                try {
                    fs.unlinkSync(path.join(PREVIEWS_DIR, file));
                    deletedCount++;
                } catch (error) {
                    logger.warn(`Failed to delete preview file ${file}: ${error.message}`);
                }
            }
            
            // 아카이브는 보존 (실제 발송된 리포트이므로)
            
            logger.info(`Cleared ${deletedCount} cached preview files`);
            return { success: true, deletedCount };
            
        } catch (error) {
            logger.error(`Failed to clear cache: ${error.message}`, error);
            return { success: false, error: error.message };
        }
    }
}

module.exports = ReportManager;
