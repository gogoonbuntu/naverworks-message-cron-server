// 개선된 매핑 로직 테스트
const path = require('path');
const GitHubService = require('../src/services/github-service');

async function testImprovedMapping() {
    console.log('🔍 개선된 GitHub 매핑 로직 테스트 시작\n');
    
    const githubService = new GitHubService();
    
    // 서비스 상태 확인
    console.log('📋 서비스 상태:');
    console.log(`- 활성화: ${githubService.isEnabled}`);
    console.log(`- 팀 매핑 캐시 크기: ${githubService.memberMappingCache.size}`);
    console.log(`- 설정된 팀원 수: ${Object.keys(githubService.config.teamMapping || {}).length}`);
    
    // 매핑 캐시 상태 확인
    console.log('\n🗂️  매핑 캐시 상태:');
    const cacheStatus = githubService.getMappingCacheStatus();
    console.log(`캐시 엔트리 수: ${cacheStatus.size}`);
    console.log(`설정된 멤버 수: ${cacheStatus.configuredMembers}`);
    
    console.log('\n팀원 매핑 정보:');
    cacheStatus.entries.forEach(entry => {
        console.log(`- ${entry.name} (${entry.memberId}): GitHub=${entry.githubUsername}, Key=${entry.key}`);
    });
    
    // 테스트 케이스들
    const testCases = [
        // config.json에 있는 실제 GitHub 사용자명들
        { githubUsername: 'tmddud333', authorName: '정승영', authorEmail: 'tmddud333@danal.co.kr' },
        { githubUsername: 'danal-vflag32c', authorName: '유열', authorEmail: 'youyeol@danal.co.kr' },
        { githubUsername: 'cmjeong99', authorName: '정찬미', authorEmail: 'cmjeong@danal.co.kr' },
        { githubUsername: 'danal-yjjang', authorName: '장영지', authorEmail: 'yjjang@danal.co.kr' },
        { githubUsername: 'by3146', authorName: '조병용', authorEmail: 'jby3146@danal.co.kr' },
        
        // 이메일만 있는 경우
        { githubUsername: null, authorName: '연미연', authorEmail: 'myyeon@danal.co.kr' },
        { githubUsername: null, authorName: '황승신', authorEmail: 'ahssahss@danal.co.kr' },
        
        // 이름만 있는 경우
        { githubUsername: null, authorName: '정승영', authorEmail: null },
        { githubUsername: null, authorName: '유열', authorEmail: null },
        
        // 매핑 실패 케이스
        { githubUsername: 'unknown-user', authorName: '알 수 없는 사용자', authorEmail: 'unknown@example.com' },
        { githubUsername: 'external-contributor', authorName: null, authorEmail: null },
    ];
    
    console.log('\n🧪 매핑 테스트:');
    testCases.forEach((testCase, index) => {
        console.log(`\n테스트 ${index + 1}:`);
        console.log(`  입력: GitHub=${testCase.githubUsername || 'N/A'}, Name=${testCase.authorName || 'N/A'}, Email=${testCase.authorEmail || 'N/A'}`);
        
        const member = githubService.findTeamMember(testCase.githubUsername, testCase.authorName, testCase.authorEmail);
        
        if (member) {
            console.log(`  ✅ 매핑 성공: ${member.name} (${member.memberId}) - GitHub: ${member.githubUsername}`);
        } else {
            console.log(`  ❌ 매핑 실패: 일치하는 팀원을 찾을 수 없음`);
        }
    });
    
    // 매핑 진단 실행
    console.log('\n🔍 매핑 진단 실행 중...');
    if (githubService.isEnabled) {
        try {
            const diagnosis = await githubService.diagnoseMemberMapping();
            
            if (diagnosis.success) {
                console.log('\n📊 매핑 진단 결과:');
                console.log(`- 설정된 멤버 수: ${diagnosis.diagnosis.configuredMembers}`);
                console.log(`- 매핑 캐시 크기: ${diagnosis.diagnosis.mappingCacheSize}`);
                console.log(`- 발견된 사용자 수: ${diagnosis.diagnosis.summary?.totalUsers || 0}`);
                console.log(`- 성공한 매핑 수: ${diagnosis.diagnosis.summary?.successfulMappings || 0}`);
                console.log(`- 실패한 매핑 수: ${diagnosis.diagnosis.summary?.failedMappings || 0}`);
                console.log(`- 매핑 성공률: ${diagnosis.diagnosis.summary?.mappingSuccessRate || 0}%`);
                
                if (diagnosis.diagnosis.recommendations && diagnosis.diagnosis.recommendations.length > 0) {
                    console.log('\n💡 추천 사항:');
                    diagnosis.diagnosis.recommendations.forEach(rec => {
                        console.log(`- ${rec.message}`);
                    });
                }
            } else {
                console.log(`❌ 매핑 진단 실패: ${diagnosis.message}`);
            }
        } catch (error) {
            console.log(`❌ 매핑 진단 오류: ${error.message}`);
        }
    } else {
        console.log('⚠️  GitHub 서비스가 비활성화되어 매핑 진단을 건너뜁니다.');
    }
    
    console.log('\n✅ 테스트 완료');
}

// 테스트 실행
testImprovedMapping().catch(console.error);
