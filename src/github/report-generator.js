// src/github/report-generator.js
// 리포트 생성 서비스 - 리포트 생성 및 메시지 포맷 담당

const logger = require('../../logger');

class ReportGenerator {
    constructor() {
        // 생성자에서 초기화할 내용이 있으면 추가
    }

    /**
     * 막대 차트 생성 (ASCII 아트)
     */
    generateBarChart(value, maxValue, length = 10) {
        if (maxValue === 0) return '▁'.repeat(length);

        const ratio = Math.min(value / maxValue, 1);
        const filledLength = Math.round(ratio * length);
        const emptyLength = length - filledLength;

        const filled = '█'.repeat(filledLength);
        const empty = '▁'.repeat(emptyLength);

        return filled + empty;
    }

    /**
     * 종합 점수 계산
     */
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

    /**
     * 리포트 메시지 생성
     */
    generateReportMessage(stats, startDate, endDate, type = 'weekly', repositories = []) {
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
                    message += `${index + 1}. ${bar} ${member.pullRequestsMerged}건 (마감률 ${successRate}%) - ${member.name}\n`;
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
        message += `✅ 완료된 PR: ${totalPRsMerged}건 (마감률 ${overallSuccessRate}%)\n`;
        if (totalPRsClosed > 0) {
            message += `❌ 닫힌 PR: ${totalPRsClosed}건\n`;
        }
        message += `📝 총 코드 변경: +${totalAdded}/-${totalDeleted}\n`;
        message += `💬 총 리뷰: ${totalReviews}건\n`;
        message += `📨 총 댓글: ${totalComments}개\n`;
        message += `🐛 총 이슈 처리: ${totalIssues}건\n`;

        if (repositories && repositories.length > 0) {
            message += `\n💡 GitHub 리포지토리\n`;
            repositories.forEach(repo => {
                if (repo.enabled) {
                    message += `• ${repo.name}: ${repo.url || `https://github.com/${repo.owner}/${repo.name}`}\n`;
                }
            });
        }

        return message;
    }

    /**
     * 활동 부족 알림 메시지 생성
     */
    generateLowActivityAlert(lowActivityMembers, startDate, endDate, threshold) {
        let alertMessage = `⚠️ 주간 활동 부족 알림 (${startDate} ~ ${endDate}) ⚠️\n\n`;
        alertMessage += `다음 팀원들의 GitHub 활동이 기준치(${threshold}건) 미만입니다:\n\n`;

        lowActivityMembers.forEach(member => {
            alertMessage += `📝 ${member.name} (${member.githubUsername})\n`;
            alertMessage += `   • 총 활동: ${member.totalActivity}건\n`;
            alertMessage += `   • 커밋: ${member.commits}건, PR: ${member.pullRequests}건, 리뷰: ${member.reviews}건\n\n`;
        });

        alertMessage += `💡 팀원들의 활발한 참여를 부탁드립니다!`;

        return alertMessage;
    }

    /**
     * 매핑 진단 리포트 생성
     */
    generateMappingDiagnosisReport(diagnosis) {
        let report = `📊 GitHub 팀원 매핑 진단 리포트\n\n`;

        // 요약 정보
        report += `📈 매핑 통계 요약\n`;
        report += `• 설정된 팀원: ${diagnosis.configuredMembers}명\n`;
        report += `• 발견된 GitHub 사용자: ${diagnosis.foundUsers.size}명\n`;
        report += `• 매핑 성공: ${diagnosis.summary.successfulMappings}건\n`;
        report += `• 매핑 실패: ${diagnosis.summary.failedMappings}건\n`;
        report += `• 성공률: ${diagnosis.summary.mappingSuccessRate}%\n\n`;

        // 매핑 방법별 통계
        report += `🔍 매핑 방법별 통계\n`;
        report += `• 정확 매핑: ${diagnosis.mappingMethodStats.exact}건\n`;
        report += `• 퍼지 매핑: ${diagnosis.mappingMethodStats.fuzzy}건\n`;
        report += `• 패턴 매핑: ${diagnosis.mappingMethodStats.pattern}건\n`;
        report += `• 실패: ${diagnosis.mappingMethodStats.failed}건\n\n`;

        // 리포지토리별 사용자 현황
        if (diagnosis.repositories.length > 0) {
            report += `📂 리포지토리별 사용자 현황\n`;
            diagnosis.repositories.forEach(repo => {
                report += `• ${repo.name}: ${repo.users.length}명\n`;
                if (repo.users.length > 0) {
                    report += `  - ${repo.users.join(', ')}\n`;
                }
            });
            report += `\n`;
        }

        // 추천 사항
        if (diagnosis.recommendations.length > 0) {
            report += `💡 개선 제안\n`;
            diagnosis.recommendations.forEach((rec, index) => {
                report += `${index + 1}. ${rec.message}\n`;
                if (rec.suggestions) {
                    rec.suggestions.forEach(suggestion => {
                        report += `   • ${suggestion.githubUsername}: ${suggestion.suggestedMappings.map(m => m.value).join(', ')}\n`;
                    });
                }
                report += `\n`;
            });
        }

        return report;
    }
}

module.exports = ReportGenerator;