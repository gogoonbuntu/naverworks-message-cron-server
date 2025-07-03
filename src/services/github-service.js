// src/services/github-service.js
// GitHub 통합 서비스

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const logger = require('../../logger');

const GITHUB_CONFIG_FILE = path.join(__dirname, '../../github-config.json');
const PREVIEW_CACHE_DIR = path.join(__dirname, '../../cache');
const PREVIEW_CACHE_FILE = path.join(PREVIEW_CACHE_DIR, 'last-report-preview.json');

class GitHubService {
    constructor() {
        this.config = {};
        this.isEnabled = false;
        this.currentProgress = { stage: '', percent: 0, details: '' };
        this.isCollecting = false;
        this.ensureCacheDirectory();
        this.loadConfiguration();
    }

    /**
     * 캐시 디렉토리 생성
     */
    ensureCacheDirectory() {
        try {
            if (!fs.existsSync(PREVIEW_CACHE_DIR)) {
                fs.mkdirSync(PREVIEW_CACHE_DIR, { recursive: true });
                logger.info('Created cache directory for GitHub reports');
            }
        } catch (error) {
            logger.error(`Error creating cache directory: ${error.message}`, error);
        }
    }

    /**
     * 리포트 미리보기 저장
     * @param {Object} reportData - 리포트 데이터
     */
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

    /**
     * 저장된 리포트 미리보기 로드
     * @returns {Object|null} - 저장된 리포트 데이터 또는 null
     */
    loadReportPreview() {
        try {
            if (fs.existsSync(PREVIEW_CACHE_FILE)) {
                const cacheData = JSON.parse(fs.readFileSync(PREVIEW_CACHE_FILE, 'utf8'));
                const ageHours = (new Date() - new Date(cacheData.timestamp)) / (1000 * 60 * 60);
                
                // 24시간 이내의 캐시만 유효
                if (ageHours < 24) {
                    logger.info('Loaded cached report preview');
                    return cacheData;
                } else {
                    logger.info('Cached report preview is too old, ignoring');
                }
            }
        } catch (error) {
            logger.error(`Error loading report preview: ${error.message}`, error);
        }
        return null;
    }

    /**
     * 진행도 업데이트
     * @param {string} stage - 현재 단계
     * @param {number} percent - 진행률 (0-100)
     * @param {string} details - 상세 정보
     */
    updateProgress(stage, percent, details = '') {
        this.currentProgress = { stage, percent, details };
        logger.info(`GitHub collection progress: ${stage} (${percent}%) - ${details}`);
    }

    /**
     * 현재 진행도 조회
     * @returns {Object} - 현재 진행도 정보
     */
    getProgress() {
        return { ...this.currentProgress, isCollecting: this.isCollecting };
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
                
                this.isEnabled = this.config.enabled && this.config.githubToken;
                
                if (this.isEnabled) {
                    logger.info('GitHub service enabled successfully');
                    logger.info(`Monitoring ${this.config.repositories.length} repositories`);
                    logger.info('GitHub token loaded from configuration');
                } else {
                    logger.warn('GitHub service disabled (missing token or disabled in config)');
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

        const since = new Date(startDate).toISOString();
        const until = new Date(endDate).toISOString();
        
        const teamStats = {};
        
        // 팀 매핑 정보로 초기화
        Object.keys(this.config.teamMapping).forEach(memberId => {
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
        for (const repo of this.config.repositories) {
            if (!repo.enabled) continue;

            logger.info(`Collecting stats from ${repo.owner}/${repo.name}`);
            
            try {
                // 커밋 정보 수집
                const commits = await this.getRepositoryCommits(repo.owner, repo.name, since, until);
                
                commits.forEach(commit => {
                    // GitHub 사용자명으로 매핑
                    const member = Object.values(this.config.teamMapping).find(m => 
                        m.githubUsername === commit.author || 
                        m.email === commit.authorEmail
                    );
                    
                    if (member) {
                        const memberId = Object.keys(this.config.teamMapping).find(id => 
                            this.config.teamMapping[id] === member
                        );
                        
                        if (memberId && teamStats[memberId]) {
                            teamStats[memberId].commits++;
                            teamStats[memberId].linesAdded += commit.additions;
                            teamStats[memberId].linesDeleted += commit.deletions;
                            teamStats[memberId].repositories.add(repo.name);
                            
                            logger.debug(`Added commit for ${member.name}: +${commit.additions} -${commit.deletions} in ${repo.name}`);
                        }
                    } else {
                        logger.debug(`Unknown author: ${commit.author} (${commit.authorEmail}) in ${repo.name}`);
                    }
                });

                // PR 정보 수집
                const pullRequests = await this.getRepositoryPullRequests(repo.owner, repo.name, since, until);
                
                pullRequests.forEach(pr => {
                    const member = Object.values(this.config.teamMapping).find(m => 
                        m.githubUsername === pr.author
                    );
                    
                    if (member) {
                        const memberId = Object.keys(this.config.teamMapping).find(id => 
                            this.config.teamMapping[id] === member
                        );
                        
                        if (memberId && teamStats[memberId]) {
                            teamStats[memberId].pullRequests++;
                            teamStats[memberId].linesAdded += pr.additions;
                            teamStats[memberId].linesDeleted += pr.deletions;
                            teamStats[memberId].repositories.add(repo.name);
                            
                            logger.debug(`Added PR for ${member.name}: +${pr.additions} -${pr.deletions} in ${repo.name}`);
                        }
                    } else {
                        logger.debug(`Unknown PR author: ${pr.author} in ${repo.name}`);
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

        return teamStats;
    }

    /**
     * 주간 리포트 생성
     * @returns {Promise<Object>} - 리포트 결과
     */
    async generateWeeklyReport() {
        try {
            const endDate = new Date();
            const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
            
            const startStr = startDate.toISOString().split('T')[0];
            const endStr = endDate.toISOString().split('T')[0];
            
            const stats = await this.collectTeamStats(startStr, endStr);
            
            let message = `🔥 이번 주 개발 활동 리포트 (${startStr} ~ ${endStr}) 🔥\n\n`;
            
            // 활동이 있는 팀원만 필터링
            const activeMembers = Object.entries(stats)
                .filter(([_, data]) => data.commits > 0 || data.pullRequests > 0)
                .sort((a, b) => b[1].commits - a[1].commits);

            if (activeMembers.length === 0) {
                message += "📝 이번 주 활동 내역이 없습니다.\n";
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
            
            message += `\n💡 GitHub 리포지토리:\n`;
            this.config.repositories.forEach(repo => {
                if (repo.enabled) {
                    message += `  - ${repo.name}: ${repo.url}\n`;
                }
            });
            
            return {
                success: true,
                message: message,
                data: stats
            };
            
        } catch (error) {
            logger.error(`Error generating weekly report: ${error.message}`, error);
            return {
                success: false,
                message: `주간 리포트 생성 중 오류가 발생했습니다: ${error.message}`
            };
        }
    }

    /**
     * 월간 리포트 생성
     * @returns {Promise<Object>} - 리포트 결과
     */
    async generateMonthlyReport() {
        try {
            const endDate = new Date();
            const startDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
            
            const startStr = startDate.toISOString().split('T')[0];
            const endStr = endDate.toISOString().split('T')[0];
            
            const stats = await this.collectTeamStats(startStr, endStr);
            
            let message = `📈 이번 달 개발 활동 리포트 (${startStr} ~ ${endStr}) 📈\n\n`;
            
            // 활동이 있는 팀원만 필터링 및 정렬
            const activeMembers = Object.entries(stats)
                .filter(([_, data]) => data.commits > 0 || data.pullRequests > 0)
                .sort((a, b) => b[1].commits - a[1].commits);

            if (activeMembers.length === 0) {
                message += "📝 이번 달 활동 내역이 없습니다.\n";
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
            
            return {
                success: true,
                message: message,
                data: stats
            };
            
        } catch (error) {
            logger.error(`Error generating monthly report: ${error.message}`, error);
            return {
                success: false,
                message: `월간 리포트 생성 중 오류가 발생했습니다: ${error.message}`
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
            const stats = await this.collectTeamStats(startDate, endDate);
            
            let message = `📊 커스텀 기간 개발 활동 리포트 (${startDate} ~ ${endDate}) 📊\n\n`;
            
            const activeMembers = Object.entries(stats)
                .filter(([_, data]) => data.commits > 0 || data.pullRequests > 0)
                .sort((a, b) => b[1].commits - a[1].commits);

            if (activeMembers.length === 0) {
                message += "📝 해당 기간 활동 내역이 없습니다.\n";
            } else {
                activeMembers.forEach(([memberId, data]) => {
                    message += `👩‍💻 ${data.name} (${data.githubUsername})\n`;
                    message += `  - 커밋: ${data.commits}회\n`;
                    message += `  - PR: ${data.pullRequests}건\n`;
                    message += `  - 코드 변경: +${data.linesAdded} / -${data.linesDeleted}\n`;
                    message += `  - 활동 리포지토리: ${data.repositories.join(', ')}\n\n`;
                });
            }
            
            return {
                success: true,
                message: message,
                data: stats
            };
            
        } catch (error) {
            logger.error(`Error generating custom period report: ${error.message}`, error);
            return {
                success: false,
                message: `커스텀 기간 리포트 생성 중 오류가 발생했습니다: ${error.message}`
            };
        }
    }

    /**
     * 서비스 상태 조회
     * @returns {Object} - 서비스 상태
     */
    getServiceStatus() {
        return {
            isEnabled: this.isEnabled,
            repositories: this.config.repositories || [],
            teamMembers: Object.keys(this.config.teamMapping || {}),
            reporting: this.config.reporting || {}
        };
    }

    /**
     * 설정 업데이트
     * @param {Object} newConfig - 새로운 설정
     * @returns {Object} - 업데이트 결과
     */
    updateConfiguration(newConfig) {
        try {
            // 기존 설정과 병합
            const updatedConfig = { ...this.config, ...newConfig };
            
            // 파일에 저장
            fs.writeFileSync(GITHUB_CONFIG_FILE, JSON.stringify(updatedConfig, null, 2));
            
            // 메모리 설정 업데이트
            this.config = updatedConfig;
            this.isEnabled = this.config.enabled && this.config.githubToken;
            
            logger.info('GitHub configuration updated successfully');
            
            return {
                success: true,
                message: 'GitHub 설정이 성공적으로 업데이트되었습니다.'
            };
            
        } catch (error) {
            logger.error(`Error updating GitHub configuration: ${error.message}`, error);
            return {
                success: false,
                message: `설정 업데이트 중 오류가 발생했습니다: ${error.message}`
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
            const stats = await this.collectTeamStats(startDate, endDate);
            
            // 해당 사용자 찾기
            const member = Object.entries(this.config.teamMapping).find(([_, data]) => 
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
            logger.error(`Error getting member stats: ${error.message}`, error);
            return {
                success: false,
                message: `멤버 통계 조회 중 오류가 발생했습니다: ${error.message}`
            };
        }
    }

    /**
     * 비활성 멤버 알림 체크
     * @returns {Promise<Object>} - 알림 결과
     */
    async checkAndSendActivityAlerts() {
        try {
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
}

module.exports = GitHubService;
