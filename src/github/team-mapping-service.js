// src/github/team-mapping-service.js
// 팀원 매핑 서비스 - 팀원 매핑 로직 담당

const logger = require('../../logger');

class TeamMappingService {
    constructor() {
        // 팀원 매핑 캐시 - 다중 키로 빠른 검색
        this.memberMappingCache = new Map();
        // 역매핑 캐시 - 실제 GitHub 사용자명에서 팀원 정보로
        this.reverseMappingCache = new Map();
    }

    /**
     * 팀원 매핑 캐시 초기화 - 개선된 버전
     * 더 많은 매핑 방식과 역매핑 캐시 지원
     */
    initializeMemberMappingCache(teamMapping) {
        this.memberMappingCache.clear();
        this.reverseMappingCache.clear();

        if (!teamMapping) {
            return;
        }

        Object.entries(teamMapping).forEach(([memberId, memberData]) => {
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
            mappingMethods: {
                exact: '정확한 일치 (GitHub 사용자명, 이메일, 이름)',
                fuzzy: '퍼지 매칭 (유사도 기반)',
                pattern: '패턴 매칭 (접두사 제거, 숫자 제거 등)'
            }
        };
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
}

module.exports = TeamMappingService;