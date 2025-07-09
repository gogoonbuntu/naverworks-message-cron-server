// src/services/github-service.js
// GitHub 통합 서비스 - 완전 통합 버전

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const logger = require('../../logger');

const GITHUB_CONFIG_FILE = path.join(__dirname, '../../github-config.json');
const CACHE_DIR = path.join(__dirname, '../../cache');
const GITHUB_REPORTS_DIR = path.join(CACHE_DIR, 'github-reports');
const ARCHIVE_DIR = path.join(GITHUB_REPORTS_DIR, 'archive');
const PREVIEW_CACHE_FILE = path.join(CACHE_DIR, 'last-report-preview.json');

class GitHubService {
    constructor() {
        this.config = {};
        this.isEnabled = false;
        this.progressCallback = null;
        this.isGenerating = false;
        this.currentReportId = null;
        this.currentProgress = { stage: '', percent: 0, details: '' };
        this.isCollecting = false;
        
        this.ensureCacheDirectories();
        this.loadConfiguration();
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
     * @returns {boolean} - 설정이 유효한지 여부
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
        
        this.currentProgress = { stage: details.stage || 'processing', percent: percentage || 0, details: message };
        
        if (this.progressCallback) {
            this.progressCallback(progressData);
        }
        
        const progressText = percentage !== null ? ` (${percentage}%)` : '';
        const stepText = details.currentStep && details.totalSteps ? ` [${details.currentStep}/${details.totalSteps}]` : '';
        logger.info(`GitHub Progress: ${message}${progressText}${stepText}`);
        
        // 진행도가 100%이거나 완료 단계인 경우 리포트 ID 초기화
        if (percentage === 100 || details.stage === 'completed' || details.stage === 'error') {
            this.currentReportId = null;
        }
    }

    /**
     * 진행도 업데이트 (레거시 호환성)
     * @param {string} stage - 현재 단계
     * @param {number} percent - 진행률 (0-100)
     * @param {string} details - 상세 정보
     */
    updateProgress(stage, percent, details = '') {
        this.reportProgress(details, percent, { stage });
    }

    /**
     * 현재 진행도 조회
     * @returns {Object} - 현재 진행도 정보
     */
    getProgress() {
        return { ...this.currentProgress, isCollecting: this.isCollecting };
    }

    /**
     * 리포트 ID 생성
     * @returns {string} - 새로운 리포트 ID
     */
    generateReportId() {
        return `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * GitHub API 호출
     * @param {string} endpoint - API 엔드포인트
     * @param {string} method - HTTP 메서드
     * @param {Object} body - 요청 본문
     * @returns {Promise<Object>} - API 응답
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
     * @param {string} owner - 리포지토리 소유자
     * @param {string} repo - 리포지토리 이름
     * @param {string} since - 시작 날짜 (ISO 8601)
     * @param {string} until - 종료 날짜 (ISO 8601)
     * @returns {Promise<Array>} - 커밋 목록
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
     * @param {string} owner - 리포지토리 소유자
     * @param {string} repo - 리포지토리 이름
     * @param {string} since - 시작 날짜 (ISO 8601)
     * @param {string} until - 종료 날짜 (ISO 8601)
     * @returns {Promise<Array>} - PR 목록
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

            // 각 PR의 상세 정보 조회 (additions, deletions, changed_files 포함)
            const detailedPRs = [];
            for (const pr of filteredPRs.slice(0, 50)) { // API 제한으로 최대 50개만 상세 조회
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
                    
                    // API 호출 제한 방지를 위한 딜레이
                    await new Promise(resolve => setTimeout(resolve, 200));
                } catch (error) {
                    logger.warn(`Error fetching detailed PR ${pr.number}: ${error.message}`);
                    // 상세 정보 조회 실패 시 기본 정보만 사용
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
     * 팀원별 활동 통계 수집
     * @param {string} startDate - 시작 날짜 (YYYY-MM-DD)
     * @param {string} endDate - 종료 날짜 (YYYY-MM-DD)
     * @returns {Promise<Object>} - 팀원별 통계
     */
    async collectTeamStats(startDate, endDate) {
        if (!this.isEnabled) {
            throw new Error('GitHub service is not enabled');
        }

        this.isCollecting = true;
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

        // 각 리포지토리에서 데이터 수집
        const repositories = this.config.repositories || [];
        for (let i = 0; i < repositories.length; i++) {
            const repo = repositories[i];
            if (!repo.enabled) continue;

            logger.info(`Collecting stats from ${repo.owner}/${repo.name}`);
            this.reportProgress(`리포지토리 ${repo.name} 분석 중...`, 
                Math.round((i / repositories.length) * 80), 
                { stage: 'data_collection', repository: repo.name });
            
            try {
                // 커밋 정보 수집
                const commits = await this.getRepositoryCommits(repo.owner, repo.name, since, until);
                
                commits.forEach(commit => {
                    // GitHub 사용자명으로 매핑
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
                
                // API 호출 제한 방지를 위한 딜레이
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (error) {
                logger.error(`Error collecting stats from ${repo.owner}/${repo.name}: ${error.message}`, error);
            }
        }

        // Set을 Array로 변환
        Object.keys(teamStats).forEach(memberId => {
            teamStats[memberId].repositories = Array.from(teamStats[memberId].repositories);
        });

        this.isCollecting = false;
        return teamStats;
    }

    /**
     * 기본 리포트 메시지 생성
     * @param {Object} stats - 팀 통계
     * @param {string} startDate - 시작 날짜
     * @param {string} endDate - 종료 날짜
     * @param {string} type - 리포트 타입
     * @returns {string} - 리포트 메시지
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
     * 캐시된 리포트 로드
     * @param {string} type - 리포트 타입
     * @returns {Object|null} - 캐시된 리포트 또는 null
     */
    loadLatestCachedReport(type) {
        try {
            const cacheFiles = fs.readdirSync(GITHUB_REPORTS_DIR)
                .filter(file => file.startsWith(`${type}_`) && file.endsWith('.json'))
                .sort((a, b) => {
                    const aTime = fs.statSync(path.join(GITHUB_REPORTS_DIR, a)).mtime;
                    const bTime = fs.statSync(path.join(GITHUB_REPORTS_DIR, b)).mtime;
                    return bTime - aTime;
                });

            if (cacheFiles.length === 0) {
                return null;
            }

            const latestFile = path.join(GITHUB_REPORTS_DIR, cacheFiles[0]);
            const cachedData = JSON.parse(fs.readFileSync(latestFile, 'utf8'));
            
            // 캐시 유효성 검사 (24시간 이내)
            const ageHours = (new Date() - new Date(cachedData.timestamp)) / (1000 * 60 * 60);
            if (ageHours < 24) {
                return cachedData;
            }
            
            return null;
        } catch (error) {
            logger.error(`Error loading cached report: ${error.message}`, error);
            return null;
        }
    }

    /**
     * 리포트 미리보기 저장
     * @param {string} type - 리포트 타입
     * @param {string} content - 리포트 내용
     * @param {Object} metadata - 메타데이터
     * @returns {Object} - 저장 결과
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
                timestamp: new Date().toISOString()
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
     * 주간 리포트 생성
     * @returns {Promise<Object>} - 리포트 결과
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
            this.currentReportId = this.generateReportId();
            this.reportProgress('주간 리포트 생성을 시작합니다...', 0, { stage: 'initializing' });

            // 캐시된 리포트 확인
            this.reportProgress('캐시된 리포트를 확인하고 있습니다...', 5, { stage: 'cache_check' });
            const cachedReport = this.loadLatestCachedReport('weekly');
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
            const endDate = new Date();
            const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
            
            const startStr = startDate.toISOString().split('T')[0];
            const endStr = endDate.toISOString().split('T')[0];

            this.reportProgress(`${startStr} ~ ${endStr} 기간의 GitHub 활동을 분석하고 있습니다...`, 20, {
                stage: 'data_analysis'
            });

            const stats = await this.collectTeamStats(startStr, endStr);
            
            this.reportProgress('리포트 메시지를 생성하고 있습니다...', 90, {
                stage: 'message_rendering'
            });
            
            const message = this.generateReportMessage(stats, startStr, endStr, 'weekly');

            // 리포트 저장
            this.reportProgress('리포트를 저장하고 있습니다...', 95, { stage: 'saving' });
            const saveResult = this.savePreviewReport('weekly', message, {
                period: { startDate: startStr, endDate: endStr },
                teamMemberCount: Object.keys(this.config.teamMapping || {}).length,
                repositoryCount: this.config.repositories?.length || 0
            });

            this.reportProgress('주간 리포트 생성이 완료되었습니다!', 100, { stage: 'completed' });
            this.isGenerating = false;
            
            logger.info('Weekly GitHub report generated successfully');
            return {
                success: true,
                message: message,
                data: { 
                    teamStats: stats, 
                    periodInfo: { startDate: startStr, endDate: endStr } 
                },
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
     * 월간 리포트 생성
     * @returns {Promise<Object>} - 리포트 결과
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
            this.currentReportId = this.generateReportId();
            this.reportProgress('월간 리포트 생성을 시작합니다...', 0, { stage: 'initializing' });

            // 캐시된 리포트 확인
            this.reportProgress('캐시된 리포트를 확인하고 있습니다...', 5, { stage: 'cache_check' });
            const cachedReport = this.loadLatestCachedReport('monthly');
            if (cachedReport) {
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
            const endDate = new Date();
            const startDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
            
            const startStr = startDate.toISOString().split('T')[0];
            const endStr = endDate.toISOString().split('T')[0];

            this.reportProgress(`${startStr} ~ ${endStr} 기간의 GitHub 활동을 분석하고 있습니다...`, 20, {
                stage: 'data_analysis'
            });

            const stats = await this.collectTeamStats(startStr, endStr);
            
            this.reportProgress('리포트 메시지를 생성하고 있습니다...', 90, {
                stage: 'message_rendering'
            });
            
            const message = this.generateReportMessage(stats, startStr, endStr, 'monthly');

            // 리포트 저장
            this.reportProgress('리포트를 저장하고 있습니다...', 95, { stage: 'saving' });
            const saveResult = this.savePreviewReport('monthly', message, {
                period: { startDate: startStr, endDate: endStr },
                teamMemberCount: Object.keys(this.config.teamMapping || {}).length,
                repositoryCount: this.config.repositories?.length || 0
            });

            this.reportProgress('월간 리포트 생성이 완료되었습니다!', 100, { stage: 'completed' });
            this.isGenerating = false;
            
            logger.info('Monthly GitHub report generated successfully');
            return {
                success: true,
                message: message,
                data: { 
                    teamStats: stats, 
                    periodInfo: { startDate: startStr, endDate: endStr } 
                },
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
     * 커스텀 기간 리포트 생성
     * @param {string} startDate - 시작 날짜 (YYYY-MM-DD)
     * @param {string} endDate - 종료 날짜 (YYYY-MM-DD)
     * @returns {Promise<Object>} - 리포트 결과
     */
    async generateCustomPeriodReport(startDate, endDate) {
        try {
            if (!this.isEnabled) {
                return { success: false, message: 'GitHub service is not enabled' };
            }

            logger.info(`Generating custom period report: ${startDate} to ${endDate}`);
            
            const stats = await this.collectTeamStats(startDate, endDate);
            const message = this.generateReportMessage(stats, startDate, endDate, 'custom');

            return {
                success: true,
                message: message,
                data: { 
                    teamStats: stats, 
                    periodInfo: { startDate, endDate } 
                }
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
     * 멤버 통계 조회
     * @param {string} githubUsername - GitHub 사용자명
     * @param {string} startDate - 시작 날짜 (YYYY-MM-DD)
     * @param {string} endDate - 종료 날짜 (YYYY-MM-DD)
     * @returns {Promise<Object>} - 멤버 통계 결과
     */
    async getMemberStats(githubUsername, startDate, endDate) {
        try {
            if (!this.isEnabled) {
                return { success: false, message: 'GitHub service is not enabled' };
            }

            logger.info(`Getting member stats for ${githubUsername}: ${startDate} to ${endDate}`);

            const stats = await this.collectTeamStats(startDate, endDate);
            
            // 해당 사용자 찾기
            const member = Object.entries(this.config.teamMapping || {}).find(([_, data]) => 
                data.githubUsername === githubUsername
            );
            
            if (!member) {
                return {
                    success: false,
                    message: '해당 GitHub 사용자를 찾을 수 없습니다.'
                };
            }
            
            const [memberId] = member;
            const memberStats = stats[memberId];
            
            if (!memberStats) {
                return {
                    success: false,
                    message: '해당 멤버의 통계 정보를 찾을 수 없습니다.'
                };
            }

            return {
                success: true,
                data: memberStats,
                message: `${memberStats.name} 님의 통계 정보를 조회했습니다.`
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
     * 비활성 멤버 알림 체크
     * @returns {Promise<Object>} - 알림 결과
     */
    async checkAndSendActivityAlerts() {
        try {
            if (!this.isEnabled) {
                return { success: false, message: 'GitHub service is not enabled' };
            }

            const endDate = new Date();
            const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
            
            const startStr = startDate.toISOString().split('T')[0];
            const endStr = endDate.toISOString().split('T')[0];
            
            const stats = await this.collectTeamStats(startStr, endStr);
            
            // 비활성 멤버 찾기
            const inactiveMembers = Object.entries(stats)
                .filter(([_, data]) => data.commits === 0 && data.pullRequests === 0)
                .map(([memberId, data]) => data.name);
            
            if (inactiveMembers.length === 0) {
                return {
                    success: false,
                    message: '모든 멤버가 활성상태입니다.'
                };
            }
            
            const message = `⚠️ 비활성 멤버 알림 ⚠️\n\n` +
                           `지난 7일간 GitHub 활동이 없는 멤버:\n` +
                           inactiveMembers.map(name => `- ${name}`).join('\n') +
                           `\n\n활동 상태를 확인해주세요! 💪`;
            
            return {
                success: true,
                message: message,
                data: { inactiveMembers }
            };
            
        } catch (error) {
            logger.error(`Error checking activity alerts: ${error.message}`, error);
            return {
                success: false,
                message: `비활성 멤버 체크 중 오류가 발생했습니다: ${error.message}`
            };
        }
    }

    /**
     * 설정 업데이트
     * @param {Object} newConfig - 새로운 설정
     * @returns {Object} - 업데이트 결과
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
     * 저장소 통계 조회
     * @returns {Object} - 저장소 통계 정보
     */
    getStorageStats() {
        try {
            const stats = {
                cacheSize: 0,
                totalReports: 0,
                lastUpdate: null,
                diskUsage: 0,
                archiveCount: 0
            };
            
            // 캐시 디렉토리 통계
            if (fs.existsSync(GITHUB_REPORTS_DIR)) {
                const files = fs.readdirSync(GITHUB_REPORTS_DIR);
                stats.totalReports = files.length;
                
                files.forEach(file => {
                    const filePath = path.join(GITHUB_REPORTS_DIR, file);
                    const stat = fs.statSync(filePath);
                    stats.diskUsage += stat.size;
                    
                    if (!stats.lastUpdate || stat.mtime > stats.lastUpdate) {
                        stats.lastUpdate = stat.mtime;
                    }
                });
            }
            
            // 아카이브 디렉토리 통계
            if (fs.existsSync(ARCHIVE_DIR)) {
                const archiveFiles = fs.readdirSync(ARCHIVE_DIR);
                stats.archiveCount = archiveFiles.length;
                
                archiveFiles.forEach(file => {
                    const filePath = path.join(ARCHIVE_DIR, file);
                    const stat = fs.statSync(filePath);
                    stats.diskUsage += stat.size;
                });
            }
            
            return stats;
            
        } catch (error) {
            logger.error(`Error getting storage stats: ${error.message}`, error);
            return {
                cacheSize: 0,
                totalReports: 0,
                lastUpdate: null,
                diskUsage: 0,
                archiveCount: 0,
                error: error.message
            };
        }
    }

    /**
     * 캐시 정리
     * @returns {Object} - 정리 결과
     */
    clearCache() {
        try {
            let deletedCount = 0;
            let deletedSize = 0;
            
            // 캐시 디렉토리 내 파일들 삭제
            [GITHUB_REPORTS_DIR, ARCHIVE_DIR].forEach(dir => {
                if (fs.existsSync(dir)) {
                    const files = fs.readdirSync(dir);
                    files.forEach(file => {
                        const filePath = path.join(dir, file);
                        if (fs.statSync(filePath).isFile()) {
                            const stat = fs.statSync(filePath);
                            deletedSize += stat.size;
                            fs.unlinkSync(filePath);
                            deletedCount++;
                        }
                    });
                }
            });
            
            // 미리보기 캐시 파일 삭제
            if (fs.existsSync(PREVIEW_CACHE_FILE)) {
                const stat = fs.statSync(PREVIEW_CACHE_FILE);
                deletedSize += stat.size;
                fs.unlinkSync(PREVIEW_CACHE_FILE);
                deletedCount++;
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

    /**
     * 리포트 이력 조회
     * @param {string} type - 리포트 타입 ('weekly', 'monthly', 'all')
     * @param {number} limit - 조회 개수 제한
     * @returns {Array} - 리포트 이력 목록
     */
    getReportHistory(type, limit = 20) {
        try {
            const history = [];
            
            // 캐시 디렉토리에서 리포트 파일들 조회
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
                                timestamp: data.timestamp || stat.mtime.toISOString(),
                                generatedAt: data.metadata?.generatedAt || stat.mtime.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
                                size: stat.size,
                                period: data.metadata?.period || null
                            });
                        }
                    } catch (error) {
                        logger.warn(`Error reading report file ${file}: ${error.message}`);
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

    /**
     * 리포트 삭제
     * @param {string} reportId - 삭제할 리포트 ID
     * @returns {Object} - 삭제 결과
     */
    deleteReport(reportId) {
        try {
            const files = fs.readdirSync(GITHUB_REPORTS_DIR);
            const targetFile = files.find(file => file.includes(reportId));
            
            if (!targetFile) {
                return {
                    success: false,
                    message: '리포트를 찾을 수 없습니다.'
                };
            }
            
            const filePath = path.join(GITHUB_REPORTS_DIR, targetFile);
            const stat = fs.statSync(filePath);
            fs.unlinkSync(filePath);
            
            logger.info(`Report deleted: ${reportId}`);
            
            return {
                success: true,
                message: '리포트가 삭제되었습니다.',
                deletedSize: stat.size
            };
            
        } catch (error) {
            logger.error(`Error deleting report ${reportId}: ${error.message}`, error);
            return {
                success: false,
                message: `리포트 삭제 중 오류가 발생했습니다: ${error.message}`
            };
        }
    }

    /**
     * 리포트 생성 취소
     * @returns {Object} - 취소 결과
     */
    cancelCurrentGeneration() {
        if (this.isGenerating) {
            this.isGenerating = false;
            this.isCollecting = false;
            this.reportProgress('리포트 생성이 취소되었습니다.', null, { stage: 'cancelled' });
            logger.info('GitHub report generation cancelled by user');
            return { success: true, message: '리포트 생성이 취소되었습니다.' };
        }
        return { success: false, message: '진행 중인 리포트 생성이 없습니다.' };
    }

    /**
     * 리포트 전송 및 아카이브
     * @param {string} message - 전송할 메시지
     * @param {string} reportType - 리포트 타입
     * @param {Object} metadata - 메타데이터
     * @returns {Object} - 아카이브 결과
     */
    sendAndArchiveReport(message, reportType, metadata = {}) {
        try {
            const reportData = {
                type: reportType,
                content: message,
                metadata: {
                    ...metadata,
                    sentAt: new Date().toISOString(),
                    generatedAt: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
                },
                timestamp: new Date().toISOString()
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
     * 서비스 상태 확인
     * @returns {Object} - 서비스 상태
     */
    getServiceStatus() {
        const storageStats = this.getStorageStats();
        
        return {
            isEnabled: this.isEnabled,
            isGenerating: this.isGenerating,
            isCollecting: this.isCollecting,
            currentReportId: this.currentReportId,
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
                progressTracking: true,
                caching: true,
                archiving: true,
                reportHistory: true
            }
        };
    }

    // 레거시 메서드들 (호환성을 위해 유지)
    async generateAndSendWeeklyReport() {
        return await this.generateWeeklyReport();
    }

    async generateAndSendMonthlyReport() {
        return await this.generateMonthlyReport();
    }

    saveReportPreview(reportData) {
        try {
            const cacheData = {
                ...reportData,
                timestamp: new Date().toISOString(),
                generatedAt: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
            };
            
            fs.writeFileSync(PREVIEW_CACHE_FILE, JSON.stringify(cacheData, null, 2));
            logger.info('Report preview saved to cache');
        } catch (error) {
            logger.error(`Error saving report preview: ${error.message}`, error);
        }
    }

    loadReportPreview() {
        try {
            if (fs.existsSync(PREVIEW_CACHE_FILE)) {
                const cacheData = JSON.parse(fs.readFileSync(PREVIEW_CACHE_FILE, 'utf8'));
                const ageHours = (new Date() - new Date(cacheData.timestamp)) / (1000 * 60 * 60);
                
                if (ageHours < 24) {
                    logger.info('Loaded cached report preview');
                    return cacheData;
                }
            }
        } catch (error) {
            logger.error(`Error loading report preview: ${error.message}`, error);
        }
        return null;
    }
}

module.exports = GitHubService;
