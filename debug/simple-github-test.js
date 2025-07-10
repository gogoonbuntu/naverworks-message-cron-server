// debug/simple-github-test.js
// 간단한 GitHub 데이터 확인 스크립트

const GitHubService = require('../src/services/github-service');

console.log('=== GitHub 데이터 확인 ===');

async function testGitHubData() {
    const githubService = new GitHubService();
    
    console.log('GitHub 서비스 상태:');
    console.log('- 활성화:', githubService.isEnabled);
    console.log('- 리포지토리 수:', githubService.config.repositories?.length || 0);
    console.log('- 팀 멤버 수:', Object.keys(githubService.config.teamMapping || {}).length);
    
    if (!githubService.isEnabled) {
        console.log('GitHub 서비스가 비활성화되어 있습니다.');
        return;
    }
    
    console.log('\n=== 팀 멤버 매핑 ===');
    Object.entries(githubService.config.teamMapping || {}).forEach(([id, member]) => {
        console.log(`${id}: ${member.name} (${member.githubUsername})`);
    });
    
    console.log('\n=== 최근 7일 PR 직접 조회 ===');
    
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const since = startDate.toISOString();
    const until = endDate.toISOString();
    
    console.log(`기간: ${since} ~ ${until}`);
    
    // 첫 번째 리포지토리로 테스트
    const firstRepo = githubService.config.repositories?.find(r => r.enabled);
    
    if (firstRepo) {
        console.log(`\n--- 테스트 리포지토리: ${firstRepo.name} ---`);
        
        try {
            const pullRequests = await githubService.getRepositoryPullRequests(
                firstRepo.owner, 
                firstRepo.name, 
                since, 
                until
            );
            
            console.log(`발견된 PR 수: ${pullRequests.length}`);
            
            if (pullRequests.length > 0) {
                console.log('\nPR 목록:');
                pullRequests.forEach(pr => {
                    console.log(`  #${pr.number} by ${pr.author}: ${pr.title}`);
                    console.log(`    생성일: ${pr.createdAt}`);
                    console.log(`    상태: ${pr.state}`);
                    console.log(`    병합됨: ${pr.mergedAt ? 'Yes' : 'No'}`);
                    console.log(`    닫힘: ${pr.closedAt ? 'Yes' : 'No'}`);
                    console.log('');
                });
            }
            
            // 팀 멤버 매핑 확인
            console.log('\n=== 팀 멤버 매핑 확인 ===');
            const allAuthors = [...new Set(pullRequests.map(pr => pr.author))];
            
            allAuthors.forEach(author => {
                const member = Object.values(githubService.config.teamMapping || {}).find(m => 
                    m.githubUsername === author
                );
                
                if (member) {
                    console.log(`✅ ${author} → ${member.name}`);
                } else {
                    console.log(`❌ ${author} → 매핑되지 않음`);
                }
            });
            
        } catch (error) {
            console.error('API 호출 오류:', error.message);
        }
    }
}

testGitHubData().catch(console.error);
