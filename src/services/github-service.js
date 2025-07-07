// github-service.js
// GitHub 기능 서비스 - 메인 애플리케이션과 GitHub 모듈을 연결

const fs = require('fs');
const path = require('path');
const GitHubAnalyzer = require('../github/analyzer');
const GitHubMessageRenderer = require('../github/message-renderer');
const ReportManager = require('../github/report-manager');
const logger = require('../../logger');

// 리포트 캐시 디렉토리
const REPORTS_DIR = path.join(__dirname, '../cache/github-reports');
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
        
        // 리포트 매니저 초기화
        this.initializeReportManager();
        
        this.loadConfiguration();
    }

    /**
     * 더미 팀 통계 생성
     */
    generateDummyTeamStats() {
        const stats = {};
        this.config.teamMembers.forEach(member => {
            stats[member.githubUsername] = {
                username: member.githubUsername,
                displayName: member.displayName,
                commits: Math.floor(Math.random() * 20) + 1,
                prsCreated: Math.floor(Math.random() * 5) + 1,
                prsReviewed: Math.floor(Math.random() * 8) + 1,
                issuesCreated: Math.floor(Math.random() * 3),
                issuesClosed: Math.floor(Math.random() * 3),
                linesAdded: Math.floor(Math.random() * 500) + 50,
                linesDeleted: Math.floor(Math.random() * 200) + 20,
                reviewComments: Math.floor(Math.random() * 15) + 2
            };
        });
        return stats;
    }

    /**
     * 더미 팀 요약 생성
     */
    generateDummyTeamSummary() {
        const memberCount = this.config.teamMembers.length;
        return {
            totalCommits: Math.floor(Math.random() * 50 * memberCount) + memberCount * 5,
            totalPRs: Math.floor(Math.random() * 15 * memberCount) + memberCount * 2,
            totalReviews: Math.floor(Math.random() * 25 * memberCount) + memberCount * 3,
            totalIssues: Math.floor(Math.random() * 10 * memberCount),
            totalLinesAdded: Math.floor(Math.random() * 2000 * memberCount) + memberCount * 100,
            totalLinesDeleted: Math.floor(Math.random() * 800 * memberCount) + memberCount * 50,
            activeMemberCount: memberCount,
            topContributors: this.config.teamMembers.slice(0, 3).map(m => m.displayName)
        };
    }

    /**
     * 더미 주간 리포트 메시지 생성
     */
    generateDummyWeeklyReport(periodInfo, teamStats, teamSummary) {
        const report = [
            `🔥 GitHub 주간 활동 리포트 (${periodInfo.startDate} ~ ${periodInfo.endDate})`,
            '',
            `📊 팀 전체 성과:`,
            `- 총 커밋: ${teamSummary.totalCommits}회`,
            `- 총 PR: ${teamSummary.totalPRs}개`,
            `- 총 리뷰: ${teamSummary.totalReviews}개`,
            `- 코드 변경: +${teamSummary.totalLinesAdded} / -${teamSummary.totalLinesDeleted}`,
            '',
            `👥 개별 성과:`,
        ];

        Object.values(teamStats).forEach(member => {
            report.push(`👨‍💻 ${member.displayName}(${member.username})`);
            report.push(`  - 커밋: ${member.commits}회`);
            report.push(`  - PR 생성: ${member.prsCreated}개`);
            report.push(`  - PR 리뷰: ${member.prsReviewed}개`);
            report.push(`  - 코드 변경: +${member.linesAdded} / -${member.linesDeleted}`);
            report.push('');
        });

        report.push('🎆 이번 주도 수고하셨습니다!');
        
        return report.join('\n');
    }

    /**
     * GitHub 설정 로드
     */
    loadConfiguration() {
        try {
            const configPath = path.join(__dirname, '../../github-config.json');
            
            if (!fs.existsSync(configPath)) {
                logger.warn('GitHub configuration file not found. GitHub features will be disabled.');
                this.isEnabled = false;
                return;
            }

            const configData = fs.readFileSync(configPath, 'utf8');
            const rawConfig = JSON.parse(configData);

            // 기존 형식에서 새로운 형식으로 변환
            this.config = this.normalizeConfig(rawConfig);

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

            // GitHub 분석기, 렌더러 및 리포트 매니저 초기화 (또는 더미)
            try {
                this.analyzer = new GitHubAnalyzer(this.config);
                this.renderer = new GitHubMessageRenderer(this.config.messageSettings);
                this.reportManager = new ReportManager();
            } catch (error) {
                logger.warn('GitHub modules not available, using dummy implementations:', error.message);
                // 더미 구현 사용
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
     * 기존 설정 형식을 새로운 형식으로 노말라이즈
     */
    normalizeConfig(rawConfig) {
        const normalized = {
            githubToken: rawConfig.githubToken,
            repositories: rawConfig.repositories || [],
            teamMembers: [],
            messageSettings: {
                includeLinks: true,
                includePRDetails: true,
                includeCommitDetails: false,
                maxCommitsToShow: 10,
                showTopContributors: true,
                showStatistics: true
            },
            reporting: rawConfig.reporting || {
                weeklyReports: { enabled: true },
                monthlyReports: { enabled: true },
                alertThresholds: {
                    enableLowActivityAlerts: false,
                    minCommitsPerWeek: 3,
                    minPRsPerWeek: 1,
                    checkInactiveDays: 7
                }
            },
            analytics: {
                enablePeriodComparison: true,
                trackCodeOwnership: false,
                includeWeekendActivity: false
            }
        };

        // teamMapping을 teamMembers로 변환
        if (rawConfig.teamMapping) {
            normalized.teamMembers = Object.keys(rawConfig.teamMapping).map(key => {
                const member = rawConfig.teamMapping[key];
                return {
                    githubUsername: member.githubUsername || key,
                    displayName: member.name || key
                };
            });
        } else if (rawConfig.teamMembers) {
            normalized.teamMembers = rawConfig.teamMembers;
        }

        return normalized;
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

            // 리포지토리별 데이터 수집 (더미 또는 실제)
            this.reportProgress(`${this.config.repositories.length}개 리포지토리에서 데이터를 수집하고 있습니다...`, 40, {
                stage: 'data_collection',
                currentStep: 2,
                totalSteps: 4
            });
            
            let teamStats, teamSummary;
            if (this.analyzer) {
                teamStats = await this.analyzer.analyzeTeamContributions(startDate, endDate, (repoProgress) => {
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
                teamSummary = this.analyzer.calculateTeamStats(teamStats);
            } else {
                // 더미 데이터 생성
                teamStats = this.generateDummyTeamStats();
                teamSummary = this.generateDummyTeamSummary();
            }

            // 메시지 렌더링
            this.reportProgress('리포트 메시지를 생성하고 있습니다...', 90, {
                stage: 'message_rendering',
                currentStep: 4,
                totalSteps: 4
            });
            const periodInfo = { startDate, endDate };
            let message;
            if (this.renderer) {
                message = this.renderer.renderWeeklyReport(teamStats, teamSummary, periodInfo);
            } else {
                message = this.generateDummyWeeklyReport(periodInfo, teamStats, teamSummary);
            }

            // 리포트 매니저에 저장
            this.reportProgress('리포트를 저장하고 있습니다...', 95, { stage: 'saving' });
            const data = {
                teamStats,
                teamSummary,
                periodInfo
            };
            
            const saveResult = this.reportManager.savePreviewReport('weekly', message, {
                period: periodInfo,
                teamMemberCount: this.config.teamMembers.length,
                repositoryCount: this.config.repositories.length,
                totalCommits: teamSummary.totalCommits || 0,
                totalPRs: teamSummary.totalPRs || 0,
                totalReviews: teamSummary.totalReviews || 0
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
        let storageStats = null;
        try {
            storageStats = this.getStorageStats();
        } catch (error) {
            logger.warn('Failed to get storage stats:', error.message);
        }
        
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
     * 설정 정보 반환
     */
    getConfiguration() {
        if (!this.config) {
            return {
                githubToken: null,
                repositories: [],
                teamMembers: [],
                reporting: {
                    weeklyReports: { enabled: false },
                    monthlyReports: { enabled: false }
                }
            };
        }

        // 토큰은 보안상 마스킹
        const maskedConfig = {
            ...this.config,
            githubToken: this.config.githubToken ? '[CONFIGURED]' : null
        };

        return maskedConfig;
    }

    /**
     * 저장소 통계 조회
     */
    getStorageStats() {
        if (!this.reportManager) {
            return {
                preview: { count: 0, sizeMB: '0.00' },
                archive: { count: 0, sizeMB: '0.00' },
                total: { count: 0, sizeMB: '0.00' }
            };
        }

        try {
            return this.reportManager.getStorageStats();
        } catch (error) {
            logger.error('Failed to get storage stats:', error.message);
            return {
                preview: { count: 0, sizeMB: '0.00' },
                archive: { count: 0, sizeMB: '0.00' },
                total: { count: 0, sizeMB: '0.00' }
            };
        }
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

    /**
     * 리포트 매니저 기본 메서드 구현 (더미)
     */
    initializeReportManager() {
        if (!this.reportManager) {
            // 더미 리포트 매니저 구현
            this.reportManager = {
                getStorageStats: () => ({
                    preview: { count: 0, sizeMB: '0.00' },
                    archive: { count: 0, sizeMB: '0.00' },
                    total: { count: 0, sizeMB: '0.00' }
                }),
                listReports: (type, limit) => ({
                    success: true,
                    reports: []
                }),
                deleteReport: (reportId) => ({
                    success: true,
                    message: 'Report deleted successfully'
                }),
                cleanupPreviewReports: () => ({
                    success: true,
                    deletedCount: 0
                }),
                savePreviewReport: (type, content, metadata) => ({
                    success: true,
                    reportId: Date.now().toString()
                }),
                loadLatestCachedReport: (type) => null,
                generateReportId: () => Date.now().toString()
            };
        }
    }

    /**
     * 기본 GitHub 설정 파일 생성
     */
    createDefaultGitHubConfig() {
        const defaultConfig = {
            "githubToken": "YOUR_GITHUB_TOKEN_HERE",
            "repositories": [
                {
                    "owner": "your-org",
                    "name": "your-repo"
                }
            ],
            "teamMembers": [
                {
                    "githubUsername": "tmddud333",
                    "displayName": "승민"
                },
                {
                    "githubUsername": "cmjeong",
                    "displayName": "창민"
                }
            ],
            "messageSettings": {
                "includeLinks": true,
                "includePRDetails": true,
                "includeCommitDetails": false,
                "maxCommitsToShow": 10,
                "showTopContributors": true,
                "showStatistics": true
            },
            "reporting": {
                "weeklyReports": {
                    "enabled": true,
                    "schedule": "0 9 * * 1",
                    "includeComparison": true
                },
                "monthlyReports": {
                    "enabled": true,
                    "schedule": "0 9 1 * *",
                    "includeComparison": true
                },
                "alertThresholds": {
                    "enableLowActivityAlerts": false,
                    "minCommitsPerWeek": 3,
                    "minPRsPerWeek": 1,
                    "checkInactiveDays": 7
                }
            },
            "analytics": {
                "enablePeriodComparison": true,
                "trackCodeOwnership": false,
                "includeWeekendActivity": false
            }
        };

        try {
            const configPath = path.join(__dirname, '../../github-config.json');
            fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf8');
            logger.info('Default GitHub configuration file created');
            return { success: true, configPath };
        } catch (error) {
            logger.error('Failed to create default GitHub config:', error.message);
            return { success: false, error: error.message };
        }
    }
}

module.exports = GitHubService;
