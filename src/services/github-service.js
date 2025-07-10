// src/services/github-service.js
// GitHub 통합 서비스 - 개선된 리포트 생성 (PR 댓글, 리뷰, 이슈 추가)

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
        this.backgroundTaskManager = this.taskManager;
        
        this.ensureCacheDirectories();
        this.loadConfiguration();
        
        setInterval(() => {
            this.taskManager.cleanupOldTasks(24);
        }, 60 * 60 * 1000);
    }

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

    loadConfiguration() {
        try {
            if (fs.existsSync(GITHUB_CONFIG_FILE)) {
                const configData = fs.readFileSync(GITHUB_CONFIG_FILE, 'utf8');
                this.config = JSON.parse(configData);
                
                if (!this.config.githubToken && process.env.GITHUB_TOKEN) {
                    this.config.githubToken = process.env.GITHUB_TOKEN;
                }
                
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

    saveConfiguration() {
        try {
            fs.writeFileSync(GITHUB_CONFIG_FILE, JSON.stringify(this.config, null, 2));
            logger.info('GitHub configuration saved successfully');
        } catch (error) {
            logger.error(`Failed to save GitHub configuration: ${error.message}`, error);
            throw error;
        }
    }

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

    async getRepositoryCommits(owner, repo, since, until) {
        try {
            const endpoint = `/repos/${owner}/${repo}/commits`;
            let url = endpoint + '?per_page=100';
            
            if (since) url += `&since=${since}`;
            if (until) url += `&until=${until}`;

            const commits = await this.makeGitHubApiCall(url);
            
            const detailedCommits = [];
            for (const commit of commits.slice(0, 50)) {
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
                    
                    await new Promise(resolve => setTimeout(resolve, 200));
                } catch (error) {
                    logger.warn(`Error fetching detailed commit ${commit.sha}: ${error.message}`);
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

    async getRepositoryPullRequests(owner, repo, since, until) {
        try {
            const endpoint = `/repos/${owner}/${repo}/pulls`;
            const url = endpoint + '?state=all&per_page=100&sort=created&direction=desc';

            const pullRequests = await this.makeGitHubApiCall(url);
            
            logger.debug(`Raw PRs from ${repo}: ${pullRequests.length}`);
            
            const filteredPRs = pullRequests.filter(pr => {
                const createdDate = new Date(pr.created_at);
                const sinceDate = since ? new Date(since) : new Date(0);
                const untilDate = until ? new Date(until) : new Date();
                
                return createdDate >= sinceDate && createdDate <= untilDate;
            });
            
            logger.debug(`Filtered PRs from ${repo}: ${filteredPRs.length}`);

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
                    
                    logger.debug(`PR #${pr.number} by ${pr.user.login}: ${pr.title}`);
                    
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

    async getRepositoryPRComments(owner, repo, since, until) {
        try {
            const endpoint = `/repos/${owner}/${repo}/pulls/comments`;
            const url = endpoint + '?per_page=100&sort=updated&direction=desc';

            const comments = await this.makeGitHubApiCall(url);
            
            const filteredComments = comments.filter(comment => {
                const createdDate = new Date(comment.created_at);
                const sinceDate = since ? new Date(since) : new Date(0);
                const untilDate = until ? new Date(until) : new Date();
                
                return createdDate >= sinceDate && createdDate <= untilDate;
            });

            return filteredComments.map(comment => ({
                id: comment.id,
                author: comment.user.login,
                createdAt: comment.created_at,
                body: comment.body,
                prNumber: comment.pull_request_url.split('/').pop()
            }));
        } catch (error) {
            logger.error(`Error fetching PR comments for ${owner}/${repo}: ${error.message}`, error);
            return [];
        }
    }

    async getRepositoryIssues(owner, repo, since, until) {
        try {
            const endpoint = `/repos/${owner}/${repo}/issues`;
            const url = endpoint + '?state=all&per_page=100&sort=updated&direction=desc';

            const issues = await this.makeGitHubApiCall(url);
            
            const filteredIssues = issues.filter(issue => {
                if (issue.pull_request) return false;
                
                const createdDate = new Date(issue.created_at);
                const sinceDate = since ? new Date(since) : new Date(0);
                const untilDate = until ? new Date(until) : new Date();
                
                return createdDate >= sinceDate && createdDate <= untilDate;
            });

            return filteredIssues.map(issue => ({
                number: issue.number,
                title: issue.title,
                author: issue.user.login,
                state: issue.state,
                createdAt: issue.created_at,
                closedAt: issue.closed_at,
                assignee: issue.assignee?.login || null,
                labels: issue.labels.map(label => label.name)
            }));
        } catch (error) {
            logger.error(`Error fetching issues for ${owner}/${repo}: ${error.message}`, error);
            return [];
        }
    }

    async getRepositoryReviews(owner, repo, since, until) {
        try {
            const prs = await this.getRepositoryPullRequests(owner, repo, since, until);
            const allReviews = [];

            for (const pr of prs.slice(0, 30)) {
                try {
                    const reviews = await this.makeGitHubApiCall(`/repos/${owner}/${repo}/pulls/${pr.number}/reviews`);
                    
                    reviews.forEach(review => {
                        allReviews.push({
                            id: review.id,
                            prNumber: pr.number,
                            author: review.user.login,
                            state: review.state,
                            createdAt: review.submitted_at,
                            body: review.body || ''
                        });
                    });
                    
                    await new Promise(resolve => setTimeout(resolve, 200));
                } catch (error) {
                    logger.warn(`Error fetching reviews for PR ${pr.number}: ${error.message}`);
                }
            }

            return allReviews;
        } catch (error) {
            logger.error(`Error fetching reviews for ${owner}/${repo}: ${error.message}`, error);
            return [];
        }
    }

    async collectTeamStatsTask(startDate, endDate, updateProgress) {
        const since = new Date(startDate).toISOString();
        const until = new Date(endDate).toISOString();
        
        const teamStats = {};
        
        Object.keys(this.config.teamMapping || {}).forEach(memberId => {
            const member = this.config.teamMapping[memberId];
            teamStats[memberId] = {
                githubUsername: member.githubUsername,
                name: member.name,
                email: member.email,
                commits: 0,
                pullRequests: 0,
                pullRequestsMerged: 0,
                pullRequestsClosed: 0,
                linesAdded: 0,
                linesDeleted: 0,
                prComments: 0,
                reviews: 0,
                issuesCreated: 0,
                issuesClosed: 0,
                repositories: new Set(),
                prProcessingTimes: []
            };
        });

        updateProgress(10, '리포지토리 목록을 확인하고 있습니다...', 'initialization');

        const repositories = this.config.repositories || [];
        const totalRepos = repositories.filter(repo => repo.enabled).length;
        
        if (totalRepos === 0) {
            throw new Error('활성화된 리포지토리가 없습니다.');
        }

        let processedRepos = 0;
        for (const repo of repositories) {
            if (!repo.enabled) continue;

            const repoProgress = Math.round(20 + (processedRepos / totalRepos) * 60);
            updateProgress(repoProgress, `리포지토리 ${repo.name} 분석 중...`, 'data_collection');

            try {
                // 커밋 정보 수집
                const commits = await this.getRepositoryCommits(repo.owner, repo.name, since, until);
                logger.info(`Repository ${repo.name}: Found ${commits.length} commits`);
                
                commits.forEach(commit => {
                    const member = Object.values(this.config.teamMapping || {}).find(m => 
                        m.githubUsername === commit.author || 
                        m.githubUsername.toLowerCase() === commit.author.toLowerCase() ||
                        m.email === commit.authorEmail ||
                        m.name === commit.authorName
                    );
                    
                    if (!member) {
                        logger.warn(`❌ ${commit.author} | ${repo.name} | 커밋 ${commit.sha.substring(0,7)} | 매핑 실패`);
                        return;
                    }
                    
                    const memberId = Object.keys(this.config.teamMapping || {}).find(id => 
                        this.config.teamMapping[id] === member
                    );
                    
                    if (memberId && teamStats[memberId]) {
                        teamStats[memberId].commits++;
                        teamStats[memberId].linesAdded += commit.additions;
                        teamStats[memberId].linesDeleted += commit.deletions;
                        teamStats[memberId].repositories.add(repo.name);
                        
                        logger.info(`💻 ${member.name} | ${repo.name} | 커밋 | +1 (총 ${teamStats[memberId].commits})`);
                        if (commit.additions > 0 || commit.deletions > 0) {
                            logger.info(`📝 ${member.name} | ${repo.name} | 커밋변경 | +${commit.additions}/-${commit.deletions}`);
                        }
                    }
                });

                // PR 정보 수집
                const pullRequests = await this.getRepositoryPullRequests(repo.owner, repo.name, since, until);
                logger.info(`Repository ${repo.name}: Found ${pullRequests.length} PRs`);
                
                pullRequests.forEach(pr => {
                    // 다양한 방식으로 팀 멤버 찾기
                    const member = Object.values(this.config.teamMapping || {}).find(m => 
                        m.githubUsername === pr.author || 
                        m.githubUsername.toLowerCase() === pr.author.toLowerCase() ||
                        m.email === pr.author + '@danal.co.kr' ||
                        m.name === pr.author
                    );
                    
                    if (!member) {
                        logger.warn(`❌ ${pr.author} | ${repo.name} | PR #${pr.number} | 매핑 실패`);
                        return;
                    }
                    
                    const memberId = Object.keys(this.config.teamMapping || {}).find(id => 
                        this.config.teamMapping[id] === member
                    );
                    
                    if (memberId && teamStats[memberId]) {
                        // 모든 PR 생성 카운트
                        teamStats[memberId].pullRequests++;
                        
                        // PR 상태별 분류
                        if (pr.mergedAt) {
                            teamStats[memberId].pullRequestsMerged++;
                            logger.info(`✅ ${member.name} | ${repo.name} | PR완료 | +1 (총 ${teamStats[memberId].pullRequestsMerged})`);
                            
                            // PR 처리 시간 계산 (완료된 PR만)
                            const processingTime = new Date(pr.mergedAt) - new Date(pr.createdAt);
                            const processingDays = processingTime / (1000 * 60 * 60 * 24);
                            teamStats[memberId].prProcessingTimes.push(processingDays);
                        } else if (pr.state === 'closed') {
                            teamStats[memberId].pullRequestsClosed++;
                            logger.info(`❌ ${member.name} | ${repo.name} | PR닫힘 | +1 (총 ${teamStats[memberId].pullRequestsClosed})`);
                        } else {
                            logger.info(`🔄 ${member.name} | ${repo.name} | PR생성 | +1 (총 ${teamStats[memberId].pullRequests})`);
                        }
                        
                        // 코드 변경량 추가
                        if (pr.additions > 0 || pr.deletions > 0) {
                            teamStats[memberId].linesAdded += pr.additions;
                            teamStats[memberId].linesDeleted += pr.deletions;
                            logger.info(`📝 ${member.name} | ${repo.name} | 코드변경 | +${pr.additions}/-${pr.deletions}`);
                        }
                        
                        teamStats[memberId].repositories.add(repo.name);
                    }
                });

                // PR 댓글 수집
                const prComments = await this.getRepositoryPRComments(repo.owner, repo.name, since, until);
                logger.info(`Repository ${repo.name}: Found ${prComments.length} PR comments`);
                
                prComments.forEach(comment => {
                    const member = Object.values(this.config.teamMapping || {}).find(m => 
                        m.githubUsername === comment.author
                    );
                    
                    if (member) {
                        const memberId = Object.keys(this.config.teamMapping || {}).find(id => 
                            this.config.teamMapping[id] === member
                        );
                        
                        if (memberId && teamStats[memberId]) {
                            teamStats[memberId].prComments++;
                            teamStats[memberId].repositories.add(repo.name);
                            logger.info(`💬 ${member.name} | ${repo.name} | PR댓글 | +1 (총 ${teamStats[memberId].prComments})`);
                        }
                    }
                });

                // 리뷰 수집
                const reviews = await this.getRepositoryReviews(repo.owner, repo.name, since, until);
                logger.info(`Repository ${repo.name}: Found ${reviews.length} reviews`);
                
                reviews.forEach(review => {
                    const member = Object.values(this.config.teamMapping || {}).find(m => 
                        m.githubUsername === review.author
                    );
                    
                    if (member) {
                        const memberId = Object.keys(this.config.teamMapping || {}).find(id => 
                            this.config.teamMapping[id] === member
                        );
                        
                        if (memberId && teamStats[memberId]) {
                            teamStats[memberId].reviews++;
                            teamStats[memberId].repositories.add(repo.name);
                            logger.info(`🔍 ${member.name} | ${repo.name} | 리뷰 | +1 (총 ${teamStats[memberId].reviews})`);
                        }
                    }
                });

                // 이슈 수집
                const issues = await this.getRepositoryIssues(repo.owner, repo.name, since, until);
                issues.forEach(issue => {
                    const member = Object.values(this.config.teamMapping || {}).find(m => 
                        m.githubUsername === issue.author
                    );
                    
                    if (member) {
                        const memberId = Object.keys(this.config.teamMapping || {}).find(id => 
                            this.config.teamMapping[id] === member
                        );
                        
                        if (memberId && teamStats[memberId]) {
                            teamStats[memberId].issuesCreated++;
                            if (issue.state === 'closed') {
                                teamStats[memberId].issuesClosed++;
                            }
                            teamStats[memberId].repositories.add(repo.name);
                        }
                    }
                });
                
                processedRepos++;
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (error) {
                logger.error(`Error collecting stats from ${repo.owner}/${repo.name}: ${error.message}`, error);
            }
        }

        updateProgress(85, '통계 데이터를 처리하고 있습니다...', 'processing');

        Object.keys(teamStats).forEach(memberId => {
            teamStats[memberId].repositories = Array.from(teamStats[memberId].repositories);
            
            // 평균 PR 처리 시간 계산
            if (teamStats[memberId].prProcessingTimes.length > 0) {
                const totalTime = teamStats[memberId].prProcessingTimes.reduce((sum, time) => sum + time, 0);
                teamStats[memberId].avgPrProcessingTime = totalTime / teamStats[memberId].prProcessingTimes.length;
            } else {
                teamStats[memberId].avgPrProcessingTime = 0;
            }
        });

        updateProgress(95, '리포트 메시지를 생성하고 있습니다...', 'message_generation');

        return teamStats;
    }

    generateBarChart(value, maxValue, length = 10) {
        if (maxValue === 0) return '▁'.repeat(length);
        
        const ratio = Math.min(value / maxValue, 1);
        const filledLength = Math.round(ratio * length);
        const emptyLength = length - filledLength;
        
        const filled = '█'.repeat(filledLength);
        const empty = '▁'.repeat(emptyLength);
        
        return filled + empty;
    }

    calculateOverallScore(stats) {
        const weights = {
            commits: 10,
            pullRequests: 15,
            pullRequestsMerged: 20,     // 완료된 PR에 더 높은 가중치
            pullRequestsClosed: 5,      // 닫힌 PR에 낙점
            linesAdded: 0.01,
            linesDeleted: 0.005,
            prComments: 5,
            reviews: 8,
            issuesCreated: 3,
            issuesClosed: 5
        };

        let score = 0;
        score += stats.commits * weights.commits;
        score += stats.pullRequests * weights.pullRequests;
        score += stats.pullRequestsMerged * weights.pullRequestsMerged;
        score -= stats.pullRequestsClosed * weights.pullRequestsClosed;  // 닫힌 PR은 마이너스
        score += stats.linesAdded * weights.linesAdded;
        score += stats.linesDeleted * weights.linesDeleted;
        score += stats.prComments * weights.prComments;
        score += stats.reviews * weights.reviews;
        score += stats.issuesCreated * weights.issuesCreated;
        score += stats.issuesClosed * weights.issuesClosed;

        return Math.round(score);
    }

    generateReportMessage(stats, startDate, endDate, type = 'weekly') {
        const typeEmoji = type === 'weekly' ? '🔥' : '📈';
        const typeName = type === 'weekly' ? '주간' : '월간';
        
        const activeMembers = Object.entries(stats)
            .filter(([_, data]) => data.commits > 0 || data.pullRequests > 0 || data.prComments > 0 || data.reviews > 0)
            .map(([memberId, data]) => ({
                memberId,
                ...data,
                overallScore: this.calculateOverallScore(data)
            }))
            .sort((a, b) => b.overallScore - a.overallScore);

        let message = `${typeEmoji} 이번 ${typeName} 개발 활동 리포트 (${startDate} ~ ${endDate}) ${typeEmoji}\n\n`;
        
        if (activeMembers.length === 0) {
            message += `📝 이번 ${typeName} 활동 내역이 없습니다.\n`;
            return message;
        }

        // 1등 축하 메시지
        if (activeMembers.length > 0) {
            const winner = activeMembers[0];
            message += `🎉 이번 ${typeName} 최고 기여자 🎉\n`;
            message += `🏆 ${winner.name} (${winner.githubUsername}) - ${winner.overallScore}점\n`;
            message += `축하합니다! 🎊\n\n`;
        }

        // 각 지표별 최대값 계산
        const maxValues = {
            commits: Math.max(...activeMembers.map(m => m.commits)),
            pullRequests: Math.max(...activeMembers.map(m => m.pullRequests)),
            pullRequestsMerged: Math.max(...activeMembers.map(m => m.pullRequestsMerged)),
            pullRequestsClosed: Math.max(...activeMembers.map(m => m.pullRequestsClosed)),
            linesAdded: Math.max(...activeMembers.map(m => m.linesAdded)),
            prComments: Math.max(...activeMembers.map(m => m.prComments)),
            reviews: Math.max(...activeMembers.map(m => m.reviews)),
            issuesCreated: Math.max(...activeMembers.map(m => m.issuesCreated)),
            issuesClosed: Math.max(...activeMembers.map(m => m.issuesClosed))
        };

        // 커밋 순위
        message += `📊 커밋 순위\n`;
        const commitRanking = [...activeMembers].sort((a, b) => b.commits - a.commits);
        commitRanking.forEach((member, index) => {
            if (member.commits > 0) {
                const bar = this.generateBarChart(member.commits, maxValues.commits, 8);
                message += `${index + 1}. ${bar} ${member.commits}회 - ${member.name}\n`;
            }
        });
        message += `\n`;

        // PR 생성 순위
        message += `🔄 Pull Request 생성 순위\n`;
        const prRanking = [...activeMembers].sort((a, b) => b.pullRequests - a.pullRequests);
        prRanking.forEach((member, index) => {
            if (member.pullRequests > 0) {
                const bar = this.generateBarChart(member.pullRequests, maxValues.pullRequests, 8);
                message += `${index + 1}. ${bar} ${member.pullRequests}건 - ${member.name}\n`;
            }
        });
        message += `\n`;

        // PR 완료 순위 (새로 추가)
        if (maxValues.pullRequestsMerged > 0) {
            message += `✅ Pull Request 완료 순위\n`;
            const prMergedRanking = [...activeMembers].sort((a, b) => b.pullRequestsMerged - a.pullRequestsMerged);
            prMergedRanking.forEach((member, index) => {
                if (member.pullRequestsMerged > 0) {
                    const bar = this.generateBarChart(member.pullRequestsMerged, maxValues.pullRequestsMerged, 8);
                    const successRate = member.pullRequests > 0 ? 
                        Math.round((member.pullRequestsMerged / member.pullRequests) * 100) : 0;
                    message += `${index + 1}. ${bar} ${member.pullRequestsMerged}건 (성공률 ${successRate}%) - ${member.name}\n`;
                }
            });
            message += `\n`;
        }

        // 코드 라인 순위
        message += `📝 코드 변경량 순위\n`;
        const linesRanking = [...activeMembers].sort((a, b) => b.linesAdded - a.linesAdded);
        linesRanking.forEach((member, index) => {
            if (member.linesAdded > 0) {
                const bar = this.generateBarChart(member.linesAdded, maxValues.linesAdded, 8);
                message += `${index + 1}. ${bar} +${member.linesAdded}/-${member.linesDeleted} - ${member.name}\n`;
            }
        });
        message += `\n`;

        // 리뷰 & 댓글 순위
        if (maxValues.reviews > 0 || maxValues.prComments > 0) {
            message += `💬 리뷰 & 댓글 순위\n`;
            const reviewRanking = [...activeMembers].sort((a, b) => (b.reviews + b.prComments) - (a.reviews + a.prComments));
            reviewRanking.forEach((member, index) => {
                const totalReviewActivity = member.reviews + member.prComments;
                if (totalReviewActivity > 0) {
                    const bar = this.generateBarChart(totalReviewActivity, Math.max(...activeMembers.map(m => m.reviews + m.prComments)), 8);
                    message += `${index + 1}. ${bar} 리뷰${member.reviews}+댓글${member.prComments} - ${member.name}\n`;
                }
            });
            message += `\n`;
        }

        // PR 효율성 순위 (새로 추가)
        const membersWithAvgTime = activeMembers.filter(member => member.avgPrProcessingTime > 0);
        if (membersWithAvgTime.length > 0) {
            message += `⚡ PR 효율성 순위 (평균 처리 시간)\n`;
            const prEfficiencyRanking = [...membersWithAvgTime].sort((a, b) => a.avgPrProcessingTime - b.avgPrProcessingTime);
            prEfficiencyRanking.forEach((member, index) => {
                const days = Math.round(member.avgPrProcessingTime * 10) / 10;
                message += `${index + 1}. ⚡ ${days}일 - ${member.name}\n`;
            });
            message += `\n`;
        }

        // 이슈 처리 순위
        if (maxValues.issuesCreated > 0 || maxValues.issuesClosed > 0) {
            message += `🐛 이슈 처리 순위\n`;
            const issueRanking = [...activeMembers].sort((a, b) => (b.issuesCreated + b.issuesClosed) - (a.issuesCreated + a.issuesClosed));
            issueRanking.forEach((member, index) => {
                const totalIssueActivity = member.issuesCreated + member.issuesClosed;
                if (totalIssueActivity > 0) {
                    const bar = this.generateBarChart(totalIssueActivity, Math.max(...activeMembers.map(m => m.issuesCreated + m.issuesClosed)), 8);
                    message += `${index + 1}. ${bar} 생성${member.issuesCreated}+해결${member.issuesClosed} - ${member.name}\n`;
                }
            });
            message += `\n`;
        }

        // 전체 통계
        const totalCommits = activeMembers.reduce((sum, member) => sum + member.commits, 0);
        const totalPRs = activeMembers.reduce((sum, member) => sum + member.pullRequests, 0);
        const totalPRsMerged = activeMembers.reduce((sum, member) => sum + member.pullRequestsMerged, 0);
        const totalPRsClosed = activeMembers.reduce((sum, member) => sum + member.pullRequestsClosed, 0);
        const totalAdded = activeMembers.reduce((sum, member) => sum + member.linesAdded, 0);
        const totalDeleted = activeMembers.reduce((sum, member) => sum + member.linesDeleted, 0);
        const totalReviews = activeMembers.reduce((sum, member) => sum + member.reviews, 0);
        const totalComments = activeMembers.reduce((sum, member) => sum + member.prComments, 0);
        const totalIssues = activeMembers.reduce((sum, member) => sum + member.issuesCreated + member.issuesClosed, 0);
        
        const overallSuccessRate = totalPRs > 0 ? Math.round((totalPRsMerged / totalPRs) * 100) : 0;
        
        message += `📈 전체 팀 활동 요약\n`;
        message += `🔥 총 커밋: ${totalCommits}회\n`;
        message += `🔄 총 PR: ${totalPRs}건\n`;
        message += `✅ 완료된 PR: ${totalPRsMerged}건 (성공률 ${overallSuccessRate}%)\n`;
        if (totalPRsClosed > 0) {
            message += `❌ 닫힌 PR: ${totalPRsClosed}건\n`;
        }
        message += `📝 총 코드 변경: +${totalAdded}/-${totalDeleted}\n`;
        message += `💬 총 리뷰: ${totalReviews}건\n`;
        message += `📨 총 댓글: ${totalComments}개\n`;
        message += `🐛 총 이슈 처리: ${totalIssues}건\n`;
        
        if (this.config.repositories) {
            message += `\n💡 GitHub 리포지토리\n`;
            this.config.repositories.forEach(repo => {
                if (repo.enabled) {
                    message += `• ${repo.name}: ${repo.url || `https://github.com/${repo.owner}/${repo.name}`}\n`;
                }
            });
        }
        
        return message;
    }

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

    // 기타 메서드들...
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

    generateReportId() {
        return `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

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
                comprehensiveMetrics: true
            }
        };
    }

    getStorageStats() {
        try {
            const stats = {
                preview: { count: 0, size: 0 },
                archive: { count: 0, size: 0 },
                total: { count: 0, size: 0, sizeMB: '0.00' }
            };
            
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

    clearCache() {
        try {
            let deletedCount = 0;
            let deletedSize = 0;
            
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
            
            const cleanedTasks = this.taskManager.cleanupOldTasks(1);
            
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

    // 레거시 메서드들
    setProgressCallback(callback) {
        logger.debug('setProgressCallback called (legacy method - no longer used)');
    }

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
                return { success: false, message: '리포트를 찾을 수 없습니다.' };
            }
            
            logger.info(`Report deleted: ${reportId}`);
            return { success: true, message: '리포트가 삭제되었습니다.', deletedSize };
            
        } catch (error) {
            logger.error(`Error deleting report ${reportId}: ${error.message}`, error);
            return { success: false, message: `리포트 삭제 중 오류가 발생했습니다: ${error.message}` };
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
            
            return { success: true, archiveFile, message: '리포트가 아카이브되었습니다.' };
            
        } catch (error) {
            logger.error(`Error archiving report: ${error.message}`, error);
            return { success: false, message: `리포트 아카이브 중 오류가 발생했습니다: ${error.message}` };
        }
    }

    getReportContent(reportId) {
        try {
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

    getLatestTodayReport() {
        try {
            const today = new Date();
            const todayStr = today.toISOString().split('T')[0];
            const reports = [];
            
            if (fs.existsSync(GITHUB_REPORTS_DIR)) {
                const files = fs.readdirSync(GITHUB_REPORTS_DIR);
                
                files.forEach(file => {
                    try {
                        const filePath = path.join(GITHUB_REPORTS_DIR, file);
                        const stat = fs.statSync(filePath);
                        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                        
                        const reportDate = new Date(data.timestamp || stat.mtime);
                        const reportDateStr = reportDate.toISOString().split('T')[0];
                        
                        if (reportDateStr === todayStr) {
                            reports.push({
                                id: data.id || file.replace('.json', ''),
                                type: data.type || 'unknown',
                                content: data.content,
                                category: data.category || 'preview',
                                timestamp: data.timestamp || stat.mtime.toISOString(),
                                metadata: data.metadata || {}
                            });
                        }
                    } catch (error) {
                        logger.warn(`Error reading report file ${file}: ${error.message}`);
                    }
                });
            }
            
            if (reports.length > 0) {
                reports.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                return reports[0];
            }
            
            return null;
            
        } catch (error) {
            logger.error(`Error getting latest today report: ${error.message}`, error);
            return null;
        }
    }
}

module.exports = GitHubService;