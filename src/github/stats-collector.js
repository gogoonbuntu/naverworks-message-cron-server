// src/github/stats-collector.js
// 통계 수집 서비스 - GitHub 데이터 수집 및 분석

const logger = require('../../logger');

class StatsCollector {
    constructor(apiClient, teamMapper) {
        this.apiClient = apiClient;
        this.teamMapper = teamMapper;
    }

    /**
     * 팀 통계 수집 작업
     */
    async collectTeamStats(startDate, endDate, repositories, teamMapping, updateProgress) {
        const since = new Date(startDate).toISOString();
        const until = new Date(endDate).toISOString();

        const teamStats = {};

        // 팀원 매핑 캐시 새로고침
        this.teamMapper.initializeMemberMappingCache(teamMapping);

        // 팀 통계 초기화
        Object.keys(teamMapping || {}).forEach(memberId => {
            const member = teamMapping[memberId];
            teamStats[memberId] = {
                memberId: member.memberId || memberId,
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
                repositories: new Set()
            };
        });

        updateProgress(10, '리포지토리 목록을 확인하고 있습니다...', 'initialization');

        const activeRepositories = repositories.filter(repo => repo.enabled);
        const totalRepos = activeRepositories.length;

        if (totalRepos === 0) {
            throw new Error('활성화된 리포지토리가 없습니다.');
        }

        let processedRepos = 0;

        // 매핑 통계 추적
        const mappingStats = {
            totalActivities: 0,
            successfulMappings: 0,
            failedMappings: 0,
            failedUsers: new Set(),
            mappingMethods: {
                exactMatch: 0,
                fuzzyMatch: 0,
                patternMatch: 0
            }
        };

        for (const repo of activeRepositories) {
            const repoProgress = Math.round(20 + (processedRepos / totalRepos) * 60);
            updateProgress(repoProgress, `리포지토리 ${repo.name} 분석 중...`, 'data_collection');

            try {
                // 각 리포지토리의 활동 데이터 수집
                await this.collectRepositoryStats(repo, since, until, teamStats, mappingStats);
                
                processedRepos++;
                await new Promise(resolve => setTimeout(resolve, 1000));

            } catch (error) {
                logger.error(`Error collecting stats from ${repo.owner}/${repo.name}: ${error.message}`, error);
            }
        }

        // 매핑 통계 출력
        this.logMappingStats(mappingStats);

        updateProgress(85, '통계 데이터를 처리하고 있습니다...', 'processing');

        // 통계 데이터 후처리
        Object.keys(teamStats).forEach(memberId => {
            teamStats[memberId].repositories = Array.from(teamStats[memberId].repositories);
        });

        updateProgress(95, '리포트 메시지를 생성하고 있습니다...', 'message_generation');

        return teamStats;
    }

    /**
     * 개별 리포지토리 통계 수집
     */
    async collectRepositoryStats(repo, since, until, teamStats, mappingStats) {
        // 커밋 정보 수집
        const commits = await this.apiClient.getRepositoryCommits(repo.owner, repo.name, since, until);
        logger.info(`Repository ${repo.name}: Found ${commits.length} commits`);

        this.processCommits(commits, repo, teamStats, mappingStats);

        // PR 정보 수집
        const pullRequests = await this.apiClient.getRepositoryPullRequests(repo.owner, repo.name, since, until);
        logger.info(`Repository ${repo.name}: Found ${pullRequests.length} PRs`);

        this.processPullRequests(pullRequests, repo, teamStats, mappingStats);

        // PR 댓글 수집
        const prComments = await this.apiClient.getRepositoryPRComments(repo.owner, repo.name, since, until);
        logger.info(`Repository ${repo.name}: Found ${prComments.length} PR comments`);

        this.processPRComments(prComments, repo, teamStats, mappingStats);

        // 리뷰 수집
        const reviews = await this.apiClient.getRepositoryReviews(repo.owner, repo.name, since, until);
        logger.info(`Repository ${repo.name}: Found ${reviews.length} reviews`);

        this.processReviews(reviews, repo, teamStats, mappingStats);

        // 이슈 수집
        const issues = await this.apiClient.getRepositoryIssues(repo.owner, repo.name, since, until);
        logger.info(`Repository ${repo.name}: Found ${issues.length} issues`);

        this.processIssues(issues, repo, teamStats, mappingStats);
    }

    /**
     * 커밋 데이터 처리
     */
    processCommits(commits, repo, teamStats, mappingStats) {
        commits.forEach(commit => {
            mappingStats.totalActivities++;

            const member = this.teamMapper.findTeamMember(commit.author, commit.authorName, commit.authorEmail);

            if (member) {
                mappingStats.successfulMappings++;

                // 매핑 방법 추적
                const exactMatch = this.teamMapper.findExactMatch(commit.author, commit.authorName, commit.authorEmail);
                if (exactMatch) {
                    mappingStats.mappingMethods.exactMatch++;
                } else {
                    const fuzzyMatch = this.teamMapper.findFuzzyMatch(commit.author, commit.authorName, commit.authorEmail);
                    if (fuzzyMatch) {
                        mappingStats.mappingMethods.fuzzyMatch++;
                    } else {
                        mappingStats.mappingMethods.patternMatch++;
                    }
                }

                if (teamStats[member.memberId]) {
                    teamStats[member.memberId].commits++;
                    teamStats[member.memberId].linesAdded += commit.additions;
                    teamStats[member.memberId].linesDeleted += commit.deletions;
                    teamStats[member.memberId].repositories.add(repo.name);
                }

                this.teamMapper.logMappingResult(member, commit.author, commit.authorName, commit.authorEmail, '커밋', repo.name, commit.sha.substring(0,7));
            } else {
                mappingStats.failedMappings++;
                mappingStats.failedUsers.add(commit.author || commit.authorName || commit.authorEmail);
                this.teamMapper.logMappingResult(null, commit.author, commit.authorName, commit.authorEmail, '커밋', repo.name, commit.sha.substring(0,7));
            }
        });
    }

    /**
     * Pull Request 데이터 처리
     */
    processPullRequests(pullRequests, repo, teamStats, mappingStats) {
        pullRequests.forEach(pr => {
            mappingStats.totalActivities++;

            const member = this.teamMapper.findTeamMember(pr.author, null, null);

            if (member) {
                mappingStats.successfulMappings++;

                if (teamStats[member.memberId]) {
                    teamStats[member.memberId].pullRequests++;

                    if (pr.mergedAt) {
                        teamStats[member.memberId].pullRequestsMerged++;
                    } else if (pr.state === 'closed') {
                        teamStats[member.memberId].pullRequestsClosed++;
                    }

                    if (pr.additions > 0 || pr.deletions > 0) {
                        teamStats[member.memberId].linesAdded += pr.additions;
                        teamStats[member.memberId].linesDeleted += pr.deletions;
                    }

                    teamStats[member.memberId].repositories.add(repo.name);
                }

                this.teamMapper.logMappingResult(member, pr.author, null, null, 'PR', repo.name, `#${pr.number}`);
            } else {
                mappingStats.failedMappings++;
                mappingStats.failedUsers.add(pr.author);
                this.teamMapper.logMappingResult(null, pr.author, null, null, 'PR', repo.name, `#${pr.number}`);
            }
        });
    }

    /**
     * PR 댓글 데이터 처리
     */
    processPRComments(prComments, repo, teamStats, mappingStats) {
        prComments.forEach(comment => {
            mappingStats.totalActivities++;

            const member = this.teamMapper.findTeamMember(comment.author, null, null);

            if (member) {
                mappingStats.successfulMappings++;

                if (teamStats[member.memberId]) {
                    teamStats[member.memberId].prComments++;
                    teamStats[member.memberId].repositories.add(repo.name);
                }

                this.teamMapper.logMappingResult(member, comment.author, null, null, 'PR댓글', repo.name, `#${comment.prNumber}`);
            } else {
                mappingStats.failedMappings++;
                mappingStats.failedUsers.add(comment.author);
                this.teamMapper.logMappingResult(null, comment.author, null, null, 'PR댓글', repo.name, `#${comment.prNumber}`);
            }
        });
    }

    /**
     * 리뷰 데이터 처리
     */
    processReviews(reviews, repo, teamStats, mappingStats) {
        reviews.forEach(review => {
            mappingStats.totalActivities++;

            const member = this.teamMapper.findTeamMember(review.author, null, null);

            if (member) {
                mappingStats.successfulMappings++;

                if (teamStats[member.memberId]) {
                    teamStats[member.memberId].reviews++;
                    teamStats[member.memberId].repositories.add(repo.name);
                }

                this.teamMapper.logMappingResult(member, review.author, null, null, '리뷰', repo.name, `#${review.prNumber}`);
            } else {
                mappingStats.failedMappings++;
                mappingStats.failedUsers.add(review.author);
                this.teamMapper.logMappingResult(null, review.author, null, null, '리뷰', repo.name, `#${review.prNumber}`);
            }
        });
    }

    /**
     * 이슈 데이터 처리
     */
    processIssues(issues, repo, teamStats, mappingStats) {
        issues.forEach(issue => {
            mappingStats.totalActivities++;

            const member = this.teamMapper.findTeamMember(issue.author, null, null);

            if (member) {
                mappingStats.successfulMappings++;

                if (teamStats[member.memberId]) {
                    teamStats[member.memberId].issuesCreated++;
                    if (issue.state === 'closed') {
                        teamStats[member.memberId].issuesClosed++;
                    }
                    teamStats[member.memberId].repositories.add(repo.name);
                }

                this.teamMapper.logMappingResult(member, issue.author, null, null, '이슈', repo.name, `#${issue.number}`);
            } else {
                mappingStats.failedMappings++;
                mappingStats.failedUsers.add(issue.author);
                this.teamMapper.logMappingResult(null, issue.author, null, null, '이슈', repo.name, `#${issue.number}`);
            }
        });
    }

    /**
     * 매핑 통계 로깅
     */
    logMappingStats(mappingStats) {
        const mappingSuccessRate = mappingStats.totalActivities > 0 ?
            Math.round((mappingStats.successfulMappings / mappingStats.totalActivities) * 100) : 0;

        logger.info(`\n📊 팀원 매핑 통계 (개선된 버전):`);
        logger.info(`   총 활동: ${mappingStats.totalActivities}건`);
        logger.info(`   성공 매핑: ${mappingStats.successfulMappings}건`);
        logger.info(`   실패 매핑: ${mappingStats.failedMappings}건`);
        logger.info(`   성공률: ${mappingSuccessRate}%`);
        logger.info(`\n📈 매핑 방법별 통계:`);
        logger.info(`   정확 매핑: ${mappingStats.mappingMethods.exactMatch}건`);
        logger.info(`   퍼지 매핑: ${mappingStats.mappingMethods.fuzzyMatch}건`);
        logger.info(`   패턴 매핑: ${mappingStats.mappingMethods.patternMatch}건`);

        if (mappingStats.failedUsers.size > 0) {
            logger.warn(`❌ 매핑 실패 사용자: ${Array.from(mappingStats.failedUsers).join(', ')}`);
        }
    }

    /**
     * 개별 팀원 통계 조회
     */
    async getMemberStats(githubUsername, startDate, endDate, repositories, teamMapping) {
        const allStats = await this.collectTeamStats(startDate, endDate, repositories, teamMapping, (progress, message) => {
            logger.debug(`Member stats progress: ${progress}% - ${message}`);
        });

        const memberStats = Object.values(allStats).find(stats => 
            stats.githubUsername === githubUsername
        );

        if (!memberStats) {
            return {
                success: false,
                message: `GitHub 사용자 ${githubUsername}를 찾을 수 없습니다.`
            };
        }

        return {
            success: true,
            data: memberStats,
            period: { startDate, endDate }
        };
    }

    /**
     * 활동 부족 멤버 찾기
     */
    findLowActivityMembers(teamStats, threshold = 1) {
        const lowActivityMembers = [];

        Object.values(teamStats).forEach(member => {
            const totalActivity = member.commits + member.pullRequests + member.reviews;
            
            if (totalActivity < threshold) {
                lowActivityMembers.push({
                    name: member.name,
                    githubUsername: member.githubUsername,
                    totalActivity: totalActivity,
                    commits: member.commits,
                    pullRequests: member.pullRequests,
                    reviews: member.reviews
                });
            }
        });

        return lowActivityMembers;
    }
}

module.exports = StatsCollector;