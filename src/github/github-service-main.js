// src/github/github-service-main.js
// GitHub 통합 서비스 - 메인 서비스 (리팩토링된 버전)

const fs = require('fs');
const path = require('path');
const logger = require('../../logger');
const BackgroundTaskManager = require('../services/background-task-manager');

// 분리된 서비스들
const GitHubApiClient = require('./github-api-client');
const TeamMappingService = require('./team-mapping-service');
const ReportGenerator = require('./report-generator');
const StorageManager = require('./storage-manager');
const StatsCollector = require('./stats-collector');

const GITHUB_CONFIG_FILE = path.join(__dirname, '../../github-config.json');

class GitHubServiceMain {
    constructor() {
        this.config = {};
        this.isEnabled = false;
        this.taskManager = new BackgroundTaskManager();
        this.backgroundTaskManager = this.taskManager;

        // 분리된 서비스들 초기화
        this.apiClient = new GitHubApiClient(this.config);
        this.teamMapper = new TeamMappingService();
        this.reportGenerator = new ReportGenerator();
        this.storageManager = new StorageManager();
        this.statsCollector = new StatsCollector(this.apiClient, this.teamMapper);

        this.loadConfiguration();

        // 주기적 작업 정리
        setInterval(() => {
            this.taskManager.cleanupOldTasks(24);
        }, 60 * 60 * 1000);
    }

    /**
     * 설정 로드
     */
    loadConfiguration() {
        try {
            if (fs.existsSync(GITHUB_CONFIG_FILE)) {
                const configData = fs.readFileSync(GITHUB_CONFIG_FILE, 'utf8');
                this.config = JSON.parse(configData);

                if (!this.config.githubToken && process.env.GITHUB_TOKEN) {
                    this.config.githubToken = process.env.GITHUB_TOKEN;
                }

                // config.json에서 팀원 정보 동기화
                this.syncTeamMembersWithMainConfig();

                // 팀원 매핑 캐시 초기화
                this.teamMapper.initializeMemberMappingCache(this.config.teamMapping);

                // API 클라이언트 설정 업데이트
                this.apiClient.config = this.config;

                this.isEnabled = this.validateConfig();

                if (this.isEnabled) {
                    logger.info('GitHub service enabled successfully');
                    logger.info(`Monitoring ${this.config.repositories?.length || 0} repositories`);
                    logger.info(`Team members: ${Object.keys(this.config.teamMapping || {}).length}`);
                } else {
                    logger.warn('GitHub service disabled (configuration validation failed)');
                }
            } else {
                logger.warn('GitHub configuration file not found');
                this.isEnabled = false;
            }
        } catch (error) {
            logger.error(`Error loading GitHub configuration: ${error.message}`, error);
            this.isEnabled = false;
        }
    }

    /**
     * config.json의 teamMembers와 github-config.json의 teamMapping을 동기화
     */
    syncTeamMembersWithMainConfig() {
        try {
            const mainConfigPath = path.join(__dirname, '../../config.json');
            if (!fs.existsSync(mainConfigPath)) {
                logger.warn('Main config.json not found, skipping team member sync');
                return;
            }

            const mainConfigData = fs.readFileSync(mainConfigPath, 'utf8');
            const mainConfig = JSON.parse(mainConfigData);

            if (!mainConfig.teamMembers || !Array.isArray(mainConfig.teamMembers)) {
                logger.warn('No teamMembers found in main config.json');
                return;
            }

            // 기존 teamMapping 백업
            const existingMapping = this.config.teamMapping || {};
            const newTeamMapping = {};

            mainConfig.teamMembers.forEach(member => {
                if (!member.id) return;

                // 기존 매핑 데이터가 있으면 유지, 없으면 새로 생성
                const existingMember = existingMapping[member.id];

                // GitHub 사용자명 결정 로직 개선
                let githubUsername = member.githubUsername;
                if (!githubUsername && existingMember?.githubUsername) {
                    githubUsername = existingMember.githubUsername;
                } else if (!githubUsername) {
                    githubUsername = member.id;
                }

                newTeamMapping[member.id] = {
                    memberId: member.id,
                    githubUsername: githubUsername,
                    name: member.name || existingMember?.name || member.id,
                    email: existingMember?.email || `${member.id}@danal.co.kr`,
                    isAuthorized: member.isAuthorized,
                    codeReviewCount: member.codeReviewCount || 0,
                    weeklyDutyCount: member.weeklyDutyCount || 0,
                    dailyDutyCount: member.dailyDutyCount || 0
                };

                logger.debug(`Team member mapping: ${member.id} -> ${githubUsername} (${member.name})`);
            });

            // teamMapping 업데이트
            this.config.teamMapping = newTeamMapping;

            // 변경사항이 있으면 저장
            if (JSON.stringify(existingMapping) !== JSON.stringify(newTeamMapping)) {
                this.saveConfiguration();
                logger.info(`Team member mapping synchronized: ${Object.keys(newTeamMapping).length} members`);
            }

        } catch (error) {
            logger.error(`Error syncing team members: ${error.message}`, error);
        }
    }

    /**
     * 설정 검증
     */
    validateConfig() {
        if (!this.config.enabled) return false;
        if (!this.config.githubToken || this.config.githubToken === 'YOUR_GITHUB_TOKEN_HERE') {
            logger.warn('GitHub token not configured');
            return false;
        }
        if (!this.config.repositories || this.config.repositories.length === 0) {
            logger.warn('No repositories configured');
            return false;
        }
        if (!this.config.teamMapping || Object.keys(this.config.teamMapping).length === 0) {
            logger.warn('No team members configured');
            return false;
        }
        return true;
    }

    /**
     * 설정 저장
     */
    saveConfiguration() {
        try {
            fs.writeFileSync(GITHUB_CONFIG_FILE, JSON.stringify(this.config, null, 2));
            logger.info('GitHub configuration saved successfully');
        } catch (error) {
            logger.error(`Failed to save GitHub configuration: ${error.message}`, error);
            throw error;
        }
    }

    /**
     * 주간 리포트 생성
     */
    async generateWeeklyReport() {
        try {
            if (!this.isEnabled) {
                return { success: false, message: 'GitHub service is not enabled' };
            }

            const taskId = this.taskManager.generateTaskId('github_weekly_report');

            if (this.taskManager.hasRunningTaskOfType('github_weekly_report')) {
                const runningTask = this.taskManager.getRunningTasks().find(t => t.type === 'github_weekly_report');
                return {
                    success: false,
                    message: '이미 주간 리포트를 생성 중입니다.',
                    taskId: runningTask.id
                };
            }

            const endDate = new Date();
            const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);

            const startStr = startDate.toISOString().split('T')[0];
            const endStr = endDate.toISOString().split('T')[0];

            const taskData = {
                startDate: startStr,
                endDate: endStr,
                reportType: 'weekly'
            };

            const taskFunction = async (updateProgress) => {
                updateProgress(0, '주간 리포트 생성을 시작합니다...', 'initializing');

                const stats = await this.statsCollector.collectTeamStats(
                    startStr, endStr, this.config.repositories, this.config.teamMapping, updateProgress
                );

                updateProgress(90, '리포트 메시지를 생성하고 있습니다...', 'message_generation');
                const message = this.reportGenerator.generateReportMessage(
                    stats, startStr, endStr, 'weekly', this.config.repositories
                );

                updateProgress(95, '리포트를 저장하고 있습니다...', 'saving');
                const saveResult = this.storageManager.savePreviewReport('weekly', message, {
                    period: { startDate: startStr, endDate: endStr },
                    teamMemberCount: Object.keys(this.config.teamMapping || {}).length,
                    repositoryCount: this.config.repositories?.length || 0
                });

                updateProgress(100, '주간 리포트 생성이 완료되었습니다!', 'completed');

                return {
                    message: message,
                    data: {
                        teamStats: stats,
                        periodInfo: { startDate: startStr, endDate: endStr }
                    },
                    reportId: saveResult.reportId
                };
            };

            this.taskManager.startTask(taskId, 'github_weekly_report', taskData, taskFunction);

            return {
                success: true,
                message: '주간 리포트 생성이 백그라운드에서 시작되었습니다.',
                taskId: taskId,
                isAsync: true
            };

        } catch (error) {
            logger.error(`Failed to start weekly GitHub report generation: ${error.message}`, error);
            return {
                success: false,
                message: 'GitHub 주간 리포트 생성을 시작할 수 없습니다.',
                error: error.message
            };
        }
    }

    /**
     * 월간 리포트 생성
     */
    async generateMonthlyReport() {
        try {
            if (!this.isEnabled) {
                return { success: false, message: 'GitHub service is not enabled' };
            }

            const taskId = this.taskManager.generateTaskId('github_monthly_report');

            if (this.taskManager.hasRunningTaskOfType('github_monthly_report')) {
                const runningTask = this.taskManager.getRunningTasks().find(t => t.type === 'github_monthly_report');
                return {
                    success: false,
                    message: '이미 월간 리포트를 생성 중입니다.',
                    taskId: runningTask.id
                };
            }

            const endDate = new Date();
            const startDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

            const startStr = startDate.toISOString().split('T')[0];
            const endStr = endDate.toISOString().split('T')[0];

            const taskData = {
                startDate: startStr,
                endDate: endStr,
                reportType: 'monthly'
            };

            const taskFunction = async (updateProgress) => {
                updateProgress(0, '월간 리포트 생성을 시작합니다...', 'initializing');

                const stats = await this.statsCollector.collectTeamStats(
                    startStr, endStr, this.config.repositories, this.config.teamMapping, updateProgress
                );

                updateProgress(90, '리포트 메시지를 생성하고 있습니다...', 'message_generation');
                const message = this.reportGenerator.generateReportMessage(
                    stats, startStr, endStr, 'monthly', this.config.repositories
                );

                updateProgress(95, '리포트를 저장하고 있습니다...', 'saving');
                const saveResult = this.storageManager.savePreviewReport('monthly', message, {
                    period: { startDate: startStr, endDate: endStr },
                    teamMemberCount: Object.keys(this.config.teamMapping || {}).length,
                    repositoryCount: this.config.repositories?.length || 0
                });

                updateProgress(100, '월간 리포트 생성이 완료되었습니다!', 'completed');

                return {
                    message: message,
                    data: {
                        teamStats: stats,
                        periodInfo: { startDate: startStr, endDate: endStr }
                    },
                    reportId: saveResult.reportId
                };
            };

            this.taskManager.startTask(taskId, 'github_monthly_report', taskData, taskFunction);

            return {
                success: true,
                message: '월간 리포트 생성이 백그라운드에서 시작되었습니다.',
                taskId: taskId,
                isAsync: true
            };

        } catch (error) {
            logger.error(`Failed to start monthly GitHub report generation: ${error.message}`, error);
            return {
                success: false,
                message: 'GitHub 월간 리포트 생성을 시작할 수 없습니다.',
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

            const stats = await this.statsCollector.collectTeamStats(
                startDate, endDate, this.config.repositories, this.config.teamMapping, 
                (progress, message) => {
                    logger.debug(`Custom report progress: ${progress}% - ${message}`);
                }
            );

            const message = this.reportGenerator.generateReportMessage(
                stats, startDate, endDate, 'custom', this.config.repositories
            );

            const saveResult = this.storageManager.savePreviewReport('custom', message, {
                period: { startDate, endDate },
                teamMemberCount: Object.keys(this.config.teamMapping || {}).length,
                repositoryCount: this.config.repositories?.length || 0
            });

            return {
                success: true,
                message: message,
                data: {
                    teamStats: stats,
                    periodInfo: { startDate, endDate }
                },
                reportId: saveResult.reportId
            };

        } catch (error) {
            logger.error(`Error generating custom period report: ${error.message}`, error);
            return {
                success: false,
                message: `커스텀 리포트 생성 중 오류가 발생했습니다: ${error.message}`
            };
        }
    }

    /**
     * 팀원 개별 통계 조회
     */
    async getMemberStats(githubUsername, startDate, endDate) {
        try {
            if (!this.isEnabled) {
                return { success: false, message: 'GitHub service is not enabled' };
            }

            return await this.statsCollector.getMemberStats(
                githubUsername, startDate, endDate, this.config.repositories, this.config.teamMapping
            );

        } catch (error) {
            logger.error(`Error getting member stats for ${githubUsername}: ${error.message}`, error);
            return {
                success: false,
                message: `팀원 통계 조회 중 오류가 발생했습니다: ${error.message}`
            };
        }
    }

    /**
     * 활동 부족 알림 체크
     */
    async checkAndSendActivityAlerts() {
        try {
            if (!this.isEnabled) {
                return { success: false, message: 'GitHub service is not enabled' };
            }

            if (!this.config.reporting?.alertThresholds?.enableLowActivityAlerts) {
                return { success: false, message: '활동 알림이 비활성화되어 있습니다.' };
            }

            const endDate = new Date();
            const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);

            const startStr = startDate.toISOString().split('T')[0];
            const endStr = endDate.toISOString().split('T')[0];

            const stats = await this.statsCollector.collectTeamStats(
                startStr, endStr, this.config.repositories, this.config.teamMapping,
                (progress, message) => {
                    logger.debug(`Activity alert check progress: ${progress}% - ${message}`);
                }
            );

            const threshold = this.config.reporting.alertThresholds.minimumWeeklyActivity || 1;
            const lowActivityMembers = this.statsCollector.findLowActivityMembers(stats, threshold);

            if (lowActivityMembers.length === 0) {
                return { success: false, message: '활동 부족 알림이 필요한 팀원이 없습니다.' };
            }

            const alertMessage = this.reportGenerator.generateLowActivityAlert(
                lowActivityMembers, startStr, endStr, threshold
            );

            return {
                success: true,
                message: alertMessage,
                data: {
                    period: { startDate: startStr, endDate: endStr },
                    lowActivityMembers: lowActivityMembers,
                    threshold: threshold
                }
            };

        } catch (error) {
            logger.error(`Error checking activity alerts: ${error.message}`, error);
            return {
                success: false,
                message: `활동 알림 체크 중 오류가 발생했습니다: ${error.message}`
            };
        }
    }

    // === 위임 메서드들 ===

    /**
     * 리포트 히스토리 조회
     */
    getReportHistory(type, limit) {
        return this.storageManager.getReportHistory(type, limit);
    }

    /**
     * 리포트 삭제
     */
    deleteReport(reportId) {
        return this.storageManager.deleteReport(reportId);
    }

    /**
     * 리포트 내용 조회
     */
    getReportContent(reportId) {
        return this.storageManager.getReportContent(reportId);
    }

    /**
     * 리포트 발송 및 아카이브
     */
    sendAndArchiveReport(message, type, metadata) {
        return this.storageManager.sendAndArchiveReport(message, type, metadata);
    }

    /**
     * 오늘의 최근 리포트 조회
     */
    getLatestTodayReport() {
        return this.storageManager.getLatestTodayReport();
    }

    /**
     * 저장소 통계 조회
     */
    getStorageStats() {
        return this.storageManager.getStorageStats();
    }

    /**
     * 캐시 정리
     */
    clearCache() {
        const storageResult = this.storageManager.clearCache();
        const cleanedTasks = this.taskManager.cleanupOldTasks(1);
        
        return {
            ...storageResult,
            cleanedTasks,
            message: `${storageResult.message}, ${cleanedTasks}개 작업 정리`
        };
    }

    /**
     * 팀원 매핑 캐시 상태 조회
     */
    getMappingCacheStatus() {
        return this.teamMapper.getMappingCacheStatus();
    }

    /**
     * 팀원 매핑 캐시 새로고침
     */
    refreshMappingCache() {
        const result = this.teamMapper.refreshMappingCache();
        // 새로고침 후 다시 초기화
        this.teamMapper.initializeMemberMappingCache(this.config.teamMapping);
        return result;
    }

    /**
     * 매핑 성능 테스트
     */
    testMappingPerformance() {
        return this.teamMapper.testMappingPerformance();
    }

    // === 작업 관리 메서드들 ===

    getTaskStatus(taskId) {
        return this.taskManager.getTaskStatus(taskId);
    }

    cancelTask(taskId) {
        return this.taskManager.cancelTask(taskId);
    }

    getRunningTasks() {
        return this.taskManager.getRunningTasks();
    }

    getTaskStats() {
        return this.taskManager.getTaskStats();
    }

    cancelCurrentGeneration() {
        try {
            const runningTasks = this.taskManager.getRunningTasks();
            const githubTasks = runningTasks.filter(task => 
                task.type.startsWith('github_')
            );

            if (githubTasks.length === 0) {
                return {
                    success: false,
                    message: '현재 실행 중인 GitHub 작업이 없습니다.'
                };
            }

            let cancelledCount = 0;
            githubTasks.forEach(task => {
                if (this.taskManager.cancelTask(task.id)) {
                    cancelledCount++;
                }
            });

            return {
                success: true,
                message: `${cancelledCount}개의 GitHub 작업이 취소되었습니다.`,
                cancelledTasks: githubTasks.map(task => task.id)
            };

        } catch (error) {
            logger.error(`Error cancelling current generation: ${error.message}`, error);
            return {
                success: false,
                message: `작업 취소 중 오류가 발생했습니다: ${error.message}`
            };
        }
    }

    /**
     * 서비스 상태 조회
     */
    getServiceStatus() {
        const storageStats = this.getStorageStats();
        const taskStats = this.getTaskStats();

        return {
            isEnabled: this.isEnabled,
            tasks: {
                running: taskStats.running,
                completed: taskStats.completed,
                failed: taskStats.failed,
                total: taskStats.total,
                byType: taskStats.byType
            },
            config: this.config ? {
                repositoryCount: this.config.repositories?.length || 0,
                teamMemberCount: Object.keys(this.config.teamMapping || {}).length,
                weeklyReportsEnabled: this.config.reporting?.weeklyReports?.enabled || false,
                monthlyReportsEnabled: this.config.reporting?.monthlyReports?.enabled || false,
                alertsEnabled: this.config.reporting?.alertThresholds?.enableLowActivityAlerts || false,
                periodComparisonEnabled: this.config.analytics?.enablePeriodComparison || false
            } : null,
            storage: storageStats,
            capabilities: {
                backgroundTasks: true,
                progressTracking: true,
                caching: true,
                archiving: true,
                reportHistory: true,
                taskCancellation: true,
                enhancedReporting: true,
                visualBarCharts: true,
                comprehensiveMetrics: true,
                improvedMemberMapping: true,
                fuzzyMatching: true,
                patternMatching: true,
                mappingDiagnostics: true
            }
        };
    }

    /**
     * 설정 업데이트
     */
    updateConfiguration(newConfig) {
        try {
            this.config = { ...this.config, ...newConfig };
            this.saveConfiguration();
            this.loadConfiguration();

            logger.info('GitHub configuration updated successfully');
            return { success: true, message: 'Configuration updated successfully' };

        } catch (error) {
            logger.error(`Failed to update GitHub configuration: ${error.message}`, error);
            return { success: false, message: 'Failed to update configuration', error: error.message };
        }
    }

    /**
     * 매핑 진단 도구
     */
    async diagnoseMemberMapping() {
        try {
            if (!this.isEnabled) {
                return { success: false, message: 'GitHub service is not enabled' };
            }

            const endDate = new Date();
            const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

            const since = startDate.toISOString();
            const until = endDate.toISOString();

            const diagnosis = {
                configuredMembers: Object.keys(this.config.teamMapping || {}).length,
                mappingCacheSize: this.teamMapper.memberMappingCache.size,
                reverseMappingCacheSize: this.teamMapper.reverseMappingCache.size,
                repositories: [],
                foundUsers: new Set(),
                mappingResults: new Map(),
                mappingMethodStats: {
                    exact: 0,
                    fuzzy: 0,
                    pattern: 0,
                    failed: 0
                },
                recommendations: []
            };

            // 각 리포지토리에서 사용자 활동 수집
            for (const repo of this.config.repositories || []) {
                if (!repo.enabled) continue;

                const repoData = {
                    name: repo.name,
                    owner: repo.owner,
                    users: new Set(),
                    activities: []
                };

                try {
                    const commits = await this.apiClient.getRepositoryCommits(repo.owner, repo.name, since, until);
                    commits.forEach(commit => {
                        repoData.users.add(commit.author);
                        diagnosis.foundUsers.add(commit.author);

                        const member = this.teamMapper.findTeamMember(commit.author, commit.authorName, commit.authorEmail);
                        const key = `${commit.author}|${commit.authorName}|${commit.authorEmail}`;

                        if (!diagnosis.mappingResults.has(key)) {
                            diagnosis.mappingResults.set(key, {
                                githubUsername: commit.author,
                                authorName: commit.authorName,
                                authorEmail: commit.authorEmail,
                                mapped: !!member,
                                mappedTo: member ? member.name : null,
                                mappedMethod: member ? this.teamMapper.determineMappingMethod(commit.author, commit.authorName, commit.authorEmail) : null,
                                activities: []
                            });
                        }

                        const result = diagnosis.mappingResults.get(key);
                        result.activities.push({
                            type: 'commit',
                            repository: repo.name,
                            identifier: commit.sha.substring(0, 7)
                        });

                        // 매핑 방법 통계 업데이트
                        if (member) {
                            const method = this.teamMapper.determineMappingMethod(commit.author, commit.authorName, commit.authorEmail);
                            diagnosis.mappingMethodStats[method]++;
                        } else {
                            diagnosis.mappingMethodStats.failed++;
                        }
                    });

                    const prs = await this.apiClient.getRepositoryPullRequests(repo.owner, repo.name, since, until);
                    prs.forEach(pr => {
                        repoData.users.add(pr.author);
                        diagnosis.foundUsers.add(pr.author);

                        const member = this.teamMapper.findTeamMember(pr.author, null, null);
                        const key = `${pr.author}||`;

                        if (!diagnosis.mappingResults.has(key)) {
                            diagnosis.mappingResults.set(key, {
                                githubUsername: pr.author,
                                authorName: null,
                                authorEmail: null,
                                mapped: !!member,
                                mappedTo: member ? member.name : null,
                                mappedMethod: member ? this.teamMapper.determineMappingMethod(pr.author, null, null) : null,
                                activities: []
                            });
                        }

                        diagnosis.mappingResults.get(key).activities.push({
                            type: 'pull_request',
                            repository: repo.name,
                            identifier: `#${pr.number}`
                        });
                    });

                } catch (error) {
                    logger.error(`Error diagnosing ${repo.name}: ${error.message}`);
                }

                repoData.users = Array.from(repoData.users);
                diagnosis.repositories.push(repoData);
            }

            // 매핑 결과 분석
            const mappingArray = Array.from(diagnosis.mappingResults.values());
            const successfulMappings = mappingArray.filter(m => m.mapped);
            const failedMappings = mappingArray.filter(m => !m.mapped);

            diagnosis.summary = {
                totalUsers: diagnosis.foundUsers.size,
                successfulMappings: successfulMappings.length,
                failedMappings: failedMappings.length,
                mappingSuccessRate: diagnosis.foundUsers.size > 0 ?
                    Math.round((successfulMappings.length / diagnosis.foundUsers.size) * 100) : 0
            };

            // 추천 사항 생성
            if (failedMappings.length > 0) {
                const suggestions = failedMappings.map(m => {
                    const suggestion = {
                        githubUsername: m.githubUsername,
                        authorName: m.authorName,
                        authorEmail: m.authorEmail,
                        activityCount: m.activities.length,
                        suggestedMappings: []
                    };

                    // 자동 매핑 제안
                    if (m.authorEmail && m.authorEmail.includes('@')) {
                        const emailUser = m.authorEmail.split('@')[0];
                        suggestion.suggestedMappings.push({
                            type: 'email_username',
                            value: emailUser,
                            reason: '이메일 사용자명 기반'
                        });
                    }

                    if (m.githubUsername) {
                        // 숫자 제거 제안
                        const withoutNumbers = m.githubUsername.replace(/\d+$/, '');
                        if (withoutNumbers !== m.githubUsername) {
                            suggestion.suggestedMappings.push({
                                type: 'remove_numbers',
                                value: withoutNumbers,
                                reason: '숫자 제거 패턴'
                            });
                        }

                        // 접두사 제거 제안
                        const prefixes = ['danal-', 'dev-', 'user-'];
                        for (const prefix of prefixes) {
                            if (m.githubUsername.toLowerCase().startsWith(prefix)) {
                                suggestion.suggestedMappings.push({
                                    type: 'remove_prefix',
                                    value: m.githubUsername.substring(prefix.length),
                                    reason: `접두사 '${prefix}' 제거`
                                });
                            }
                        }
                    }

                    return suggestion;
                });

                diagnosis.recommendations.push({
                    type: 'missing_users',
                    message: `${failedMappings.length}명의 사용자가 팀 매핑에서 누락되었습니다.`,
                    suggestions: suggestions
                });
            }

            logger.info(`개선된 팀원 매핑 진단 완료:`);
            logger.info(`- 총 사용자: ${diagnosis.foundUsers.size}`);
            logger.info(`- 성공 매핑: ${successfulMappings.length}`);
            logger.info(`- 실패 매핑: ${failedMappings.length}`);
            logger.info(`- 성공률: ${diagnosis.summary.mappingSuccessRate}%`);

            return {
                success: true,
                diagnosis: diagnosis
            };

        } catch (error) {
            logger.error(`Error diagnosing member mapping: ${error.message}`, error);
            return {
                success: false,
                message: `매핑 진단 중 오류가 발생했습니다: ${error.message}`
            };
        }
    }
}

module.exports = GitHubServiceMain;