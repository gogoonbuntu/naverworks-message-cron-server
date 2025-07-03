// github-analyzer.js
// GitHub 기여도 분석 모듈 - GitPulse 기능
// 팀원별 GitHub 활동 데이터를 수집하고 분석합니다.

const { Octokit } = require('@octokit/rest');
const logger = require('./logger');

class GitHubAnalyzer {
    constructor(config) {
        this.config = config;
        this.octokit = new Octokit({
            auth: config.githubToken,
            baseUrl: config.githubBaseUrl || 'https://api.github.com'
        });
    }

    /**
     * 기간별 팀원 GitHub 활동 분석
     * @param {string} startDate - 분석 시작일 (YYYY-MM-DD)
     * @param {string} endDate - 분석 종료일 (YYYY-MM-DD)
     * @returns {Object} 팀원별 기여도 데이터
     */
    async analyzeTeamContributions(startDate, endDate) {
        try {
            logger.info(`Starting GitHub analysis for period: ${startDate} to ${endDate}`);
            
            const teamStats = {};
            const repositories = this.config.repositories || [];
            
            if (repositories.length === 0) {
                logger.warn('No repositories configured for analysis');
                return {};
            }

            // 각 팀원별 분석 실행
            for (const member of this.config.teamMembers) {
                logger.debug(`Analyzing contributions for: ${member.githubUsername}`);
                
                const memberStats = {
                    username: member.githubUsername,
                    displayName: member.displayName || member.githubUsername,
                    commits: 0,
                    prsCreated: 0,
                    prsReviewed: 0,
                    issuesCreated: 0,
                    issuesClosed: 0,
                    linesAdded: 0,
                    linesDeleted: 0,
                    repositories: [],
                    topCommits: [],
                    reviewComments: 0
                };

                // 각 레포지토리별 분석
                for (const repo of repositories) {
                    const repoStats = await this.analyzeRepositoryContributions(
                        repo.owner,
                        repo.name,
                        member.githubUsername,
                        startDate,
                        endDate
                    );
                    
                    // 통계 합산
                    memberStats.commits += repoStats.commits;
                    memberStats.prsCreated += repoStats.prsCreated;
                    memberStats.prsReviewed += repoStats.prsReviewed;
                    memberStats.issuesCreated += repoStats.issuesCreated;
                    memberStats.issuesClosed += repoStats.issuesClosed;
                    memberStats.linesAdded += repoStats.linesAdded;
                    memberStats.linesDeleted += repoStats.linesDeleted;
                    memberStats.reviewComments += repoStats.reviewComments;
                    memberStats.repositories.push(repoStats);
                    memberStats.topCommits.push(...repoStats.topCommits);
                }

                // 상위 커밋 정렬 (변경 라인 수 기준)
                memberStats.topCommits.sort((a, b) => (b.additions + b.deletions) - (a.additions + a.deletions));
                memberStats.topCommits = memberStats.topCommits.slice(0, 3);

                teamStats[member.githubUsername] = memberStats;
            }

            logger.info(`GitHub analysis completed for ${Object.keys(teamStats).length} team members`);
            return teamStats;

        } catch (error) {
            logger.error(`GitHub analysis failed: ${error.message}`, error);
            throw error;
        }
    }

    /**
     * 특정 레포지토리의 사용자 기여도 분석
     */
    async analyzeRepositoryContributions(owner, repo, username, startDate, endDate) {
        try {
            logger.debug(`Analyzing repository: ${owner}/${repo} for user: ${username}`);

            const repoStats = {
                repository: `${owner}/${repo}`,
                commits: 0,
                prsCreated: 0,
                prsReviewed: 0,
                issuesCreated: 0,
                issuesClosed: 0,
                linesAdded: 0,
                linesDeleted: 0,
                reviewComments: 0,
                topCommits: []
            };

            // 커밋 분석
            const commits = await this.getCommits(owner, repo, username, startDate, endDate);
            repoStats.commits = commits.length;
            repoStats.topCommits = commits.slice(0, 5);

            // 라인 변경 수 계산
            for (const commit of commits) {
                repoStats.linesAdded += commit.stats?.additions || 0;
                repoStats.linesDeleted += commit.stats?.deletions || 0;
            }

            // Pull Request 분석
            const prs = await this.getPullRequests(owner, repo, username, startDate, endDate);
            repoStats.prsCreated = prs.created.length;

            // PR 리뷰 분석
            const reviews = await this.getPullRequestReviews(owner, repo, username, startDate, endDate);
            repoStats.prsReviewed = reviews.length;
            repoStats.reviewComments = reviews.reduce((sum, review) => sum + (review.comments || 0), 0);

            // 이슈 분석
            const issues = await this.getIssues(owner, repo, username, startDate, endDate);
            repoStats.issuesCreated = issues.created.length;
            repoStats.issuesClosed = issues.closed.length;

            logger.debug(`Repository analysis completed for ${owner}/${repo}: ${repoStats.commits} commits, ${repoStats.prsCreated} PRs`);
            return repoStats;

        } catch (error) {
            logger.error(`Repository analysis failed for ${owner}/${repo}: ${error.message}`, error);
            return {
                repository: `${owner}/${repo}`,
                commits: 0, prsCreated: 0, prsReviewed: 0, issuesCreated: 0, issuesClosed: 0,
                linesAdded: 0, linesDeleted: 0, reviewComments: 0, topCommits: []
            };
        }
    }

    /**
     * 커밋 정보 가져오기
     */
    async getCommits(owner, repo, username, startDate, endDate) {
        try {
            const { data: commits } = await this.octokit.repos.listCommits({
                owner,
                repo,
                author: username,
                since: `${startDate}T00:00:00Z`,
                until: `${endDate}T23:59:59Z`,
                per_page: 100
            });

            // 각 커밋의 상세 정보 가져오기 (변경 라인 수 포함)
            const detailedCommits = await Promise.all(
                commits.slice(0, 10).map(async (commit) => {
                    try {
                        const { data: commitDetail } = await this.octokit.repos.getCommit({
                            owner,
                            repo,
                            ref: commit.sha
                        });

                        return {
                            sha: commit.sha,
                            message: commit.commit.message,
                            date: commit.commit.author.date,
                            stats: commitDetail.stats,
                            additions: commitDetail.stats?.additions || 0,
                            deletions: commitDetail.stats?.deletions || 0,
                            url: commit.html_url
                        };
                    } catch (error) {
                        logger.debug(`Failed to get commit details for ${commit.sha}: ${error.message}`);
                        return {
                            sha: commit.sha,
                            message: commit.commit.message,
                            date: commit.commit.author.date,
                            stats: { additions: 0, deletions: 0, total: 0 },
                            additions: 0,
                            deletions: 0,
                            url: commit.html_url
                        };
                    }
                })
            );

            return detailedCommits;

        } catch (error) {
            logger.error(`Failed to get commits for ${owner}/${repo}: ${error.message}`);
            return [];
        }
    }

    /**
     * Pull Request 정보 가져오기
     */
    async getPullRequests(owner, repo, username, startDate, endDate) {
        try {
            const { data: prs } = await this.octokit.pulls.list({
                owner,
                repo,
                state: 'all',
                sort: 'created',
                direction: 'desc',
                per_page: 100
            });

            const filteredPrs = prs.filter(pr => {
                const createdDate = new Date(pr.created_at);
                return pr.user.login === username &&
                       createdDate >= new Date(startDate) &&
                       createdDate <= new Date(endDate);
            });

            return {
                created: filteredPrs,
                merged: filteredPrs.filter(pr => pr.merged_at),
                closed: filteredPrs.filter(pr => pr.state === 'closed')
            };

        } catch (error) {
            logger.error(`Failed to get pull requests for ${owner}/${repo}: ${error.message}`);
            return { created: [], merged: [], closed: [] };
        }
    }

    /**
     * Pull Request 리뷰 정보 가져오기
     */
    async getPullRequestReviews(owner, repo, username, startDate, endDate) {
        try {
            const { data: prs } = await this.octokit.pulls.list({
                owner,
                repo,
                state: 'all',
                sort: 'created',
                direction: 'desc',
                per_page: 100
            });

            const reviews = [];
            for (const pr of prs) {
                try {
                    const { data: prReviews } = await this.octokit.pulls.listReviews({
                        owner,
                        repo,
                        pull_number: pr.number
                    });

                    const userReviews = prReviews.filter(review => {
                        const reviewDate = new Date(review.submitted_at);
                        return review.user.login === username &&
                               reviewDate >= new Date(startDate) &&
                               reviewDate <= new Date(endDate);
                    });

                    // 리뷰 코멘트 수 계산
                    for (const review of userReviews) {
                        const { data: comments } = await this.octokit.pulls.listReviewComments({
                            owner,
                            repo,
                            pull_number: pr.number,
                            review_id: review.id
                        });
                        review.comments = comments.length;
                    }

                    reviews.push(...userReviews);
                } catch (error) {
                    logger.debug(`Failed to get reviews for PR #${pr.number}: ${error.message}`);
                }
            }

            return reviews;

        } catch (error) {
            logger.error(`Failed to get pull request reviews for ${owner}/${repo}: ${error.message}`);
            return [];
        }
    }

    /**
     * 이슈 정보 가져오기
     */
    async getIssues(owner, repo, username, startDate, endDate) {
        try {
            const { data: issues } = await this.octokit.issues.listForRepo({
                owner,
                repo,
                state: 'all',
                sort: 'created',
                direction: 'desc',
                per_page: 100
            });

            const created = issues.filter(issue => {
                const createdDate = new Date(issue.created_at);
                return issue.user.login === username &&
                       createdDate >= new Date(startDate) &&
                       createdDate <= new Date(endDate) &&
                       !issue.pull_request; // PR은 제외
            });

            const closed = issues.filter(issue => {
                const closedDate = issue.closed_at ? new Date(issue.closed_at) : null;
                return issue.user.login === username &&
                       closedDate &&
                       closedDate >= new Date(startDate) &&
                       closedDate <= new Date(endDate) &&
                       !issue.pull_request; // PR은 제외
            });

            return { created, closed };

        } catch (error) {
            logger.error(`Failed to get issues for ${owner}/${repo}: ${error.message}`);
            return { created: [], closed: [] };
        }
    }

    /**
     * 팀 전체 통계 계산
     */
    calculateTeamStats(teamStats) {
        const totalStats = {
            totalCommits: 0,
            totalPRs: 0,
            totalReviews: 0,
            totalIssues: 0,
            totalLinesChanged: 0,
            memberCount: Object.keys(teamStats).length,
            topContributors: []
        };

        // 개별 통계 합산
        for (const [username, stats] of Object.entries(teamStats)) {
            totalStats.totalCommits += stats.commits;
            totalStats.totalPRs += stats.prsCreated;
            totalStats.totalReviews += stats.prsReviewed;
            totalStats.totalIssues += stats.issuesCreated;
            totalStats.totalLinesChanged += stats.linesAdded + stats.linesDeleted;

            // 기여도 점수 계산 (가중치 적용)
            const contributionScore = 
                (stats.commits * 1) +
                (stats.prsCreated * 3) +
                (stats.prsReviewed * 2) +
                (stats.issuesCreated * 1) +
                (stats.issuesClosed * 2) +
                Math.floor((stats.linesAdded + stats.linesDeleted) / 100);

            totalStats.topContributors.push({
                username,
                displayName: stats.displayName,
                score: contributionScore,
                commits: stats.commits,
                prsCreated: stats.prsCreated,
                prsReviewed: stats.prsReviewed,
                linesChanged: stats.linesAdded + stats.linesDeleted
            });
        }

        // 기여도 순으로 정렬
        totalStats.topContributors.sort((a, b) => b.score - a.score);

        return totalStats;
    }

    /**
     * 이전 기간과 비교하여 변화율 계산
     */
    async calculatePeriodComparison(currentStats, previousStartDate, previousEndDate) {
        try {
            const previousStats = await this.analyzeTeamContributions(previousStartDate, previousEndDate);
            const comparison = {};

            for (const [username, current] of Object.entries(currentStats)) {
                const previous = previousStats[username];
                if (previous) {
                    comparison[username] = {
                        commits: this.calculatePercentageChange(previous.commits, current.commits),
                        prsCreated: this.calculatePercentageChange(previous.prsCreated, current.prsCreated),
                        prsReviewed: this.calculatePercentageChange(previous.prsReviewed, current.prsReviewed),
                        linesChanged: this.calculatePercentageChange(
                            previous.linesAdded + previous.linesDeleted,
                            current.linesAdded + current.linesDeleted
                        )
                    };
                } else {
                    comparison[username] = {
                        commits: 'NEW',
                        prsCreated: 'NEW',
                        prsReviewed: 'NEW',
                        linesChanged: 'NEW'
                    };
                }
            }

            return comparison;

        } catch (error) {
            logger.error(`Failed to calculate period comparison: ${error.message}`);
            return {};
        }
    }

    /**
     * 변화율 계산
     */
    calculatePercentageChange(oldValue, newValue) {
        if (oldValue === 0) return newValue > 0 ? 100 : 0;
        return Math.round(((newValue - oldValue) / oldValue) * 100);
    }

    /**
     * 설정 유효성 검사
     */
    validateConfig() {
        const errors = [];

        if (!this.config.githubToken) {
            errors.push('GitHub token is required');
        }

        if (!this.config.repositories || this.config.repositories.length === 0) {
            errors.push('At least one repository must be configured');
        }

        if (!this.config.teamMembers || this.config.teamMembers.length === 0) {
            errors.push('At least one team member must be configured');
        }

        if (this.config.teamMembers) {
            for (const member of this.config.teamMembers) {
                if (!member.githubUsername) {
                    errors.push(`Team member missing GitHub username: ${member.displayName || 'unknown'}`);
                }
            }
        }

        return errors;
    }
}

module.exports = GitHubAnalyzer;
