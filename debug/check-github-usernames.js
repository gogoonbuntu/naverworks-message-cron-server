// debug/check-github-usernames.js
// GitHub 사용자명 확인 도구

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// GitHub 설정 로드
const configPath = path.join(__dirname, '..', 'github-config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

console.log('=== GitHub 사용자명 확인 도구 ===');

async function checkGitHubUsernames() {
    const token = config.githubToken;
    const repositories = config.repositories.filter(repo => repo.enabled);
    
    console.log('\n=== 모든 PR 작성자 확인 ===');
    
    const allAuthors = new Set();
    
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
            
            // 최근 30일간 PR 확인
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            
            pullRequests.forEach(pr => {
                const createdDate = new Date(pr.created_at);
                if (createdDate >= thirtyDaysAgo) {
                    allAuthors.add(pr.user.login);
                    console.log(`  #${pr.number} by ${pr.user.login}: ${pr.title}`);
                }
            });
            
        } catch (error) {
            console.error(`Error fetching PRs for ${repo.name}:`, error.message);
        }
        
        // API 호출 제한을 위한 대기
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('\n=== 발견된 모든 PR 작성자 ===');
    console.log('GitHub Username | 설정에 있는지 확인');
    console.log('----------------------------------------');
    
    Array.from(allAuthors).sort().forEach(username => {
        const isConfigured = Object.values(config.teamMapping).some(member => 
            member.githubUsername === username
        );
        
        const member = Object.values(config.teamMapping).find(member => 
            member.githubUsername === username
        );
        
        if (isConfigured) {
            console.log(`✅ ${username} → ${member.name}`);
        } else {
            console.log(`❌ ${username} → 설정에 없음`);
        }
    });
    
    console.log('\n=== 설정된 팀 멤버 vs 실제 GitHub 활동 ===');
    console.log('설정된 사용자명 | 실제 PR 있는지 확인');
    console.log('----------------------------------------');
    
    Object.entries(config.teamMapping).forEach(([id, member]) => {
        const hasActivity = allAuthors.has(member.githubUsername);
        
        if (hasActivity) {
            console.log(`✅ ${member.githubUsername} (${member.name}) → 최근 PR 있음`);
        } else {
            console.log(`⚠️  ${member.githubUsername} (${member.name}) → 최근 PR 없음`);
        }
    });
}

// 실행
checkGitHubUsernames().catch(console.error);
