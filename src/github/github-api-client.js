// src/github/github-api-client.js
// GitHub API 클라이언트 - API 호출 담당

const fetch = require('node-fetch');
const logger = require('../../logger');

class GitHubApiClient {
    constructor(config) {
        this.config = config;
    }

    /**
     * GitHub API 호출
     */
    async makeApiCall(endpoint, method = 'GET', body = null) {
        if (!this.config.githubToken) {
            throw new Error('GitHub token not configured');
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
     * 리포지토리 커밋 조회
     */
    async getRepositoryCommits(owner, repo, since, until) {
        try {
            const endpoint = `/repos/${owner}/${repo}/commits`;
            let url = endpoint + '?per_page=100';

            if (since) url += `&since=${since}`;
            if (until) url += `&until=${until}`;

            const commits = await this.makeApiCall(url);

            const detailedCommits = [];
            for (const commit of commits.slice(0, 50)) {
                try {
                    const detailedCommit = await this.makeApiCall(`/repos/${owner}/${repo}/commits/${commit.sha}`);
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

    /**
     * 리포지토리 Pull Request 조회
     */
    async getRepositoryPullRequests(owner, repo, since, until) {
        try {
            const endpoint = `/repos/${owner}/${repo}/pulls`;
            const url = endpoint + '?state=all&per_page=100&sort=created&direction=desc';

            const pullRequests = await this.makeApiCall(url);

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
                    const detailedPR = await this.makeApiCall(`/repos/${owner}/${repo}/pulls/${pr.number}`);
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

    /**
     * 리포지토리 PR 댓글 조회
     */
    async getRepositoryPRComments(owner, repo, since, until) {
        try {
            const endpoint = `/repos/${owner}/${repo}/pulls/comments`;
            const url = endpoint + '?per_page=100&sort=updated&direction=desc';

            const comments = await this.makeApiCall(url);

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

    /**
     * 리포지토리 이슈 조회
     */
    async getRepositoryIssues(owner, repo, since, until) {
        try {
            const endpoint = `/repos/${owner}/${repo}/issues`;
            const url = endpoint + '?state=all&per_page=100&sort=updated&direction=desc';

            const issues = await this.makeApiCall(url);

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

    /**
     * 리포지토리 리뷰 조회
     */
    async getRepositoryReviews(owner, repo, since, until) {
        try {
            const prs = await this.getRepositoryPullRequests(owner, repo, since, until);
            const allReviews = [];

            for (const pr of prs.slice(0, 30)) {
                try {
                    const reviews = await this.makeApiCall(`/repos/${owner}/${repo}/pulls/${pr.number}/reviews`);

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
}

module.exports = GitHubApiClient;