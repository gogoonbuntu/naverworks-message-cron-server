// src/services/github-service.js
// GitHub 통합 서비스 - 개선된 팀원 매핑 기능

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

        // 팀원 매핑 캐시 - 다중 키로 빠른 검색
        this.memberMappingCache = new Map();
        // 역매핑 캐시 - 실제 GitHub 사용자명에서 팀원 정보로
        this.reverseMappingCache = new Map();

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

                // config.json에서 팀원 정보 동기화
                this.syncTeamMembersWithMainConfig();

                // 팀원 매핑 캐시 초기화
                this.initializeMemberMappingCache();

                this.isEnabled = this.validateConfig();

                if (this.isEnabled) {
                    logger.info('GitHub service enabled successfully');
                    logger.info(`Monitoring ${this.config.repositories?.length || 0} repositories`);
                    logger.info(`Team members: ${Object.keys(this.config.teamMapping || {}).length}`);
                    logger.info(`Member mapping cache initialized with ${this.memberMappingCache.size} entries`);
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
     * 개선된 버전: id와 githubUsername 모두 활용
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
                    // githubUsername이 없으면 id를 기본값으로 사용
                    githubUsername = member.id;
                }

                newTeamMapping[member.id] = {
                    // 원본 id도 보존
                    memberId: member.id,
                    githubUsername: githubUsername,
                    name: member.name || existingMember?.name || member.id,
                    email: existingMember?.email || `${member.id}@danal.co.kr`,
                    // 추가 정보 보존
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

                // 매핑 세부사항 로그
                Object.entries(newTeamMapping).forEach(([id, data]) => {
                    logger.debug(`  ${id} -> GitHub: ${data.githubUsername}, Name: ${data.name}`);
                });
            }

        } catch (error) {
            logger.error(`Error syncing team members: ${error.message}`, error);
        }
    }

    /**
     * 팀원 매핑 캐시 초기화 - 개선된 버전
     * 더 많은 매핑 방식과 역매핑 캐시 지원
     */
    initializeMemberMappingCache() {
        this.memberMappingCache.clear();
        this.reverseMappingCache.clear();

        if (!this.config.teamMapping) {
            return;
        }

        Object.entries(this.config.teamMapping).forEach(([memberId, memberData]) => {
            const member = { memberId, ...memberData };

            // === 정방향 매핑 (다양한 키로 팀원 찾기) ===

            // 1. 원본 멤버 ID로 매핑
            this.memberMappingCache.set(memberId.toLowerCase(), member);

            // 2. GitHub 사용자명으로 매핑 (대소문자 구분 없음)
            if (memberData.githubUsername) {
                this.memberMappingCache.set(memberData.githubUsername.toLowerCase(), member);
            }

            // 3. 이메일로 매핑
            if (memberData.email) {
                this.memberMappingCache.set(memberData.email.toLowerCase(), member);

                // 4. 이메일의 사용자명 부분으로 매핑
                if (memberData.email.includes('@')) {
                    const emailUsername = memberData.email.split('@')[0];
                    this.memberMappingCache.set(emailUsername.toLowerCase(), member);
                }
            }

            // 5. 실제 이름으로 매핑
            if (memberData.name) {
                this.memberMappingCache.set(memberData.name.toLowerCase(), member);

                // 6. 이름의 변형들로 매핑
                const nameVariations = this.generateNameVariations(memberData.name);
                nameVariations.forEach(variation => {
                    this.memberMappingCache.set(variation.toLowerCase(), member);
                });
            }

            // === 역매핑 (GitHub 사용자명에서 팀원 정보로) ===

            // GitHub 사용자명 -> 팀원 정보
            if (memberData.githubUsername) {
                this.reverseMappingCache.set(memberData.githubUsername.toLowerCase(), member);
            }

            // 멤버 ID -> 팀원 정보 (ID와 GitHub 사용자명이 다를 수 있음)
            this.reverseMappingCache.set(memberId.toLowerCase(), member);
        });

        logger.info(`Member mapping cache initialized:`);
        logger.info(`  - Forward mapping: ${this.memberMappingCache.size} entries`);
        logger.info(`  - Reverse mapping: ${this.reverseMappingCache.size} entries`);

        // 디버그: 매핑 세부사항 출력
        logger.debug('Mapping cache entries:');
        Array.from(this.memberMappingCache.entries()).forEach(([key, member]) => {
            logger.debug(`  ${key} -> ${member.name} (${member.githubUsername})`);
        });
    }

    /**
     * 이름의 다양한 변형 생성
     * 한국어 이름의 경우 공백 제거, 영어 이름의 경우 FirstName, LastName 분리 등
     */
    generateNameVariations(name) {
        const variations = [];

        if (!name) return variations;

        // 공백 제거
        const noSpaceName = name.replace(/\s+/g, '');
        if (noSpaceName !== name) {
            variations.push(noSpaceName);
        }

        // 영어 이름인 경우 FirstName, LastName 분리
        if (/^[a-zA-Z\s]+$/.test(name)) {
            const parts = name.split(/\s+/);
            if (parts.length >= 2) {
                variations.push(parts[0]); // FirstName
                variations.push(parts[parts.length - 1]); // LastName
            }
        }

        // 한국어 이름인 경우 성+이름 분리
        if (/[가-힣]/.test(name)) {
            if (name.length >= 2) {
                variations.push(name.substring(1)); // 이름 부분
                if (name.length >= 3) {
                    variations.push(name.substring(0, 1)); // 성 부분
                }
            }
        }

        return variations;
    }

    /**
     * 개선된 팀원 찾기 함수
     * 더 정교한 매핑 로직으로 매핑 성공률 향상
     */
    findTeamMember(githubUsername, authorName, authorEmail) {
        // 1차: 정확한 매핑 시도
        const exactMatch = this.findExactMatch(githubUsername, authorName, authorEmail);
        if (exactMatch) {
            return exactMatch;
        }

        // 2차: 퍼지 매핑 시도
        const fuzzyMatch = this.findFuzzyMatch(githubUsername, authorName, authorEmail);
        if (fuzzyMatch) {
            return fuzzyMatch;
        }

        // 3차: 패턴 기반 매핑 시도
        const patternMatch = this.findPatternMatch(githubUsername, authorName, authorEmail);
        if (patternMatch) {
            return patternMatch;
        }

        return null;
    }

    /**
     * 정확한 매핑 시도
     */
    findExactMatch(githubUsername, authorName, authorEmail) {
        // 1. GitHub 사용자명으로 직접 매핑
        if (githubUsername) {
            const member = this.memberMappingCache.get(githubUsername.toLowerCase());
            if (member) {
                return member;
            }
        }

        // 2. 이메일로 매핑
        if (authorEmail) {
            const member = this.memberMappingCache.get(authorEmail.toLowerCase());
            if (member) {
                return member;
            }

            // 이메일의 사용자명 부분으로 매핑
            if (authorEmail.includes('@')) {
                const emailUsername = authorEmail.split('@')[0];
                const memberByEmailUser = this.memberMappingCache.get(emailUsername.toLowerCase());
                if (memberByEmailUser) {
                    return memberByEmailUser;
                }
            }
        }

        // 3. 이름으로 매핑
        if (authorName) {
            const member = this.memberMappingCache.get(authorName.toLowerCase());
            if (member) {
                return member;
            }
        }

        return null;
    }

    /**
     * 퍼지 매핑 시도
     */
    findFuzzyMatch(githubUsername, authorName, authorEmail) {
        // 1. GitHub 사용자명과 이메일 사용자명이 유사한 경우
        if (githubUsername && authorEmail && authorEmail.includes('@')) {
            const emailUsername = authorEmail.split('@')[0];

            // 완전 일치
            if (githubUsername.toLowerCase() === emailUsername.toLowerCase()) {
                const member = this.memberMappingCache.get(emailUsername.toLowerCase());
                if (member) {
                    return member;
                }
            }

            // 부분 일치 (길이 차이가 2 이하)
            if (Math.abs(githubUsername.length - emailUsername.length) <= 2) {
                const similarity = this.calculateStringSimilarity(githubUsername.toLowerCase(), emailUsername.toLowerCase());
                if (similarity > 0.8) {
                    const member = this.memberMappingCache.get(emailUsername.toLowerCase());
                    if (member) {
                        return member;
                    }
                }
            }
        }

        // 2. 이름의 부분 매칭
        if (authorName) {
            for (const [key, member] of this.memberMappingCache.entries()) {
                if (member.name && this.isNameSimilar(authorName, member.name)) {
                    return member;
                }
            }
        }

        return null;
    }

    /**
     * 패턴 기반 매핑 시도
     */
    findPatternMatch(githubUsername, authorName, authorEmail) {
        // 1. GitHub 사용자명에서 패턴 추출
        if (githubUsername) {
            // 숫자 제거 패턴 (예: tmddud333 -> tmddud)
            const withoutNumbers = githubUsername.replace(/\d+$/, '');
            if (withoutNumbers !== githubUsername && withoutNumbers.length >= 3) {
                const member = this.memberMappingCache.get(withoutNumbers.toLowerCase());
                if (member) {
                    return member;
                }
            }

            // 하이픈/언더스코어 제거 패턴
            const withoutSeparators = githubUsername.replace(/[-_]/g, '');
            if (withoutSeparators !== githubUsername) {
                const member = this.memberMappingCache.get(withoutSeparators.toLowerCase());
                if (member) {
                    return member;
                }
            }

            // 접두사 제거 패턴 (예: danal-tmddud333 -> tmddud333)
            const prefixPatterns = ['danal-', 'dev-', 'user-'];
            for (const prefix of prefixPatterns) {
                if (githubUsername.toLowerCase().startsWith(prefix)) {
                    const withoutPrefix = githubUsername.substring(prefix.length);
                    const member = this.memberMappingCache.get(withoutPrefix.toLowerCase());
                    if (member) {
                        return member;
                    }
                }
            }
        }

        // 2. 이메일 도메인 기반 매핑
        if (authorEmail && authorEmail.includes('@')) {
            const [emailUser, domain] = authorEmail.split('@');

            // 회사 도메인인 경우 사용자명으로 매핑 시도
            if (domain.toLowerCase().includes('danal') || domain.toLowerCase().includes('company')) {
                const member = this.memberMappingCache.get(emailUser.toLowerCase());
                if (member) {
                    return member;
                }
            }
        }

        return null;
    }

    /**
     * 문자열 유사도 계산 (Levenshtein distance 기반)
     */
    calculateStringSimilarity(str1, str2) {
        if (!str1 || !str2) return 0;

        const len1 = str1.length;
        const len2 = str2.length;

        if (len1 === 0) return len2 === 0 ? 1 : 0;
        if (len2 === 0) return 0;

        const matrix = [];
        for (let i = 0; i <= len1; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= len2; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= len1; i++) {
            for (let j = 1; j <= len2; j++) {
                if (str1[i - 1] === str2[j - 1]) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j] + 1,     // deletion
                        matrix[i][j - 1] + 1,     // insertion
                        matrix[i - 1][j - 1] + 1  // substitution
                    );
                }
            }
        }

        const distance = matrix[len1][len2];
        const maxLength = Math.max(len1, len2);
        return (maxLength - distance) / maxLength;
    }

    /**
     * 이름 유사도 검사
     */
    isNameSimilar(name1, name2) {
        if (!name1 || !name2) return false;

        const n1 = name1.toLowerCase().replace(/\s+/g, '');
        const n2 = name2.toLowerCase().replace(/\s+/g, '');

        // 완전 일치
        if (n1 === n2) return true;

        // 부분 일치 (한쪽이 다른 쪽을 포함)
        if (n1.includes(n2) || n2.includes(n1)) return true;

        // 유사도 기반 매칭
        const similarity = this.calculateStringSimilarity(n1, n2);
        return similarity > 0.7;
    }

    /**
     * 매핑 결과 로그 출력 - 개선된 버전
     */
    logMappingResult(member, githubUsername, authorName, authorEmail, activityType, repo, identifier) {
        if (member) {
            logger.info(`✅ ${member.name} (ID: ${member.memberId}, GitHub: ${member.githubUsername}) | ${repo} | ${activityType} | ${identifier}`);
        } else {
            logger.warn(`❌ 매핑 실패 | ${repo} | ${activityType} | ${identifier}`);
            logger.warn(`   - GitHub사용자명: ${githubUsername || 'N/A'}`);
            logger.warn(`   - 커밋작성자명: ${authorName || 'N/A'}`);
            logger.warn(`   - 커밋이메일: ${authorEmail || 'N/A'}`);
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

        // 팀원 매핑 캐시 새로고침
        this.initializeMemberMappingCache();

        Object.keys(this.config.teamMapping || {}).forEach(memberId => {
            const member = this.config.teamMapping[memberId];
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

        for (const repo of repositories) {
            if (!repo.enabled) continue;

            const repoProgress = Math.round(20 + (processedRepos / totalRepos) * 60);
            updateProgress(repoProgress, `리포지토리 ${repo.name} 분석 중...`, 'data_collection');

            try {
                // 커밋 정보 수집
                const commits = await this.getRepositoryCommits(repo.owner, repo.name, since, until);
                logger.info(`Repository ${repo.name}: Found ${commits.length} commits`);

                commits.forEach(commit => {
                    mappingStats.totalActivities++;

                    const member = this.findTeamMember(commit.author, commit.authorName, commit.authorEmail);

                    if (member) {
                        mappingStats.successfulMappings++;

                        // 매핑 방법 추적
                        const exactMatch = this.findExactMatch(commit.author, commit.authorName, commit.authorEmail);
                        if (exactMatch) {
                            mappingStats.mappingMethods.exactMatch++;
                        } else {
                            const fuzzyMatch = this.findFuzzyMatch(commit.author, commit.authorName, commit.authorEmail);
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

                        this.logMappingResult(member, commit.author, commit.authorName, commit.authorEmail, '커밋', repo.name, commit.sha.substring(0,7));
                    } else {
                        mappingStats.failedMappings++;
                        mappingStats.failedUsers.add(commit.author || commit.authorName || commit.authorEmail);
                        this.logMappingResult(null, commit.author, commit.authorName, commit.authorEmail, '커밋', repo.name, commit.sha.substring(0,7));
                    }
                });

                // PR 정보 수집
                const pullRequests = await this.getRepositoryPullRequests(repo.owner, repo.name, since, until);
                logger.info(`Repository ${repo.name}: Found ${pullRequests.length} PRs`);

                pullRequests.forEach(pr => {
                    mappingStats.totalActivities++;

                    const member = this.findTeamMember(pr.author, null, null);

                    if (member) {
                        mappingStats.successfulMappings++;

                        if (teamStats[member.memberId]) {
                            teamStats[member.memberId].pullRequests++;

                            if (pr.mergedAt) {
                                teamStats[member.memberId].pullRequestsMerged++;
                                const processingTime = new Date(pr.mergedAt) - new Date(pr.createdAt);
                                const processingDays = processingTime / (1000 * 60 * 60 * 24);
                                teamStats[member.memberId].prProcessingTimes.push(processingDays);
                            } else if (pr.state === 'closed') {
                                teamStats[member.memberId].pullRequestsClosed++;
                            }

                            if (pr.additions > 0 || pr.deletions > 0) {
                                teamStats[member.memberId].linesAdded += pr.additions;
                                teamStats[member.memberId].linesDeleted += pr.deletions;
                            }

                            teamStats[member.memberId].repositories.add(repo.name);
                        }

                        this.logMappingResult(member, pr.author, null, null, 'PR', repo.name, `#${pr.number}`);
                    } else {
                        mappingStats.failedMappings++;
                        mappingStats.failedUsers.add(pr.author);
                        this.logMappingResult(null, pr.author, null, null, 'PR', repo.name, `#${pr.number}`);
                    }
                });

                // PR 댓글 수집
                const prComments = await this.getRepositoryPRComments(repo.owner, repo.name, since, until);
                logger.info(`Repository ${repo.name}: Found ${prComments.length} PR comments`);

                prComments.forEach(comment => {
                    mappingStats.totalActivities++;

                    const member = this.findTeamMember(comment.author, null, null);

                    if (member) {
                        mappingStats.successfulMappings++;

                        if (teamStats[member.memberId]) {
                            teamStats[member.memberId].prComments++;
                            teamStats[member.memberId].repositories.add(repo.name);
                        }

                        this.logMappingResult(member, comment.author, null, null, 'PR댓글', repo.name, `#${comment.prNumber}`);
                    } else {
                        mappingStats.failedMappings++;
                        mappingStats.failedUsers.add(comment.author);
                        this.logMappingResult(null, comment.author, null, null, 'PR댓글', repo.name, `#${comment.prNumber}`);
                    }
                });

                // 리뷰 수집
                const reviews = await this.getRepositoryReviews(repo.owner, repo.name, since, until);
                logger.info(`Repository ${repo.name}: Found ${reviews.length} reviews`);

                reviews.forEach(review => {
                    mappingStats.totalActivities++;

                    const member = this.findTeamMember(review.author, null, null);

                    if (member) {
                        mappingStats.successfulMappings++;

                        if (teamStats[member.memberId]) {
                            teamStats[member.memberId].reviews++;
                            teamStats[member.memberId].repositories.add(repo.name);
                        }

                        this.logMappingResult(member, review.author, null, null, '리뷰', repo.name, `#${review.prNumber}`);
                    } else {
                        mappingStats.failedMappings++;
                        mappingStats.failedUsers.add(review.author);
                        this.logMappingResult(null, review.author, null, null, '리뷰', repo.name, `#${review.prNumber}`);
                    }
                });

                // 이슈 수집
                const issues = await this.getRepositoryIssues(repo.owner, repo.name, since, until);
                logger.info(`Repository ${repo.name}: Found ${issues.length} issues`);

                issues.forEach(issue => {
                    mappingStats.totalActivities++;

                    const member = this.findTeamMember(issue.author, null, null);

                    if (member) {
                        mappingStats.successfulMappings++;

                        if (teamStats[member.memberId]) {
                            teamStats[member.memberId].issuesCreated++;
                            if (issue.state === 'closed') {
                                teamStats[member.memberId].issuesClosed++;
                            }
                            teamStats[member.memberId].repositories.add(repo.name);
                        }

                        this.logMappingResult(member, issue.author, null, null, '이슈', repo.name, `#${issue.number}`);
                    } else {
                        mappingStats.failedMappings++;
                        mappingStats.failedUsers.add(issue.author);
                        this.logMappingResult(null, issue.author, null, null, '이슈', repo.name, `#${issue.number}`);
                    }
                });

                processedRepos++;
                await new Promise(resolve => setTimeout(resolve, 1000));

            } catch (error) {
                logger.error(`Error collecting stats from ${repo.owner}/${repo.name}: ${error.message}`, error);
            }
        }

        // 매핑 통계 출력
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

    // 이후 메서드들은 기존 코드와 동일하므로 생략...
    // (generateBarChart, calculateOverallScore, generateReportMessage 등)

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
            pullRequestsMerged: 20,
            pullRequestsClosed: 5,
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
        score -= stats.pullRequestsClosed * weights.pullRequestsClosed;
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

        // PR 완료 순위
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

        // PR 효율성 순위
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

    // 나머지 메서드들은 기존 코드와 동일하므로 생략...
    // (savePreviewReport, generateWeeklyReport, generateMonthlyReport 등)

    /**
     * 매핑 진단 도구 - 개선된 버전
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
                mappingCacheSize: this.memberMappingCache.size,
                reverseMappingCacheSize: this.reverseMappingCache.size,
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
                    const commits = await this.getRepositoryCommits(repo.owner, repo.name, since, until);
                    commits.forEach(commit => {
                        repoData.users.add(commit.author);
                        diagnosis.foundUsers.add(commit.author);

                        const member = this.findTeamMember(commit.author, commit.authorName, commit.authorEmail);
                        const key = `${commit.author}|${commit.authorName}|${commit.authorEmail}`;

                        if (!diagnosis.mappingResults.has(key)) {
                            diagnosis.mappingResults.set(key, {
                                githubUsername: commit.author,
                                authorName: commit.authorName,
                                authorEmail: commit.authorEmail,
                                mapped: !!member,
                                mappedTo: member ? member.name : null,
                                mappedMethod: member ? this.determineMappingMethod(commit.author, commit.authorName, commit.authorEmail) : null,
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
                            const method = this.determineMappingMethod(commit.author, commit.authorName, commit.authorEmail);
                            diagnosis.mappingMethodStats[method]++;
                        } else {
                            diagnosis.mappingMethodStats.failed++;
                        }
                    });

                    const prs = await this.getRepositoryPullRequests(repo.owner, repo.name, since, until);
                    prs.forEach(pr => {
                        repoData.users.add(pr.author);
                        diagnosis.foundUsers.add(pr.author);

                        const member = this.findTeamMember(pr.author, null, null);
                        const key = `${pr.author}||`;

                        if (!diagnosis.mappingResults.has(key)) {
                            diagnosis.mappingResults.set(key, {
                                githubUsername: pr.author,
                                authorName: null,
                                authorEmail: null,
                                mapped: !!member,
                                mappedTo: member ? member.name : null,
                                mappedMethod: member ? this.determineMappingMethod(pr.author, null, null) : null,
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

            // 설정된 사용자 중 활동이 없는 사용자 찾기
            const inactiveMembers = Object.values(this.config.teamMapping || {}).filter(member => {
                return !Array.from(diagnosis.foundUsers).includes(member.githubUsername);
            });

            if (inactiveMembers.length > 0) {
                diagnosis.recommendations.push({
                    type: 'inactive_members',
                    message: `${inactiveMembers.length}명의 설정된 팀원이 최근 30일간 활동이 없습니다.`,
                    members: inactiveMembers.map(m => ({
                        name: m.name,
                        githubUsername: m.githubUsername,
                        email: m.email,
                        memberId: m.memberId
                    }))
                });
            }

            // 매핑 방법 효율성 분석
            const totalMapped = diagnosis.mappingMethodStats.exact + diagnosis.mappingMethodStats.fuzzy + diagnosis.mappingMethodStats.pattern;
            if (totalMapped > 0) {
                diagnosis.recommendations.push({
                    type: 'mapping_efficiency',
                    message: '매핑 방법별 효율성 분석',
                    stats: {
                        exact: {
                            count: diagnosis.mappingMethodStats.exact,
                            percentage: Math.round((diagnosis.mappingMethodStats.exact / totalMapped) * 100)
                        },
                        fuzzy: {
                            count: diagnosis.mappingMethodStats.fuzzy,
                            percentage: Math.round((diagnosis.mappingMethodStats.fuzzy / totalMapped) * 100)
                        },
                        pattern: {
                            count: diagnosis.mappingMethodStats.pattern,
                            percentage: Math.round((diagnosis.mappingMethodStats.pattern / totalMapped) * 100)
                        }
                    }
                });
            }

            logger.info(`개선된 팀원 매핑 진단 완료:`);
            logger.info(`- 총 사용자: ${diagnosis.foundUsers.size}`);
            logger.info(`- 성공 매핑: ${successfulMappings.length}`);
            logger.info(`- 실패 매핑: ${failedMappings.length}`);
            logger.info(`- 성공률: ${diagnosis.summary.mappingSuccessRate}%`);
            logger.info(`- 매핑 방법: 정확(${diagnosis.mappingMethodStats.exact}), 퍼지(${diagnosis.mappingMethodStats.fuzzy}), 패턴(${diagnosis.mappingMethodStats.pattern})`);

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

    /**
     * 매핑 방법 결정 (진단용)
     */
    determineMappingMethod(githubUsername, authorName, authorEmail) {
        // 정확한 매핑인지 확인
        if (this.findExactMatch(githubUsername, authorName, authorEmail)) {
            return 'exact';
        }

        // 퍼지 매핑인지 확인
        if (this.findFuzzyMatch(githubUsername, authorName, authorEmail)) {
            return 'fuzzy';
        }

        // 패턴 매핑인지 확인
        if (this.findPatternMatch(githubUsername, authorName, authorEmail)) {
            return 'pattern';
        }

        return 'failed';
    }

    /**
     * 팀원 매핑 캐시 상태 조회 - 개선된 버전
     */
    getMappingCacheStatus() {
        const forwardCacheEntries = Array.from(this.memberMappingCache.entries()).map(([key, member]) => ({
            key,
            memberId: member.memberId,
            name: member.name,
            githubUsername: member.githubUsername,
            email: member.email
        }));

        const reverseCacheEntries = Array.from(this.reverseMappingCache.entries()).map(([key, member]) => ({
            key,
            memberId: member.memberId,
            name: member.name,
            githubUsername: member.githubUsername,
            email: member.email
        }));

        return {
            forwardMapping: {
                size: this.memberMappingCache.size,
                entries: forwardCacheEntries
            },
            reverseMapping: {
                size: this.reverseMappingCache.size,
                entries: reverseCacheEntries
            },
            configuredMembers: Object.keys(this.config.teamMapping || {}).length,
            mappingMethods: {
                exact: '정확한 일치 (GitHub 사용자명, 이메일, 이름)',
                fuzzy: '퍼지 매칭 (유사도 기반)',
                pattern: '패턴 매칭 (접두사 제거, 숫자 제거 등)'
            }
        };
    }

    /**
     * 팀원 매핑 캐시 강제 새로고침 - 개선된 버전
     */
    refreshMappingCache() {
        try {
            const oldForwardSize = this.memberMappingCache.size;
            const oldReverseSize = this.reverseMappingCache.size;

            this.syncTeamMembersWithMainConfig();
            this.initializeMemberMappingCache();

            const newForwardSize = this.memberMappingCache.size;
            const newReverseSize = this.reverseMappingCache.size;

            logger.info(`매핑 캐시 새로고침 완료:`);
            logger.info(`- 정방향 매핑: ${oldForwardSize} -> ${newForwardSize} entries`);
            logger.info(`- 역방향 매핑: ${oldReverseSize} -> ${newReverseSize} entries`);

            return {
                success: true,
                message: '매핑 캐시가 성공적으로 새로고침되었습니다.',
                changes: {
                    forwardMapping: { old: oldForwardSize, new: newForwardSize },
                    reverseMapping: { old: oldReverseSize, new: newReverseSize }
                }
            };
        } catch (error) {
            logger.error(`Error refreshing mapping cache: ${error.message}`, error);
            return {
                success: false,
                message: `매핑 캐시 새로고침 중 오류가 발생했습니다: ${error.message}`
            };
        }
    }

    /**
     * 매핑 성능 테스트
     */
    testMappingPerformance() {
        const testCases = [
            { githubUsername: 'tmddud333', authorName: '정승영', authorEmail: 'tmddud333@danal.co.kr' },
            { githubUsername: 'danal-vflag32c', authorName: '유열', authorEmail: 'youyeol@danal.co.kr' },
            { githubUsername: 'cmjeong99', authorName: '정찬미', authorEmail: 'cmjeong@danal.co.kr' },
            { githubUsername: 'unknown-user', authorName: '알 수 없는 사용자', authorEmail: 'unknown@example.com' },
            { githubUsername: 'tmddud', authorName: '정승영', authorEmail: 'tmddud@danal.co.kr' }, // 패턴 매핑 테스트
            { githubUsername: 'danal-tmddud333', authorName: '정승영', authorEmail: 'tmddud333@danal.co.kr' } // 접두사 제거 테스트
        ];

        const results = [];
        const startTime = Date.now();

        testCases.forEach((testCase, index) => {
            const caseStartTime = Date.now();
            const member = this.findTeamMember(testCase.githubUsername, testCase.authorName, testCase.authorEmail);
            const caseEndTime = Date.now();

            results.push({
                testCase: index + 1,
                input: testCase,
                found: !!member,
                result: member ? {
                    name: member.name,
                    githubUsername: member.githubUsername,
                    memberId: member.memberId
                } : null,
                method: member ? this.determineMappingMethod(testCase.githubUsername, testCase.authorName, testCase.authorEmail) : 'failed',
                duration: caseEndTime - caseStartTime
            });
        });

        const endTime = Date.now();
        const totalDuration = endTime - startTime;

        return {
            success: true,
            results: results,
            summary: {
                totalTests: testCases.length,
                successfulMappings: results.filter(r => r.found).length,
                failedMappings: results.filter(r => !r.found).length,
                totalDuration: totalDuration,
                averageDuration: totalDuration / testCases.length
            }
        };
    }

    // 기존 메서드들 계속...
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

    // 기타 유틸리티 메서드들
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
                comprehensiveMetrics: true,
                improvedMemberMapping: true,
                fuzzyMatching: true,
                patternMatching: true,
                mappingDiagnostics: true
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

    // 기타 레거시 메서드들과 유틸리티 메서드들은 기존 코드와 동일하게 유지
    // ... (생략)
}

module.exports = GitHubService;