// GitHub 데이터 수집 모듈
// GitHub REST API를 통해 리포지토리 데이터를 주기적으로 수집

const { Octokit } = require('@octokit/rest');
const logger = require('../../logger');

class GitHubCollector {
    constructor(config) {
        this.config = config;
        this.octokit = new Octokit({
            auth: config.githubToken,
            baseUrl: config.githubBaseUrl || 'https://api.github.com'
        });
        this.rateLimitRemaining = 5000;
        this.rateLimitReset = null;
    }

    /**
     * 리포지토리 기본 정보 수집
     */
    async collectRepositoryInfo(owner, repo) {
        try {
            const { data } = await this.octokit.repos.get({
                owner,
                repo
            });

            return {
                id: data.id,
                name: data.name,
                fullName: data.full_name,
                description: data.description,
                language: data.language,
                stars: data.stargazers_count,
                forks: data.forks_count,
                openIssues: data.open_issues_count,
                defaultBranch: data.default_branch,
                createdAt: data.created_at,
                updatedAt: data.updated_at,
                size: data.size
            };
        } catch (error) {
            logger.error(`Failed to collect repository info for ${owner}/${repo}: ${error.message}`);
            return null;
        }
    }

    /**
     * 기간별 커밋 수집
     */
    async collectCommits(owner, repo, author = null, since = null, until = null) {
        try {
            const params = {
                owner,
                repo,
                per_page: 100
            };

            if (author) params.author = author;
            if (since) params.since = `${since}T00:00:00Z`;
            if (until) params.until = `${until}T23:59:59Z`;

            const commits = await this.octokit.paginate(
                this.octokit.repos.listCommits,
                params
            );

            return commits.map(commit => ({
                sha: commit.sha,
                message: commit.commit.message,
                author: commit.author?.login || commit.commit.author.name,
                date: commit.commit.author.date,
                url: commit.html_url,
                stats: null // 나중에 별도로 수집
            }));
        } catch (error) {
            logger.error(`Failed to collect commits for ${owner}/${repo}: ${error.message}`);
            return [];
        }
    }

    /**
     * 커밋 통계 수집 (변경 라인 수 등)
     */
    async collectCommitStats(owner, repo, commitSha) {
        try {
            const { data } = await this.octokit.repos.getCommit({
                owner,
                repo,
                ref: commitSha
            });

            return {
                sha: commitSha,
                additions: data.stats.additions,
                deletions: data.stats.deletions,
                total: data.stats.total,
                files: data.files.map(file => ({
                    filename: file.filename,
                    additions: file.additions,
                    deletions: file.deletions,
                    changes: file.changes,
                    status: file.status
                }))
            };
        } catch (error) {
            logger.debug(`Failed to collect commit stats for ${commitSha}: ${error.message}`);
            return null;
        }
    }

    /**
     * Pull Request 수집
     */
    async collectPullRequests(owner, repo, state = 'all', author = null, since = null, until = null) {
        try {
            const params = {
                owner,
                repo,
                state,
                sort: 'created',
                direction: 'desc',
                per_page: 100
            };

            const prs = await this.octokit.paginate(
                this.octokit.pulls.list,
                params
            );

            let filteredPrs = prs;

            // 작성자 필터링
            if (author) {
                filteredPrs = filteredPrs.filter(pr => pr.user.login === author);
            }

            // 날짜 필터링
            if (since || until) {
                filteredPrs = filteredPrs.filter(pr => {
                    const createdDate = new Date(pr.created_at);
                    if (since && createdDate < new Date(since)) return false;
                    if (until && createdDate > new Date(until)) return false;
                    return true;
                });
            }

            return filteredPrs.map(pr => ({
                number: pr.number,
                title: pr.title,
                author: pr.user.login,
                state: pr.state,
                createdAt: pr.created_at,
                updatedAt: pr.updated_at,
                closedAt: pr.closed_at,
                mergedAt: pr.merged_at,
                url: pr.html_url,
                additions: pr.additions,
                deletions: pr.deletions,
                changedFiles: pr.changed_files,
                comments: pr.comments,
                reviewComments: pr.review_comments,
                commits: pr.commits
            }));
        } catch (error) {
            logger.error(`Failed to collect pull requests for ${owner}/${repo}: ${error.message}`);
            return [];
        }
    }

    /**
     * PR 리뷰 수집
     */
    async collectPullRequestReviews(owner, repo, pullNumber = null, reviewer = null, since = null, until = null) {
        try {
            const reviews = [];
            
            // 특정 PR의 리뷰 수집
            if (pullNumber) {
                const { data } = await this.octokit.pulls.listReviews({
                    owner,
                    repo,
                    pull_number: pullNumber
                });
                reviews.push(...data);
            } else {
                // 모든 PR의 리뷰 수집
                const prs = await this.collectPullRequests(owner, repo, 'all', null, since, until);
                for (const pr of prs) {
                    const { data } = await this.octokit.pulls.listReviews({
                        owner,
                        repo,
                        pull_number: pr.number
                    });
                    reviews.push(...data.map(review => ({
                        ...review,
                        pull_number: pr.number,
                        pull_title: pr.title
                    })));
                }
            }

            let filteredReviews = reviews;

            // 리뷰어 필터링
            if (reviewer) {
                filteredReviews = filteredReviews.filter(review => review.user.login === reviewer);
            }

            // 날짜 필터링
            if (since || until) {
                filteredReviews = filteredReviews.filter(review => {
                    const submittedDate = new Date(review.submitted_at);
                    if (since && submittedDate < new Date(since)) return false;
                    if (until && submittedDate > new Date(until)) return false;
                    return true;
                });
            }

            return filteredReviews.map(review => ({
                id: review.id,
                pullNumber: review.pull_number,
                pullTitle: review.pull_title,
                reviewer: review.user.login,
                state: review.state,
                body: review.body,
                submittedAt: review.submitted_at,
                url: review.html_url
            }));
        } catch (error) {
            logger.error(`Failed to collect pull request reviews for ${owner}/${repo}: ${error.message}`);
            return [];
        }
    }

    /**
     * 이슈 수집
     */
    async collectIssues(owner, repo, state = 'all', creator = null, assignee = null, since = null, until = null) {
        try {
            const params = {
                owner,
                repo,
                state,
                sort: 'created',
                direction: 'desc',
                per_page: 100
            };

            if (creator) params.creator = creator;
            if (assignee) params.assignee = assignee;
            if (since) params.since = `${since}T00:00:00Z`;

            const issues = await this.octokit.paginate(
                this.octokit.issues.listForRepo,
                params
            );

            let filteredIssues = issues.filter(issue => !issue.pull_request); // PR 제외

            // 날짜 필터링
            if (until) {
                filteredIssues = filteredIssues.filter(issue => {
                    const createdDate = new Date(issue.created_at);
                    return createdDate <= new Date(until);
                });
            }

            return filteredIssues.map(issue => ({
                number: issue.number,
                title: issue.title,
                body: issue.body,
                state: issue.state,
                creator: issue.user.login,
                assignees: issue.assignees.map(assignee => assignee.login),
                labels: issue.labels.map(label => label.name),
                createdAt: issue.created_at,
                updatedAt: issue.updated_at,
                closedAt: issue.closed_at,
                url: issue.html_url,
                comments: issue.comments
            }));
        } catch (error) {
            logger.error(`Failed to collect issues for ${owner}/${repo}: ${error.message}`);
            return [];
        }
    }

    /**
     * 릴리즈 정보 수집
     */
    async collectReleases(owner, repo, since = null, until = null) {
        try {
            const { data: releases } = await this.octokit.repos.listReleases({
                owner,
                repo,
                per_page: 100
            });

            let filteredReleases = releases;

            // 날짜 필터링
            if (since || until) {
                filteredReleases = filteredReleases.filter(release => {
                    const publishedDate = new Date(release.published_at);
                    if (since && publishedDate < new Date(since)) return false;
                    if (until && publishedDate > new Date(until)) return false;
                    return true;
                });
            }

            return filteredReleases.map(release => ({
                id: release.id,
                tagName: release.tag_name,
                name: release.name,
                body: release.body,
                draft: release.draft,
                prerelease: release.prerelease,
                createdAt: release.created_at,
                publishedAt: release.published_at,
                author: release.author.login,
                url: release.html_url
            }));
        } catch (error) {
            logger.error(`Failed to collect releases for ${owner}/${repo}: ${error.message}`);
            return [];
        }
    }

    /**
     * Rate Limit 상태 확인
     */
    async checkRateLimit() {
        try {
            const { data } = await this.octokit.rateLimit.get();
            this.rateLimitRemaining = data.rate.remaining;
            this.rateLimitReset = new Date(data.rate.reset * 1000);
            
            logger.debug(`GitHub API Rate Limit: ${this.rateLimitRemaining} remaining, resets at ${this.rateLimitReset}`);
            
            return {
                remaining: this.rateLimitRemaining,
                reset: this.rateLimitReset,
                limit: data.rate.limit
            };
        } catch (error) {
            logger.error(`Failed to check rate limit: ${error.message}`);
            return null;
        }
    }

    /**
     * 전체 리포지토리 데이터 수집
     */
    async collectFullRepositoryData(owner, repo, startDate, endDate, teamMembers = []) {
        try {
            logger.info(`Collecting full repository data for ${owner}/${repo}`);
            
            const repoData = {
                repository: await this.collectRepositoryInfo(owner, repo),
                commits: {},
                pullRequests: {},
                reviews: {},
                issues: {},
                releases: await this.collectReleases(owner, repo, startDate, endDate)
            };

            // 팀원별 데이터 수집
            for (const member of teamMembers) {
                const username = member.githubUsername;
                logger.debug(`Collecting data for ${username}`);

                repoData.commits[username] = await this.collectCommits(owner, repo, username, startDate, endDate);
                repoData.pullRequests[username] = await this.collectPullRequests(owner, repo, 'all', username, startDate, endDate);
                repoData.reviews[username] = await this.collectPullRequestReviews(owner, repo, null, username, startDate, endDate);
                repoData.issues[username] = await this.collectIssues(owner, repo, 'all', username, null, startDate, endDate);

                // Rate Limit 체크
                await this.checkRateLimit();
                if (this.rateLimitRemaining < 100) {
                    logger.warn(`GitHub API rate limit running low: ${this.rateLimitRemaining} remaining`);
                }
            }

            logger.info(`Full repository data collection completed for ${owner}/${repo}`);
            return repoData;
        } catch (error) {
            logger.error(`Failed to collect full repository data for ${owner}/${repo}: ${error.message}`);
            throw error;
        }
    }

    /**
     * 배치 데이터 수집
     */
    async collectBatchData(repositories, startDate, endDate, teamMembers = []) {
        try {
            logger.info(`Starting batch data collection for ${repositories.length} repositories`);
            
            const batchData = {};
            
            for (const repo of repositories) {
                const repoKey = `${repo.owner}/${repo.name}`;
                logger.info(`Collecting data for repository: ${repoKey}`);
                
                batchData[repoKey] = await this.collectFullRepositoryData(
                    repo.owner,
                    repo.name,
                    startDate,
                    endDate,
                    teamMembers
                );
                
                // API 호출 간격 조정
                await this.delay(1000); // 1초 대기
            }
            
            logger.info('Batch data collection completed');
            return batchData;
        } catch (error) {
            logger.error(`Batch data collection failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * 지연 함수
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = GitHubCollector;
