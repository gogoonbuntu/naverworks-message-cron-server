// github-service.js
// GitHub 기능 서비스 - 메인 애플리케이션과 GitHub 모듈을 연결

const fs = require('fs');
const path = require('path');
const GitHubAnalyzer = require('./github-analyzer');
const GitHubMessageRenderer = require('./github-message-renderer');
const ReportManager = require('./report-manager');
const logger = require('./logger');

// 리포트 캐시 디렉토리
const REPORTS_DIR = path.join(__dirname, 'reports');
if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

class GitHubService {
    constructor() {
        this.analyzer = null;
        this.renderer = null;
        this.reportManager = null;
        this.config = null;
        this.isEnabled = false;
        this.progressCallback = null;
        this.isGenerating = false;
        this.currentReportId = null;
        
        this.loadConfiguration();
    }

    /**
     * GitHub 설정 로드
     */
    loadConfiguration() {
        try {
            const configPath = path.join(__dirname, 'github-config.json');
            
            if (!fs.existsSync(configPath)) {
                logger.warn('GitHub configuration file not found. GitHub features will be disabled.');
                this.isEnabled = false;
                return;
            }

            const configData = fs.readFileSync(configPath, 'utf8');
            this.config = JSON.parse(configData);

            // 필수 설정 검증
            if (!this.config.githubToken || this.config.githubToken === 'YOUR_GITHUB_TOKEN_HERE') {
                logger.warn('GitHub token not configured. GitHub features will be disabled.');
                this.isEnabled = false;
                return;
            }

            if (!this.config.repositories || this.config.repositories.length === 0) {
                logger.warn('No repositories configured. GitHub features will be disabled.');
                this.isEnabled = false;
                return;
            }

            if (!this.config.teamMembers || this.config.teamMembers.length === 0) {
                logger.warn('No team members configured. GitHub features will be disabled.');
                this.isEnabled = false;
                return;
            }

            // GitHub 분석기, 렌더러 및 리포트 매니저 초기화
            this.analyzer = new GitHubAnalyzer(this.config);
            this.renderer = new GitHubMessageRenderer(this.config.messageSettings);
            this.reportManager = new ReportManager();

            // 설정 유효성 검사
            const validationErrors = this.analyzer.validateConfig();
            if (validationErrors.length > 0) {
                logger.error('GitHub configuration validation failed:', validationErrors);
                this.isEnabled = false;
                return;
            }

            this.isEnabled = true;
            logger.info('GitHub service initialized successfully');
            logger.info(`Monitoring ${this.config.repositories.length} repositories for ${this.config.teamMembers.length} team members`);

        } catch (error) {
            logger.error(`Failed to load GitHub configuration: ${error.message}`, error);
            this.isEnabled = false;
        }
    }

    /**
     * 설정 저장
     */
    saveConfiguration() {
        try {
            const configPath = path.join(__dirname, 'github-config.json');
            fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2), 'utf8');
            logger.info('GitHub configuration saved successfully');
        } catch (error) {
            logger.error(`Failed to save GitHub configuration: ${error.message}`, error);
            throw error;
        }
    }

    /**
     * 진행도 콜백 설정
     * @param {Function} callback - 진행도 콜백 함수
     */
    setProgressCallback(callback) {
        this.progressCallback = callback;
    }

    /**
     * 진행도 보고
     * @param {string} message - 진행 메시지
     * @param {number} percentage - 진행률 (0-100)
     * @param {Object} details - 추가 세부 정보
     */
    reportProgress(message, percentage = null, details = {}) {
        const progressData = {
            message,
            percentage,
            timestamp: new Date().toISOString(),
            reportId: this.currentReportId,
            stage: details.stage || 'processing',
            currentStep: details.currentStep || null,
            totalSteps: details.totalSteps || null,
            repository: details.repository || null,
            member: details.member || null
        };
        
        if (this.progressCallback) {
            this.progressCallback(progressData);
        }
        
        const progressText = percentage !== null ? ` (${percentage}%)` : '';
        const stepText = details.currentStep && details.totalSteps ? ` [${details.currentStep}/${details.totalSteps}]` : '';
        logger.info(`GitHub Report Progress: ${message}${progressText}${stepText}`);
        
        // 진행도가 100%이거나 완료 단계인 경우 리포트 ID 초기화
        if (percentage === 100 || details.stage === 'completed' || details.stage === 'error') {
            this.currentReportId = null;
        }
    }


    /**
     * 주간 GitHub 리포트 생성 (진행도 표시 및 캐시 포함)
     */
    async generateWeeklyReport() {
        try {
            if (!this.isEnabled) {
                return { success: false, message: 'GitHub service is not enabled' };
            }

            if (this.isGenerating) {
                return { success: false, message: '이미 리포트를 생성 중입니다.' };
            }

            this.isGenerating = true;
            this.currentReportId = this.reportManager.generateReportId();
            this.reportProgress('주간 리포트 생성을 시작합니다...', 0, { stage: 'initializing' });

            // 캐시된 리포트 확인
            this.reportProgress('캐시된 리포트를 확인하고 있습니다...', 5, { stage: 'cache_check' });
            const cachedReport = this.reportManager.loadLatestCachedReport('weekly');
            if (cachedReport) {
                this.isGenerating = false;
                logger.info('Using cached weekly report');
                this.reportProgress('캐시된 리포트를 사용합니다.', 100, { stage: 'completed' });
                return {
                    success: true,
                    message: cachedReport.content,
                    data: cachedReport.metadata,
                    cached: true,
                    reportId: cachedReport.id
                };
            }

            // 주간 기간 계산
            this.reportProgress('분석 기간을 계산하고 있습니다...', 10, { stage: 'date_calculation' });
            const today = new Date();
            const kstToday = new Date(today.toLocaleString("en-US", {timeZone: "Asia/Seoul"}));
            const dayOfWeek = kstToday.getDay();
            const lastMonday = new Date(kstToday);
            lastMonday.setDate(kstToday.getDate() - dayOfWeek - 6);
            const lastSunday = new Date(lastMonday);
            lastSunday.setDate(lastMonday.getDate() + 6);

            const startDate = lastMonday.toISOString().split('T')[0];
            const endDate = lastSunday.toISOString().split('T')[0];

            this.reportProgress(`${startDate} ~ ${endDate} 기간의 GitHub 활동을 분석하고 있습니다...`, 20, {
                stage: 'data_analysis',
                currentStep: 1,
                totalSteps: 4
            });

            // 리포지토리별 데이터 수집
            this.reportProgress(`${this.config.repositories.length}개 리포지토리에서 데이터를 수집하고 있습니다...`, 40, {
                stage: 'data_collection',
                currentStep: 2,
                totalSteps: 4
            });
            const teamStats = await this.analyzer.analyzeTeamContributions(startDate, endDate, (repoProgress) => {
                // 리포지토리별 진행도 업데이트
                this.reportProgress(`리포지토리 '${repoProgress.repository}' 분석 중...`, 40 + (repoProgress.percentage * 0.3), {
                    stage: 'data_collection',
                    currentStep: 2,
                    totalSteps: 4,
                    repository: repoProgress.repository
                });
            });
            
            this.reportProgress('팀 통계를 계산하고 있습니다...', 70, {
                stage: 'statistics_calculation',
                currentStep: 3,
                totalSteps: 4
            });
            const teamSummary = this.analyzer.calculateTeamStats(teamStats);

            // 이전 주와 비교 (옵션)
            let comparison = null;
            if (this.config.analytics?.enablePeriodComparison) {
                this.reportProgress('이전 주 데이터와 비교하고 있습니다...', 80, {
                    stage: 'comparison',
                    currentStep: 3.5,
                    totalSteps: 4
                });
                const prevStartDate = new Date(lastMonday);
                prevStartDate.setDate(lastMonday.getDate() - 7);
                const prevEndDate = new Date(lastSunday);
                prevEndDate.setDate(lastSunday.getDate() - 7);
                
                comparison = await this.analyzer.calculatePeriodComparison(
                    teamStats,
                    prevStartDate.toISOString().split('T')[0],
                    prevEndDate.toISOString().split('T')[0]
                );
            }

            // 메시지 렌더링
            this.reportProgress('리포트 메시지를 생성하고 있습니다...', 90, {
                stage: 'message_rendering',
                currentStep: 4,
                totalSteps: 4
            });
            const periodInfo = { startDate, endDate };
            const message = this.renderer.renderWeeklyReport(teamStats, teamSummary, periodInfo, comparison);

            // 리포트 매니저에 저장
            this.reportProgress('리포트를 저장하고 있습니다...', 95, { stage: 'saving' });
            const data = {
                teamStats,
                teamSummary,
                periodInfo,
                comparison
            };
            
            const saveResult = this.reportManager.savePreviewReport('weekly', message, {
                period: periodInfo,
                teamMemberCount: this.config.teamMembers.length,
                repositoryCount: this.config.repositories.length,
                totalCommits: teamSummary.totalCommits,
                totalPRs: teamSummary.totalPRs,
                totalReviews: teamSummary.totalReviews,
                hasComparison: !!comparison
            });

            this.reportProgress('주간 리포트 생성이 완료되었습니다!', 100, { stage: 'completed' });
            this.isGenerating = false;
            
            logger.info('Weekly GitHub report generated successfully');
            return {
                success: true,
                message: message,
                data: data,
                reportId: saveResult.reportId,
                cached: false
            };

        } catch (error) {
            this.isGenerating = false;
            this.reportProgress('리포트 생성 중 오류가 발생했습니다.', null, { stage: 'error' });
            logger.error(`Failed to generate weekly GitHub report: ${error.message}`, error);
            return {
                success: false,
                message: 'GitHub 주간 리포트 생성 중 오류가 발생했습니다.',
                error: error.message
            };
        }
    }

    /**
     * 주간 GitHub 리포트 생성 및 전송 (기존 메서드 유지)
     */
    async generateAndSendWeeklyReport() {
        const result = await this.generateWeeklyReport();
        return result;
    }

    /**
     * 월간 GitHub 리포트 생성 (진행도 표시 및 캐시 포함)
     */
    async generateMonthlyReport() {
        try {
            if (!this.isEnabled) {
                return { success: false, message: 'GitHub service is not enabled' };
            }

            if (this.isGenerating) {
                return { success: false, message: '이미 리포트를 생성 중입니다.' };
            }

            this.isGenerating = true;
            this.currentReportId = this.reportManager.generateReportId();
            this.reportProgress('월간 리포트 생성을 시작합니다...', 0, { stage: 'initializing' });

            // 캐시된 리포트 확인
            this.reportProgress('캐시된 리포트를 확인하고 있습니다...', 5, { stage: 'cache_check' });
            const cachedReport = this.reportManager.loadLatestCachedReport('monthly');
            if (cachedReport) {
                // 월간 리포트는 7일 이내 캐시 재사용
                const now = new Date();
                const generatedAt = new Date(cachedReport.metadata.generatedAt);
                const daysDiff = (now - generatedAt) / (1000 * 60 * 60 * 24);
                
                if (daysDiff < 7) {
                    this.isGenerating = false;
                    logger.info('Using cached monthly report');
                    this.reportProgress('캐시된 리포트를 사용합니다.', 100, { stage: 'completed' });
                    return {
                        success: true,
                        message: cachedReport.content,
                        data: cachedReport.metadata,
                        cached: true,
                        reportId: cachedReport.id
                    };
                }
            }

            // 월간 기간 계산
            this.reportProgress('분석 기간을 계산하고 있습니다...', 10, { stage: 'date_calculation' });
            const today = new Date();
            const kstToday = new Date(today.toLocaleString("en-US", {timeZone: "Asia/Seoul"}));
            const firstDayOfLastMonth = new Date(kstToday.getFullYear(), kstToday.getMonth() - 1, 1);
            const lastDayOfLastMonth = new Date(kstToday.getFullYear(), kstToday.getMonth(), 0);

            const startDate = firstDayOfLastMonth.toISOString().split('T')[0];
            const endDate = lastDayOfLastMonth.toISOString().split('T')[0];

            this.reportProgress(`${startDate} ~ ${endDate} 기간의 GitHub 활동을 분석하고 있습니다...`, 20, {
                stage: 'data_analysis',
                currentStep: 1,
                totalSteps: 4
            });

            // 리포지토리별 데이터 수집
            this.reportProgress(`${this.config.repositories.length}개 리포지토리에서 데이터를 수집하고 있습니다...`, 40, {
                stage: 'data_collection',
                currentStep: 2,
                totalSteps: 4
            });
            const teamStats = await this.analyzer.analyzeTeamContributions(startDate, endDate, (repoProgress) => {
                // 리포지토리별 진행도 업데이트
                this.reportProgress(`리포지토리 '${repoProgress.repository}' 분석 중...`, 40 + (repoProgress.percentage * 0.3), {
                    stage: 'data_collection',
                    currentStep: 2,
                    totalSteps: 4,
                    repository: repoProgress.repository
                });
            });
            
            this.reportProgress('팀 통계를 계산하고 있습니다...', 70, {
                stage: 'statistics_calculation',
                currentStep: 3,
                totalSteps: 4
            });
            const teamSummary = this.analyzer.calculateTeamStats(teamStats);

            // 이전 달과 비교 (옵션)
            let comparison = null;
            if (this.config.analytics?.enablePeriodComparison) {
                this.reportProgress('이전 달 데이터와 비교하고 있습니다...', 80, {
                    stage: 'comparison',
                    currentStep: 3.5,
                    totalSteps: 4
                });
                const prevFirstDay = new Date(firstDayOfLastMonth);
                prevFirstDay.setMonth(prevFirstDay.getMonth() - 1);
                const prevLastDay = new Date(firstDayOfLastMonth);
                prevLastDay.setDate(0);
                
                comparison = await this.analyzer.calculatePeriodComparison(
                    teamStats,
                    prevFirstDay.toISOString().split('T')[0],
                    prevLastDay.toISOString().split('T')[0]
                );
            }

            // 메시지 렌더링
            this.reportProgress('리포트 메시지를 생성하고 있습니다...', 90, {
                stage: 'message_rendering',
                currentStep: 4,
                totalSteps: 4
            });
            const periodInfo = { startDate, endDate };
            const message = this.renderer.renderMonthlyReport(teamStats, teamSummary, periodInfo, comparison);

            // 리포트 매니저에 저장
            this.reportProgress('리포트를 저장하고 있습니다...', 95, { stage: 'saving' });
            const data = {
                teamStats,
                teamSummary,
                periodInfo,
                comparison
            };
            
            const saveResult = this.reportManager.savePreviewReport('monthly', message, {
                period: periodInfo,
                teamMemberCount: this.config.teamMembers.length,
                repositoryCount: this.config.repositories.length,
                totalCommits: teamSummary.totalCommits,
                totalPRs: teamSummary.totalPRs,
                totalReviews: teamSummary.totalReviews,
                hasComparison: !!comparison
            });

            this.reportProgress('월간 리포트 생성이 완료되었습니다!', 100, { stage: 'completed' });
            this.isGenerating = false;
            
            logger.info('Monthly GitHub report generated successfully');
            return {
                success: true,
                message: message,
                data: data,
                reportId: saveResult.reportId,
                cached: false
            };

        } catch (error) {
            this.isGenerating = false;
            this.reportProgress('리포트 생성 중 오류가 발생했습니다.', null, { stage: 'error' });
            logger.error(`Failed to generate monthly GitHub report: ${error.message}`, error);
            return {
                success: false,
                message: 'GitHub 월간 리포트 생성 중 오류가 발생했습니다.',
                error: error.message
            };
        }
    }

    /**
     * 월간 GitHub 리포트 생성 및 전송 (기존 메서드 유지)
     */
    async generateAndSendMonthlyReport() {
        const result = await this.generateMonthlyReport();
        return result;
    }

    /**
     * 활동 알림 체크 및 전송
     */
    async checkAndSendActivityAlerts() {
        try {
            if (!this.isEnabled || !this.config.reporting.alertThresholds.enableLowActivityAlerts) {
                return { success: false, message: 'Activity alerts are not enabled' };
            }

            logger.info('Checking GitHub activity alerts');

            // 최근 7일 데이터 분석
            const endDate = new Date().toISOString().split('T')[0];
            const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

            const teamStats = await this.analyzer.analyzeTeamContributions(startDate, endDate);
            const alertMessage = this.renderer.renderActivityAlert(teamStats, this.config.reporting.alertThresholds);

            if (alertMessage) {
                logger.info('Activity alert generated');
                return {
                    success: true,
                    message: alertMessage,
                    data: { teamStats, periodInfo: { startDate, endDate } }
                };
            } else {
                logger.info('No activity alerts needed');
                return { success: false, message: 'No alerts needed' };
            }

        } catch (error) {
            logger.error(`Failed to check activity alerts: ${error.message}`, error);
            return {
                success: false,
                message: 'GitHub 활동 알림 체크 중 오류가 발생했습니다.',
                error: error.message
            };
        }
    }

    /**
     * 커스텀 기간 리포트 생성
     */
    async generateCustomPeriodReport(startDate, endDate) {
        try {
            if (!this.isEnabled) {
                return { success: false, message: 'GitHub service is not enabled' };
            }

            logger.info(`Generating custom period report: ${startDate} to ${endDate}`);

            const teamStats = await this.analyzer.analyzeTeamContributions(startDate, endDate);
            const teamSummary = this.analyzer.calculateTeamStats(teamStats);

            const periodInfo = { startDate, endDate };
            const message = this.renderer.renderWeeklyReport(teamStats, teamSummary, periodInfo);

            return {
                success: true,
                message: message,
                data: { teamStats, teamSummary, periodInfo }
            };

        } catch (error) {
            logger.error(`Failed to generate custom period report: ${error.message}`, error);
            return {
                success: false,
                message: 'GitHub 커스텀 리포트 생성 중 오류가 발생했습니다.',
                error: error.message
            };
        }
    }

    /**
     * 개별 멤버 통계 조회
     */
    async getMemberStats(githubUsername, startDate, endDate) {
        try {
            if (!this.isEnabled) {
                return { success: false, message: 'GitHub service is not enabled' };
            }

            logger.info(`Getting member stats for ${githubUsername}: ${startDate} to ${endDate}`);

            const teamStats = await this.analyzer.analyzeTeamContributions(startDate, endDate);
            const memberStats = teamStats[githubUsername];

            if (!memberStats) {
                return { success: false, message: 'Member not found' };
            }

            return {
                success: true,
                data: memberStats
            };

        } catch (error) {
            logger.error(`Failed to get member stats: ${error.message}`, error);
            return {
                success: false,
                message: '멤버 통계 조회 중 오류가 발생했습니다.',
                error: error.message
            };
        }
    }

    /**
     * 설정 업데이트
     */
    updateConfiguration(newConfig) {
        try {
            this.config = { ...this.config, ...newConfig };
            this.saveConfiguration();
            
            // 서비스 재초기화
            this.loadConfiguration();
            
            logger.info('GitHub configuration updated successfully');
            return { success: true, message: 'Configuration updated successfully' };
            
        } catch (error) {
            logger.error(`Failed to update GitHub configuration: ${error.message}`, error);
            return { success: false, message: 'Failed to update configuration', error: error.message };
        }
    }

    /**
     * 서비스 상태 확인
     */
    getServiceStatus() {
        const storageStats = this.getStorageStats();
        
        return {
            isEnabled: this.isEnabled,
            isGenerating: this.isGenerating,
            currentReportId: this.currentReportId,
            config: this.config ? {
                repositoryCount: this.config.repositories?.length || 0,
                teamMemberCount: this.config.teamMembers?.length || 0,
                weeklyReportsEnabled: this.config.reporting?.weeklyReports?.enabled || false,
                monthlyReportsEnabled: this.config.reporting?.monthlyReports?.enabled || false,
                alertsEnabled: this.config.reporting?.alertThresholds?.enableLowActivityAlerts || false,
                periodComparisonEnabled: this.config.analytics?.enablePeriodComparison || false
            } : null,
            storage: storageStats,
            capabilities: {
                progressTracking: true,
                caching: true,
                archiving: true,
                reportHistory: true
            }
        };
    }

    /**
     * 진행도 추적 취소
     */
    cancelCurrentGeneration() {
        if (this.isGenerating) {
            this.isGenerating = false;
            this.reportProgress('리포트 생성이 취소되었습니다.', null, { stage: 'cancelled' });
            logger.info('GitHub report generation cancelled by user');
            return { success: true, message: '리포트 생성이 취소되었습니다.' };
        }
        return { success: false, message: '진행 중인 리포트 생성이 없습니다.' };
    }
}

module.exports = GitHubService;
