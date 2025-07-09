// test-github-service.js
// GitHub 서비스 테스트

const GitHubService = require('./src/services/github-service');
const scheduleService = require('./src/services/schedule-service');

console.log('=== GitHub Service Test ===');

// 1. GitHub 서비스 직접 테스트
console.log('\n1. Testing GitHub Service directly:');
const githubService = new GitHubService();
console.log('   - isEnabled:', githubService.isEnabled);
console.log('   - config loaded:', !!githubService.config);

// 2. 스케줄 서비스를 통한 테스트
console.log('\n2. Testing GitHub Service via schedule service:');
const githubFromSchedule = scheduleService.getGitHubService();
console.log('   - isEnabled:', githubFromSchedule.isEnabled);
console.log('   - config loaded:', !!githubFromSchedule.config);

// 3. 리포트 히스토리 테스트
console.log('\n3. Testing getReportHistory method:');
try {
    const history = githubFromSchedule.getReportHistory('all', 10);
    console.log('   - History length:', history.length);
    console.log('   - History data:', JSON.stringify(history, null, 2));
} catch (error) {
    console.error('   - Error:', error.message);
}

// 4. 저장소 통계 테스트
console.log('\n4. Testing getStorageStats method:');
try {
    const stats = githubFromSchedule.getStorageStats();
    console.log('   - Stats:', JSON.stringify(stats, null, 2));
} catch (error) {
    console.error('   - Error:', error.message);
}

console.log('\n=== Test Complete ===');
