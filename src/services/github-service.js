// src/services/github-service.js
// GitHub 통합 서비스 - 백그라운드 작업 관리자 통합 버전

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const logger = require('../../logger');
const BackgroundTaskManager = require('./background-task-manager');

const GITHUB_CONFIG_FILE = path.join(__dirname, '../../github-config.json');
const CACHE_DIR = path.join(__dirname, '../../cache');
const GITHUB_REPORTS_DIR = path.join(CACHE_DIR, 'github-reports');
const ARCHIVE_DIR = path.join(GITHUB_REPORTS_DIR, 'archive');

class GitHubService {
    constructor() {
        this.config = {};
        this.isEnabled = false;
        this.taskManager = new BackgroundTaskManager();
        
        this.ensureCacheDirectories();
        this.loadConfiguration();
        
        // 주기적으로 오래된 작업 정리
        setInterval(() => {
            this.taskManager.cleanupOldTasks(24); // 24시간 이상 된 작업 정리
        }, 60 * 60 * 1000); // 1시간마다 실행
    }

    /**
     * 캐시 디렉토리들 생성
     */
    ensureCacheDirectories() {
        try {
            [CACHE_DIR, GITHUB_REPORTS_DIR, ARCHIVE_DIR].forEach(dir => {
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                    logger.info(`Created directory: ${dir}`);
                }
            });
        } catch (error) {
            logger.error(`Error creating cache directories: ${error.message}`, error);
        }
    }

    /**
     * GitHub 설정 로드
     */
    loadConfiguration() {
        try {
            if (fs.existsSync(GITHUB_CONFIG_FILE)) {
                const configData = fs.readFileSync(GITHUB_CONFIG_FILE, 'utf8');
                this.config = JSON.parse(configData);
                
                // 토큰이 비어있으면 환경변수에서 로드
                if (!this.config.githubToken && process.env.GITHUB_TOKEN) {
                    this.config.githubToken = process.env.GITHUB_TOKEN;
                }
                
                // 설정 검증
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
     * 설정 유효성 검사
     */
    validateConfig() {
        if (!this.config.enabled) {
            return false;
        }

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
     * GitHub API 호출
     */
    async makeGitHubApiCall(endpoint, method = 'GET', body = null) {
        if (!this.isEnabled) {
            throw new Error('GitHub service is not enabled');
        }

        const url = `https://api.github.com${endpoint}`;
        const options = {
            method,
            headers: {
                'Authorization': `token ${this.config.githubToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'Naverworks-Message-Cron-Server'
            }
        };

        if (body) {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(body);
        }

        try {
            const response = await fetch(url, options);
            
            if (!response.ok) {
                throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            logger.error(`GitHub API call failed: ${error.message}`, error);
            throw error;
        }
    }

    /**
     * 리포지토리 커밋 정보 조회
     */
    async getRepositoryCommits(owner, repo, since, until) {
        try {
            const endpoint = `/repos/${owner}/${repo}/commits`;
            let url = endpoint + '?per_page=100';
            
            if (since) url += `&since=${since}`;
            if (until) url += `&until=${until}`;

            const commits = await this.makeGitHubApiCall(url);
            
            // 각 커밋의 상세 정보 조회 (stats 포함)
            const detailedCommits = [];
            for (const commit of commits.slice(0, 50)) { // API 제한으로 최대 50개만 상세 조회
                try {
                    const detailedCommit = await this.makeGitHubApiCall(`/repos/${owner}/${repo}/commits/${commit.sha}`);
                    detailedCommits.push({
                        sha: commit.sha,
                        author: commit.author?.login || 'unknown',
                        authorName: commit.commit.author.name,
                        authorEmail: commit.commit.author.email,
                        message: commit.commit.message,
                        date: commit.commit.author.date,
                        additions: detailedCommit.stats?.additions || 0,
                        deletions: detailedCommit.stats?.deletions || 0,
                        total: detailedCommit.stats?.total || 0
                    });
                    
                    // API 호출 제한 방지를 위한 딜레이
                    await new Promise(resolve => setTimeout(resolve, 200));
                } catch (error) {
                    logger.warn(`Error fetching detailed commit ${commit.sha}: ${error.message}`);
                    // 상세 정보 조회 실패 시 기본 정보만 사용
                    detailedCommits.push({
                        sha: commit.sha,
                        author: commit.author?.login || 'unknown',
                        authorName: commit.commit.author.name,
                        authorEmail: commit.commit.author.email,
                        message: commit.commit.message,
                        date: commit.commit.author.date,
                        additions: 0,
                        deletions: 0,
                        total: 0
                    });
                }
            }
            
            return detailedCommits;
        } catch (error) {
            logger.error(`Error fetching commits for ${owner}/${repo}: ${error.message}`, error);
            return [];
        }
    }

    /**
     * 리포지토리 Pull Request 정보 조회
     */
    async getRepositoryPullRequests(owner, repo, since, until) {
        try {
            const endpoint = `/repos/${owner}/${repo}/pulls`;
            const url = endpoint + '?state=all&per_page=100&sort=updated&direction=desc';

            const pullRequests = await this.makeGitHubApiCall(url);
            
            // 날짜 범위 필터링
            const filteredPRs = pullRequests.filter(pr => {
                const createdDate = new Date(pr.created_at);
                const sinceDate = since ? new Date(since) : new Date(0);
                const untilDate = until ? new Date(until) : new Date();
                
                return createdDate >= sinceDate && createdDate <= untilDate;
            });

            // 각 PR의 상세 정보 조회
            const detailedPRs = [];
            for (const pr of filteredPRs.slice(0, 50)) {
                try {
                    const detailedPR = await this.makeGitHubApiCall(`/repos/${owner}/${repo}/pulls/${pr.number}`);
                    detailedPRs.push({
                        number: pr.number,
                        title: pr.title,
                        author: pr.user.login,
                        state: pr.state,
                        createdAt: pr.created_at,
                        closedAt: pr.closed_at,
                        mergedAt: pr.merged_at,
                        additions: detailedPR.additions || 0,
                        deletions: detailedPR.deletions || 0,
                        changedFiles: detailedPR.changed_files || 0
                    });
                    
                    await new Promise(resolve => setTimeout(resolve, 200));
                } catch (error) {
                    logger.warn(`Error fetching detailed PR ${pr.number}: ${error.message}`);
                    detailedPRs.push({
                        number: pr.number,
                        title: pr.title,
                        author: pr.user.login,
                        state: pr.state,
                        createdAt: pr.created_at,
                        closedAt: pr.closed_at,
                        mergedAt: pr.merged_at,
                        additions: 0,
                        deletions: 0,
                        changedFiles: 0
                    });
                }
            }
            
            return detailedPRs;
        } catch (error) {
            logger.error(`Error fetching pull requests for ${owner}/${repo}: ${error.message}`, error);
            return [];
        }
    }

    /**
     * 팀원별 활동 통계 수집 (백그라운드 작업 함수)
     */
    async collectTeamStatsTask(startDate, endDate, updateProgress) {
        const since = new Date(startDate).toISOString();
        const until = new Date(endDate).toISOString();
        
        const teamStats = {};
        
        // 팀 매핑 정보로 초기화
        Object.keys(this.config.teamMapping || {}).forEach(memberId => {
            const member = this.config.teamMapping[memberId];
            teamStats[memberId] = {
                githubUsername: member.githubUsername,
                name: member.name,
                email: member.email,
                commits: 0,
                pullRequests: 0,
                linesAdded: 0,
                linesDeleted: 0,
                repositories: new Set()
            };
        });

        updateProgress(10, '리포지토리 목록을 확인하고 있습니다...', 'initialization');

        const repositories = this.config.repositories || [];
        const totalRepos = repositories.filter(repo => repo.enabled).length;
        
        if (totalRepos === 0) {
            throw new Error('활성화된 리포지토리가 없습니다.');
        }

        // 각 리포지토리에서 데이터 수집
        let processedRepos = 0;
        for (const repo of repositories) {
            if (!repo.enabled) continue;

            const repoProgress = Math.round(20 + (processedRepos / totalRepos) * 60);
            updateProgress(repoProgress, `리포지토리 ${repo.name} 분석 중...`, 'data_collection', {
                repository: repo.name,
                currentStep: processedRepos + 1,
                totalSteps: totalRepos
            });

            try {
                // 커밋 정보 수집
                updateProgress(repoProgress, `${repo.name}: 커밋 정보 수집 중...`, 'commits_collection', {
                    repository: repo.name
                });
                
                const commits = await this.getRepositoryCommits(repo.owner, repo.name, since, until);
                
                commits.forEach(commit => {
                    const member = Object.values(this.config.teamMapping || {}).find(m => 
                        m.githubUsername === commit.author || 
                        m.email === commit.authorEmail
                    );
                    
                    if (member) {
                        const memberId = Object.keys(this.config.teamMapping || {}).find(id => 
                            this.config.teamMapping[id] === member
                        );
                        
                        if (memberId && teamStats[memberId]) {
                            teamStats[memberId].commits++;
                            teamStats[memberId].linesAdded += commit.additions;
                            teamStats[memberId].linesDeleted += commit.deletions;
                            teamStats[memberId].repositories.add(repo.name);
                        }
                    }
                });

                // PR 정보 수집
                updateProgress(repoProgress + 5, `${repo.name}: PR 정보 수집 중...`, 'pulls_collection', {
                    repository: repo.name
                });
                
                const pullRequests = await this.getRepositoryPullRequests(repo.owner, repo.name, since, until);
                
                pullRequests.forEach(pr => {
                    const member = Object.values(this.config.teamMapping || {}).find(m => 
                        m.githubUsername === pr.author
                    );
                    
                    if (member) {
                        const memberId = Object.keys(this.config.teamMapping || {}).find(id => 
                            this.config.teamMapping[id] === member
                        );
                        
                        if (memberId && teamStats[memberId]) {
                            teamStats[memberId].pullRequests++;
                            teamStats[memberId].linesAdded += pr.additions;
                            teamStats[memberId].linesDeleted += pr.deletions;
                            teamStats[memberId].repositories.add(repo.name);
                        }
                    }
                });
                
                processedRepos++;
                
                // API 호출 제한 방지를 위한 딜레이
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (error) {
                logger.error(`Error collecting stats from ${repo.owner}/${repo.name}: ${error.message}`, error);
            }
        }

        updateProgress(85, '통계 데이터를 처리하고 있습니다...', 'processing');

        // Set을 Array로 변환
        Object.keys(teamStats).forEach(memberId => {
            teamStats[memberId].repositories = Array.from(teamStats[memberId].repositories);
        });

        updateProgress(95, '리포트 메시지를 생성하고 있습니다...', 'message_generation');

        return teamStats;
    }

    /**
     * 기본 리포트 메시지 생성
     */
    generateReportMessage(stats, startDate, endDate, type = 'weekly') {
        const typeEmoji = type === 'weekly' ? '🔥' : '📈';
        const typeName = type === 'weekly' ? '주간' : '월간';
        
        let message = `${typeEmoji} 이번 ${typeName} 개발 활동 리포트 (${startDate} ~ ${endDate}) ${typeEmoji}\n\n`;
        
        // 활동이 있는 팀원만 필터링
        const activeMembers = Object.entries(stats)
            .filter(([_, data]) => data.commits > 0 || data.pullRequests > 0)
            .sort((a, b) => b[1].commits - a[1].commits);

        if (activeMembers.length === 0) {
            message += `📝 이번 ${typeName} 활동 내역이 없습니다.\n`;
        } else {
            activeMembers.forEach(([memberId, data]) => {
                message += `👩‍💻 ${data.name} (${data.githubUsername})\n`;
                message += `  - 커밋: ${data.commits}회\n`;
                message += `  - PR: ${data.pullRequests}건\n`;
                message += `  - 코드 변경: +${data.linesAdded} / -${data.linesDeleted}\n`;
                message += `  - 활동 리포지토리: ${data.repositories.join(', ')}\n\n`;
            });
            
            // 전체 통계
            const totalCommits = activeMembers.reduce((sum, [_, data]) => sum + data.commits, 0);
            const totalPRs = activeMembers.reduce((sum, [_, data]) => sum + data.pullRequests, 0);
            const totalAdded = activeMembers.reduce((sum, [_, data]) => sum + data.linesAdded, 0);
            const totalDeleted = activeMembers.reduce((sum, [_, data]) => sum + data.linesDeleted, 0);
            
            message += `📊 전체 팀 활동 요약:\n`;
            message += `  - 총 커밋: ${totalCommits}회\n`;
            message += `  - 총 PR: ${totalPRs}건\n`;
            message += `  - 총 코드 변경: +${totalAdded} / -${totalDeleted}\n`;
        }
        
        if (this.config.repositories) {
            message += `\n💡 GitHub 리포지토리:\n`;
            this.config.repositories.forEach(repo => {
                if (repo.enabled) {
                    message += `  - ${repo.name}: ${repo.url || `https://github.com/${repo.owner}/${repo.name}`}\n`;
                }
            });
        }
        
        return message;
    }

    /**
     * 리포트 미리보기 저장
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
            const filePath = path.join(GITHUB_REPORTS_DIR, fileName);
            
            fs.writeFileSync(filePath, JSON.stringify(reportData, null, 2));
            logger.info(`Report saved: ${fileName}`);
            
            return { success: true, reportId, filePath };
        } catch (error) {
            logger.error(`Error saving preview report: ${error.message}`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 주간 리포트 생성 (백그라운드 작업)
     */
    async generateWeeklyReport() {
        try {
            if (!this.isEnabled) {
                return { success: false, message: 'GitHub service is not enabled' };
            }

            const taskId = this.taskManager.generateTaskId('github_weekly_report');
            
            // 이미 실행 중인 주간 리포트 작업이 있는지 확인
            if (this.taskManager.hasRunningTaskOfType('github_weekly_report')) {
                const runningTask = this.taskManager.getRunningTasks().find(t => t.type === 'github_weekly_report');
                return { 
                    success: false, 
                    message: '이미 주간 리포트를 생성 중입니다.',
                    taskId: runningTask.id
                };
            }

            // 주간 기간 계산
            const endDate = new Date();
            const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
            
            const startStr = startDate.toISOString().split('T')[0];
            const endStr = endDate.toISOString().split('T')[0];

            const taskData = {
                startDate: startStr,
                endDate: endStr,
                reportType: 'weekly'
            };

            // 백그라운드 작업으로 실행
            const taskFunction = async (updateProgress) => {
                updateProgress(0, '주간 리포트 생성을 시작합니다...', 'initializing');
                
                const stats = await this.collectTeamStatsTask(startStr, endStr, updateProgress);
                
                updateProgress(90, '리포트 메시지를 생성하고 있습니다...', 'message_generation');
                const message = this.generateReportMessage(stats, startStr, endStr, 'weekly');

                updateProgress(95, '리포트를 저장하고 있습니다...', 'saving');
                const saveResult = this.savePreviewReport('weekly', message, {
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

            // 백그라운드 작업 시작
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
     * 월간 리포트 생성 (백그라운드 작업)
     */
    async generateMonthlyReport() {
        try {
            if (!this.isEnabled) {
                return { success: false, message: 'GitHub service is not enabled' };
            }

            const taskId = this.taskManager.generateTaskId('github_monthly_report');
            
            // 이미 실행 중인 월간 리포트 작업이 있는지 확인
            if (this.taskManager.hasRunningTaskOfType('github_monthly_report')) {
                const runningTask = this.taskManager.getRunningTasks().find(t => t.type === 'github_monthly_report');
                return { 
                    success: false, 
                    message: '이미 월간 리포트를 생성 중입니다.',
                    taskId: runningTask.id
                };
            }

            // 월간 기간 계산
            const endDate = new Date();
            const startDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
            
            const startStr = startDate.toISOString().split('T')[0];
            const endStr = endDate.toISOString().split('T')[0];

            const taskData = {
                startDate: startStr,
                endDate: endStr,
                reportType: 'monthly'
            };

            // 백그라운드 작업으로 실행
            const taskFunction = async (updateProgress) => {
                updateProgress(0, '월간 리포트 생성을 시작합니다...', 'initializing');
                
                const stats = await this.collectTeamStatsTask(startStr, endStr, updateProgress);
                
                updateProgress(90, '리포트 메시지를 생성하고 있습니다...', 'message_generation');
                const message = this.generateReportMessage(stats, startStr, endStr, 'monthly');

                updateProgress(95, '리포트를 저장하고 있습니다...', 'saving');
                const saveResult = this.savePreviewReport('monthly', message, {
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

            // 백그라운드 작업 시작
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
     * 작업 상태 조회
     */
    getTaskStatus(taskId) {
        return this.taskManager.getTaskStatus(taskId);
    }

    /**
     * 작업 취소
     */
    cancelTask(taskId) {
        return this.taskManager.cancelTask(taskId);
    }

    /**
     * 실행 중인 작업 조회
     */
    getRunningTasks() {
        return this.taskManager.getRunningTasks();
    }

    /**
     * 작업 통계 조회
     */
    getTaskStats() {
        return this.taskManager.getTaskStats();
    }

    /**
     * 리포트 ID 생성
     */
    generateReportId() {
        return `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * 서비스 상태 확인
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
                taskCancellation: true
            }
        };
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
            
            // 미리보기 디렉토리 통계
            if (fs.existsSync(GITHUB_REPORTS_DIR)) {
                const files = fs.readdirSync(GITHUB_REPORTS_DIR);
                files.forEach(file => {
                    const filePath = path.join(GITHUB_REPORTS_DIR, file);
                    if (fs.statSync(filePath).isFile()) {
                        const stat = fs.statSync(filePath);
                        stats.preview.count++;
                        stats.preview.size += stat.size;
                    }
                });
            }
            
            // 아카이브 디렉토리 통계
            if (fs.existsSync(ARCHIVE_DIR)) {
                const archiveFiles = fs.readdirSync(ARCHIVE_DIR);
                archiveFiles.forEach(file => {
                    const filePath = path.join(ARCHIVE_DIR, file);
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
            
            // 미리보기 파일들만 삭제 (아카이브는 보존)
            if (fs.existsSync(GITHUB_REPORTS_DIR)) {
                const files = fs.readdirSync(GITHUB_REPORTS_DIR);
                files.forEach(file => {
                    const filePath = path.join(GITHUB_REPORTS_DIR, file);
                    if (fs.statSync(filePath).isFile()) {
                        const stat = fs.statSync(filePath);
                        deletedSize += stat.size;
                        fs.unlinkSync(filePath);
                        deletedCount++;
                    }
                });
            }
            
            // 백그라운드 작업 관리자의 완료된 작업들도 정리
            const cleanedTasks = this.taskManager.cleanupOldTasks(1); // 1시간 이상 된 작업 정리
            
            logger.info(`Cache cleared: ${deletedCount} files deleted, ${deletedSize} bytes freed, ${cleanedTasks} tasks cleaned`);
            
            return {
                success: true,
                deletedCount,
                deletedSize,
                cleanedTasks,
                message: `캐시가 정리되었습니다. ${deletedCount}개 파일 삭제, ${cleanedTasks}개 작업 정리`
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
     * 진행도 콜백 설정 (호환성을 위한 레거시 메서드)
     * @param {Function} callback - 진행도 콜백 함수
     */
    setProgressCallback(callback) {
        // 백그라운드 작업 관리자로 통합되었으므로 더 이상 사용하지 않음
        // 호환성을 위해 빈 구현으로 유지
        logger.debug('setProgressCallback called (legacy method - no longer used)');
    }

    // 레거시 메서드들 (호환성을 위해 유지)
    cancelCurrentGeneration() {
        const runningTasks = this.getRunningTasks();
        const reportTasks = runningTasks.filter(task => 
            task.type.includes('github') && task.type.includes('report')
        );
        
        if (reportTasks.length === 0) {
            return { success: false, message: '진행 중인 리포트 생성이 없습니다.' };
        }
        
        let cancelledCount = 0;
        reportTasks.forEach(task => {
            if (this.cancelTask(task.id)) {
                cancelledCount++;
            }
        });
        
        if (cancelledCount > 0) {
            return { 
                success: true, 
                message: `${cancelledCount}개의 리포트 생성 작업이 취소되었습니다.` 
            };
        }
        
        return { success: false, message: '리포트 생성을 취소할 수 없습니다.' };
    }

    getReportHistory(type, limit = 20) {
        try {
            const history = [];
            
            if (fs.existsSync(GITHUB_REPORTS_DIR)) {
                const files = fs.readdirSync(GITHUB_REPORTS_DIR);
                
                files.forEach(file => {
                    try {
                        const filePath = path.join(GITHUB_REPORTS_DIR, file);
                        const stat = fs.statSync(filePath);
                        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                        
                        if (!type || type === 'all' || data.type === type) {
                            history.push({
                                id: data.id || file.replace('.json', ''),
                                type: data.type || 'unknown',
                                category: data.category || 'preview',
                                timestamp: data.timestamp || stat.mtime.toISOString(),
                                generatedAt: data.metadata?.generatedAt || stat.mtime.toISOString(),
                                size: stat.size,
                                period: data.metadata?.period || null
                            });
                        }
                    } catch (error) {
                        logger.warn(`Error reading report file ${file}: ${error.message}`);
                    }
                });
            }
            
            // 아카이브 파일들도 포함
            if (fs.existsSync(ARCHIVE_DIR)) {
                const archiveFiles = fs.readdirSync(ARCHIVE_DIR);
                
                archiveFiles.forEach(file => {
                    try {
                        const filePath = path.join(ARCHIVE_DIR, file);
                        const stat = fs.statSync(filePath);
                        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                        
                        if (!type || type === 'all' || data.type === type) {
                            history.push({
                                id: data.id || file.replace('.json', ''),
                                type: data.type || 'unknown',
                                category: 'archive',
                                timestamp: data.timestamp || stat.mtime.toISOString(),
                                generatedAt: data.metadata?.generatedAt || stat.mtime.toISOString(),
                                sentAt: data.metadata?.sentAt || null,
                                size: stat.size,
                                period: data.metadata?.period || null
                            });
                        }
                    } catch (error) {
                        logger.warn(`Error reading archive file ${file}: ${error.message}`);
                    }
                });
            }
            
            // 시간순 정렬 (최신순)
            history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            return history.slice(0, limit);
            
        } catch (error) {
            logger.error(`Error getting report history: ${error.message}`, error);
            return [];
        }
    }

    deleteReport(reportId) {
        try {
            let deleted = false;
            let deletedSize = 0;
            
            // 미리보기 디렉토리에서 찾기
            if (fs.existsSync(GITHUB_REPORTS_DIR)) {
                const files = fs.readdirSync(GITHUB_REPORTS_DIR);
                const targetFile = files.find(file => file.includes(reportId));
                
                if (targetFile) {
                    const filePath = path.join(GITHUB_REPORTS_DIR, targetFile);
                    const stat = fs.statSync(filePath);
                    deletedSize = stat.size;
                    fs.unlinkSync(filePath);
                    deleted = true;
                }
            }
            
            // 아카이브 디렉토리에서도 찾기
            if (!deleted && fs.existsSync(ARCHIVE_DIR)) {
                const archiveFiles = fs.readdirSync(ARCHIVE_DIR);
                const targetFile = archiveFiles.find(file => file.includes(reportId));
                
                if (targetFile) {
                    const filePath = path.join(ARCHIVE_DIR, targetFile);
                    const stat = fs.statSync(filePath);
                    deletedSize = stat.size;
                    fs.unlinkSync(filePath);
                    deleted = true;
                }
            }
            
            if (!deleted) {
                return {
                    success: false,
                    message: '리포트를 찾을 수 없습니다.'
                };
            }
            
            logger.info(`Report deleted: ${reportId}`);
            
            return {
                success: true,
                message: '리포트가 삭제되었습니다.',
                deletedSize
            };
            
        } catch (error) {
            logger.error(`Error deleting report ${reportId}: ${error.message}`, error);
            return {
                success: false,
                message: `리포트 삭제 중 오류가 발생했습니다: ${error.message}`
            };
        }
    }

    sendAndArchiveReport(message, reportType, metadata = {}) {
        try {
            const reportData = {
                id: this.generateReportId(),
                type: reportType,
                content: message,
                metadata: {
                    ...metadata,
                    sentAt: new Date().toISOString(),
                    generatedAt: new Date().toISOString()
                },
                timestamp: new Date().toISOString(),
                category: 'archive'
            };
            
            const archiveFile = path.join(ARCHIVE_DIR, `${reportType}_${Date.now()}.json`);
            fs.writeFileSync(archiveFile, JSON.stringify(reportData, null, 2));
            
            logger.info(`Report archived: ${archiveFile}`);
            
            return {
                success: true,
                archiveFile,
                message: '리포트가 아카이브되었습니다.'
            };
            
        } catch (error) {
            logger.error(`Error archiving report: ${error.message}`, error);
            return {
                success: false,
                message: `리포트 아카이브 중 오류가 발생했습니다: ${error.message}`
            };
        }
    }

    /**
     * 커스텀 기간 리포트 생성
     * @param {string} startDate - 시작일
     * @param {string} endDate - 종료일
     * @returns {Promise<Object>} - 리포트 결과
     */
    async generateCustomPeriodReport(startDate, endDate) {
        try {
            if (!this.isEnabled) {
                return { success: false, message: 'GitHub service is not enabled' };
            }

            const taskId = this.taskManager.generateTaskId('github_custom_report');
            const taskData = {
                startDate,
                endDate,
                reportType: 'custom'
            };

            const taskFunction = async (updateProgress) => {
                updateProgress(0, `커스텀 기간 리포트 생성을 시작합니다... (${startDate} ~ ${endDate})`, 'initializing');
                
                const stats = await this.collectTeamStatsTask(startDate, endDate, updateProgress);
                
                updateProgress(90, '리포트 메시지를 생성하고 있습니다...', 'message_generation');
                const message = this.generateReportMessage(stats, startDate, endDate, 'custom');

                updateProgress(100, '커스텀 리포트 생성이 완료되었습니다!', 'completed');
                
                return {
                    message: message,
                    data: { 
                        teamStats: stats, 
                        periodInfo: { startDate, endDate } 
                    }
                };
            };

            const result = await this.taskManager.startTask(taskId, 'github_custom_report', taskData, taskFunction);
            
            return {
                success: true,
                message: result.message,
                data: result.data
            };

        } catch (error) {
            logger.error(`Failed to generate custom period report: ${error.message}`, error);
            return {
                success: false,
                message: '커스텀 기간 리포트 생성에 실패했습니다.',
                error: error.message
            };
        }
    }

    /**
     * 멤버 통계 조회
     * @param {string} githubUsername - GitHub 사용자명
     * @param {string} startDate - 시작일
     * @param {string} endDate - 종료일
     * @returns {Promise<Object>} - 멤버 통계
     */
    async getMemberStats(githubUsername, startDate, endDate) {
        try {
            if (!this.isEnabled) {
                return { success: false, message: 'GitHub service is not enabled' };
            }

            // 팀 매핑에서 해당 멤버 찾기
            const member = Object.values(this.config.teamMapping || {}).find(m => 
                m.githubUsername === githubUsername
            );
            
            if (!member) {
                return { 
                    success: false, 
                    message: `해당 GitHub 사용자를 찾을 수 없습니다: ${githubUsername}` 
                };
            }

            const stats = await this.collectTeamStatsTask(startDate, endDate, () => {});
            const memberStats = Object.values(stats).find(s => s.githubUsername === githubUsername);
            
            if (!memberStats) {
                return { 
                    success: false, 
                    message: `해당 기간 내 ${githubUsername}의 활동 데이터를 찾을 수 없습니다.` 
                };
            }

            return {
                success: true,
                data: {
                    member: memberStats,
                    period: { startDate, endDate }
                }
            };

        } catch (error) {
            logger.error(`Failed to get member stats: ${error.message}`, error);
            return {
                success: false,
                message: '멤버 통계 조회에 실패했습니다.',
                error: error.message
            };
        }
    }

    /**
     * 활동 알림 체크 및 전송
     * @returns {Promise<Object>} - 알림 결과
     */
    async checkAndSendActivityAlerts() {
        try {
            if (!this.isEnabled) {
                return { success: false, message: 'GitHub service is not enabled' };
            }

            // 알림 설정 확인
            const alertConfig = this.config.reporting?.alertThresholds;
            if (!alertConfig?.enableLowActivityAlerts) {
                return { 
                    success: false, 
                    message: '활동 알림이 비활성화되어 있습니다.' 
                };
            }

            // 지난 주 기간 계산
            const endDate = new Date();
            const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
            
            const startStr = startDate.toISOString().split('T')[0];
            const endStr = endDate.toISOString().split('T')[0];

            const stats = await this.collectTeamStatsTask(startStr, endStr, () => {});
            
            // 저조한 활동을 보이는 멤버 찾기
            const minCommits = alertConfig.minCommitsPerWeek || 3;
            const inactiveMembers = Object.values(stats).filter(member => 
                member.commits < minCommits
            );

            if (inactiveMembers.length === 0) {
                return { 
                    success: false, 
                    message: '모든 팀원이 활발한 활동을 보이고 있습니다.' 
                };
            }

            // 알림 메시지 생성
            let alertMessage = `⚠️ 지난 주 활동 알림 (${startStr} ~ ${endStr})\n\n`;
            alertMessage += `다음 팀원들의 커밋 활동이 최소 기준(${minCommits}회) 미만입니다:\n\n`;
            
            inactiveMembers.forEach(member => {
                alertMessage += `👤 ${member.name} (${member.githubUsername}): ${member.commits}회\n`;
            });
            
            alertMessage += `\n📊 전체 활동 요약:\n`;
            const activeMembers = Object.values(stats).filter(member => member.commits > 0);
            const totalCommits = activeMembers.reduce((sum, member) => sum + member.commits, 0);
            alertMessage += `- 전체 커밋: ${totalCommits}회\n`;
            alertMessage += `- 활동 중인 멤버: ${activeMembers.length}명\n`;
            
            return {
                success: true,
                message: alertMessage,
                data: {
                    inactiveMembers,
                    totalInactive: inactiveMembers.length,
                    period: { startDate: startStr, endDate: endStr }
                }
            };

        } catch (error) {
            logger.error(`Failed to check activity alerts: ${error.message}`, error);
            return {
                success: false,
                message: '활동 알림 체크에 실패했습니다.',
                error: error.message
            };
        }
    }

    /**
     * 리포트 내용 조회
     * @param {string} reportId - 리포트 ID
     * @returns {Object|null} - 리포트 내용 또는 null
     */
    getReportContent(reportId) {
        try {
            // 미리보기 디렉토리에서 찾기
            if (fs.existsSync(GITHUB_REPORTS_DIR)) {
                const files = fs.readdirSync(GITHUB_REPORTS_DIR);
                const targetFile = files.find(file => file.includes(reportId));
                
                if (targetFile) {
                    const filePath = path.join(GITHUB_REPORTS_DIR, targetFile);
                    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                    return {
                        id: data.id || reportId,
                        content: data.content,
                        type: data.type || 'unknown',
                        category: data.category || 'preview',
                        timestamp: data.timestamp,
                        metadata: data.metadata || {}
                    };
                }
            }
            
            // 아카이브 디렉토리에서 찾기
            if (fs.existsSync(ARCHIVE_DIR)) {
                const archiveFiles = fs.readdirSync(ARCHIVE_DIR);
                const targetFile = archiveFiles.find(file => file.includes(reportId));
                
                if (targetFile) {
                    const filePath = path.join(ARCHIVE_DIR, targetFile);
                    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                    return {
                        id: data.id || reportId,
                        content: data.content,
                        type: data.type || 'unknown',
                        category: 'archive',
                        timestamp: data.timestamp,
                        metadata: data.metadata || {}
                    };
                }
            }
            
            return null;
            
        } catch (error) {
            logger.error(`Error getting report content for ${reportId}: ${error.message}`, error);
            return null;
        }
    }
}

module.exports = GitHubService;