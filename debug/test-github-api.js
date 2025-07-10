// debug/test-github-api.js
// GitHub API 직접 테스트

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// GitHub 설정 로드
const configPath = path.join(__dirname, '..', 'github-config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

console.log('=== GitHub API 테스트 ===');
console.log('Token:', config.githubToken ? 'OK' : 'MISSING');
console.log('Repositories:', config.repositories.length);
console.log('Team Members:', Object.keys(config.teamMapping).length);

async function testGitHubAPI() {
    const token = config.githubToken;
    const repositories = config.repositories.filter(repo => repo.enabled);
    
    console.log('\n=== 지난 7일간 PR 조회 ===');
    
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const until = new Date().toISOString();
    
    console.log('Period:', since, '~', until);
    
    for (const repo of repositories) {
        console.log(`\n--- Repository: ${repo.name} ---`);
        
        try {
            const url = `https://api.github.com/repos/${repo.owner}/${repo.name}/pulls?state=all&per_page=100&sort=updated&direction=desc`;
            
            const response = await fetch(url, {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'GitHub-Report-Debug'
                }
            });
            
            if (!response.ok) {
                console.error(`API Error: ${response.status} ${response.statusText}`);
                continue;
            }
            
            const pullRequests = await response.json();
            console.log(`Total PRs found: ${pullRequests.length}`);
            
            // 지난 7일간 PR 필터링
            const filteredPRs = pullRequests.filter(pr => {
                const createdDate = new Date(pr.created_at);
                const sinceDate = new Date(since);
                const untilDate = new Date(until);
                
                return createdDate >= sinceDate && createdDate <= untilDate;
            });
            
            console.log(`PRs in date range: ${filteredPRs.length}`);
            
            if (filteredPRs.length > 0) {
                console.log('PR Details:');
                filteredPRs.forEach(pr => {
                    console.log(`  #${pr.number} by ${pr.user.login}: ${pr.title}`);
                    console.log(`    Created: ${pr.created_at}`);
                    console.log(`    State: ${pr.state}`);
                    console.log(`    Merged: ${pr.merged_at || 'No'}`);
                    console.log(`    Closed: ${pr.closed_at || 'No'}`);
                    console.log('');
                });
            }
            
        } catch (error) {
            console.error(`Error fetching PRs for ${repo.name}:`, error.message);
        }
        
        // API 호출 제한을 위한 대기
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}

// 팀 멤버 매핑 확인
console.log('\n=== 팀 멤버 매핑 ===');
Object.entries(config.teamMapping).forEach(([id, member]) => {
    console.log(`${id}: ${member.name} (${member.githubUsername})`);
});

// API 테스트 실행
testGitHubAPI().catch(console.error);
