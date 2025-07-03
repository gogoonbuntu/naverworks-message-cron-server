// github-message-renderer.js
// GitHub 분석 데이터를 네이버웍스 메시지로 렌더링하는 모듈

const logger = require('./logger');

class GitHubMessageRenderer {
    constructor(config = {}) {
        this.config = {
            enableEmojis: config.enableEmojis !== false,
            maxMembersInSummary: config.maxMembersInSummary || 5,
            includeTechnicalDetails: config.includeTechnicalDetails || false,
            messageFormat: config.messageFormat || 'full' // 'full', 'summary', 'compact'
        };
    }

    /**
     * 주간 GitHub 활동 리포트 메시지 생성
     */
    renderWeeklyReport(teamStats, teamSummary, periodInfo, comparison = null) {
        try {
            logger.info('Rendering weekly GitHub activity report');
            
            const { startDate, endDate } = periodInfo;
            const weekNumber = this.getWeekNumber(new Date(endDate));
            
            let message = '';
            
            // 헤더
            message += this.config.enableEmojis ? '🔥 ' : '';
            message += `${weekNumber}주차 GitHub 활동 리포트 (${startDate} ~ ${endDate})\n\n`;
            
            // 팀 전체 요약
            message += this.renderTeamSummary(teamSummary);
            message += '\n';
            
            // 개인별 상세 활동
            message += this.renderIndividualStats(teamStats, comparison);
            message += '\n';
            
            // 하이라이트
            message += this.renderHighlights(teamStats, teamSummary);
            message += '\n';
            
            // 푸터
            message += this.renderFooter();
            
            logger.info('Weekly GitHub report rendered successfully');
            return message;
            
        } catch (error) {
            logger.error(`Failed to render weekly report: ${error.message}`, error);
            return '📊 GitHub 활동 리포트 생성 중 오류가 발생했습니다.';
        }
    }

    /**
     * 월간 GitHub 활동 리포트 메시지 생성
     */
    renderMonthlyReport(teamStats, teamSummary, periodInfo, comparison = null) {
        try {
            logger.info('Rendering monthly GitHub activity report');
            
            const { startDate, endDate } = periodInfo;
            const monthYear = new Date(endDate).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' });
            
            let message = '';
            
            // 헤더
            message += this.config.enableEmojis ? '📊 ' : '';
            message += `${monthYear} GitHub 활동 월간 리포트\n\n`;
            
            // 팀 전체 요약
            message += this.renderTeamSummary(teamSummary, true);
            message += '\n';
            
            // 상위 기여자 (월간은 더 자세히)
            message += this.renderTopContributors(teamSummary.topContributors, true);
            message += '\n';
            
            // 개인별 상세 활동
            message += this.renderIndividualStats(teamStats, comparison, true);
            message += '\n';
            
            // 월간 하이라이트
            message += this.renderMonthlyHighlights(teamStats, teamSummary);
            message += '\n';
            
            // 푸터
            message += this.renderFooter();
            
            logger.info('Monthly GitHub report rendered successfully');
            return message;
            
        } catch (error) {
            logger.error(`Failed to render monthly report: ${error.message}`, error);
            return '📊 GitHub 월간 리포트 생성 중 오류가 발생했습니다.';
        }
    }

    /**
     * 팀 전체 요약 렌더링
     */
    renderTeamSummary(teamSummary, isMonthly = false) {
        const emoji = this.config.enableEmojis;
        let summary = `${emoji ? '📦 ' : ''}팀 전체 활동 요약\n`;
        
        summary += `- 총 커밋: ${teamSummary.totalCommits}회\n`;
        summary += `- 총 PR: ${teamSummary.totalPRs}개\n`;
        summary += `- 총 리뷰: ${teamSummary.totalReviews}개\n`;
        summary += `- 총 이슈: ${teamSummary.totalIssues}개\n`;
        summary += `- 총 코드 변경: ${this.formatNumber(teamSummary.totalLinesChanged)}라인\n`;
        
        if (isMonthly) {
            summary += `- 활동 멤버: ${teamSummary.memberCount}명\n`;
            summary += `- 평균 커밋/인: ${Math.round(teamSummary.totalCommits / teamSummary.memberCount)}회\n`;
        }
        
        return summary;
    }

    /**
     * 개인별 통계 렌더링
     */
    renderIndividualStats(teamStats, comparison = null, isDetailed = false) {
        let stats = '';
        
        // 기여도 점수로 정렬
        const sortedMembers = Object.entries(teamStats).sort((a, b) => {
            const scoreA = this.calculateContributionScore(a[1]);
            const scoreB = this.calculateContributionScore(b[1]);
            return scoreB - scoreA;
        });
        
        stats += `${this.config.enableEmojis ? '👥 ' : ''}개인별 활동 현황\n`;
        
        sortedMembers.forEach(([username, memberStats], index) => {
            const rank = index + 1;
            const emoji = this.getRankEmoji(rank);
            
            stats += `\n${emoji} ${memberStats.displayName} (${username})\n`;
            stats += `- 커밋: ${memberStats.commits}회`;
            
            // 변화율 표시
            if (comparison && comparison[username]) {
                const change = comparison[username].commits;
                if (change !== 'NEW' && change !== 0) {
                    stats += ` (${change > 0 ? '+' : ''}${change}%)`;
                }
            }
            stats += '\n';
            
            stats += `- PR 생성: ${memberStats.prsCreated}개\n`;
            stats += `- PR 리뷰: ${memberStats.prsReviewed}개\n`;
            
            if (isDetailed) {
                stats += `- 이슈 생성: ${memberStats.issuesCreated}개\n`;
                stats += `- 이슈 해결: ${memberStats.issuesClosed}개\n`;
            }
            
            stats += `- 코드 변경: +${this.formatNumber(memberStats.linesAdded)} / -${this.formatNumber(memberStats.linesDeleted)}\n`;
            
            // 상위 커밋 표시 (컴팩트 모드가 아닐 때)
            if (this.config.messageFormat !== 'compact' && memberStats.topCommits.length > 0) {
                const topCommit = memberStats.topCommits[0];
                stats += `- 주요 커밋: "${this.truncateMessage(topCommit.message, 30)}"\n`;
            }
        });
        
        return stats;
    }

    /**
     * 상위 기여자 렌더링
     */
    renderTopContributors(contributors, isDetailed = false) {
        let content = `${this.config.enableEmojis ? '🏆 ' : ''}이번 주 MVP\n`;
        
        const topCount = isDetailed ? 5 : 3;
        const topContributors = contributors.slice(0, topCount);
        
        topContributors.forEach((contributor, index) => {
            const rank = index + 1;
            const emoji = this.getRankEmoji(rank);
            
            content += `${emoji} ${contributor.displayName}\n`;
            content += `  점수: ${contributor.score}점 (커밋 ${contributor.commits}, PR ${contributor.prsCreated}, 리뷰 ${contributor.prsReviewed})\n`;
            
            if (isDetailed) {
                content += `  코드 변경: ${this.formatNumber(contributor.linesChanged)}라인\n`;
            }
        });
        
        return content;
    }

    /**
     * 하이라이트 렌더링
     */
    renderHighlights(teamStats, teamSummary) {
        let highlights = `${this.config.enableEmojis ? '💡 ' : ''}이번 주 하이라이트\n`;
        
        // 가장 많은 커밋
        const topCommitter = teamSummary.topContributors[0];
        if (topCommitter) {
            highlights += `- 🚀 커밋 왕: ${topCommitter.displayName} (${topCommitter.commits}회)\n`;
        }
        
        // 가장 많은 리뷰
        const topReviewer = teamSummary.topContributors.sort((a, b) => b.prsReviewed - a.prsReviewed)[0];
        if (topReviewer && topReviewer.prsReviewed > 0) {
            highlights += `- 👑 리뷰 왕: ${topReviewer.displayName} (${topReviewer.prsReviewed}개)\n`;
        }
        
        // 가장 큰 코드 변경
        const topChanger = teamSummary.topContributors.sort((a, b) => b.linesChanged - a.linesChanged)[0];
        if (topChanger && topChanger.linesChanged > 0) {
            highlights += `- 🔥 코드 변경 왕: ${topChanger.displayName} (${this.formatNumber(topChanger.linesChanged)}라인)\n`;
        }
        
        // 팀 전체 통계
        if (teamSummary.totalCommits > 0) {
            highlights += `- 📊 팀 평균 커밋: ${Math.round(teamSummary.totalCommits / teamSummary.memberCount)}회/인\n`;
        }
        
        return highlights;
    }

    /**
     * 월간 하이라이트 렌더링
     */
    renderMonthlyHighlights(teamStats, teamSummary) {
        let highlights = `${this.config.enableEmojis ? '🎯 ' : ''}월간 성과 하이라이트\n`;
        
        // 월간 최고 기여자
        const mvp = teamSummary.topContributors[0];
        if (mvp) {
            highlights += `- 🏆 월간 MVP: ${mvp.displayName} (${mvp.score}점)\n`;
        }
        
        // 가장 활발한 레포지토리
        const repoActivity = this.calculateRepositoryActivity(teamStats);
        if (repoActivity.length > 0) {
            highlights += `- 🔥 가장 활발한 레포: ${repoActivity[0].name} (${repoActivity[0].commits}커밋)\n`;
        }
        
        // 팀 성장 지표
        if (teamSummary.totalCommits > 100) {
            highlights += `- 🚀 팀 생산성: 높음 (${teamSummary.totalCommits}커밋)\n`;
        } else if (teamSummary.totalCommits > 50) {
            highlights += `- 📈 팀 생산성: 보통 (${teamSummary.totalCommits}커밋)\n`;
        }
        
        return highlights;
    }

    /**
     * 푸터 렌더링
     */
    renderFooter() {
        return `${this.config.enableEmojis ? '💪 ' : ''}수고하셨습니다! 계속 좋은 코드 부탁드립니다.`;
    }

    /**
     * 간단한 요약 메시지 생성 (Slack 등에 적합)
     */
    renderCompactSummary(teamSummary, periodInfo) {
        const { startDate, endDate } = periodInfo;
        const weekNumber = this.getWeekNumber(new Date(endDate));
        
        let message = `🔥 ${weekNumber}주차 GitHub 요약\n`;
        message += `팀 전체: ${teamSummary.totalCommits}커밋, ${teamSummary.totalPRs}PR, ${teamSummary.totalReviews}리뷰\n`;
        
        if (teamSummary.topContributors.length > 0) {
            const top = teamSummary.topContributors[0];
            message += `MVP: ${top.displayName} (${top.score}점)`;
        }
        
        return message;
    }

    /**
     * 알림 메시지 생성 (임계값 기반)
     */
    renderActivityAlert(teamStats, thresholds) {
        const alerts = [];
        
        // 커밋 수 기준 알림
        if (thresholds.minCommitsPerWeek) {
            const lowActivityMembers = Object.entries(teamStats).filter(
                ([username, stats]) => stats.commits < thresholds.minCommitsPerWeek
            );
            
            if (lowActivityMembers.length > 0) {
                alerts.push(`⚠️ 커밋 수가 적은 멤버: ${lowActivityMembers.map(([u, s]) => s.displayName).join(', ')}`);
            }
        }
        
        // PR 리뷰 기준 알림
        if (thresholds.minReviewsPerWeek) {
            const lowReviewMembers = Object.entries(teamStats).filter(
                ([username, stats]) => stats.prsReviewed < thresholds.minReviewsPerWeek
            );
            
            if (lowReviewMembers.length > 0) {
                alerts.push(`📝 리뷰 참여가 적은 멤버: ${lowReviewMembers.map(([u, s]) => s.displayName).join(', ')}`);
            }
        }
        
        if (alerts.length > 0) {
            return `🚨 활동 알림\n${alerts.join('\n')}\n\n더 활발한 참여 부탁드립니다! 💪`;
        }
        
        return null;
    }

    /**
     * 유틸리티 메서드들
     */
    calculateContributionScore(stats) {
        return (stats.commits * 1) +
               (stats.prsCreated * 3) +
               (stats.prsReviewed * 2) +
               (stats.issuesCreated * 1) +
               (stats.issuesClosed * 2) +
               Math.floor((stats.linesAdded + stats.linesDeleted) / 100);
    }

    getRankEmoji(rank) {
        if (!this.config.enableEmojis) return `${rank}.`;
        
        switch (rank) {
            case 1: return '🥇';
            case 2: return '🥈';
            case 3: return '🥉';
            default: return `${rank}.`;
        }
    }

    getWeekNumber(date) {
        const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
        const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
        return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
    }

    formatNumber(num) {
        if (num >= 1000) {
            return Math.round(num / 1000 * 10) / 10 + 'k';
        }
        return num.toString();
    }

    truncateMessage(message, maxLength) {
        if (message.length <= maxLength) return message;
        return message.substring(0, maxLength) + '...';
    }

    calculateRepositoryActivity(teamStats) {
        const repoActivity = {};
        
        Object.values(teamStats).forEach(memberStats => {
            memberStats.repositories.forEach(repo => {
                if (!repoActivity[repo.repository]) {
                    repoActivity[repo.repository] = {
                        name: repo.repository,
                        commits: 0,
                        prs: 0,
                        reviews: 0
                    };
                }
                repoActivity[repo.repository].commits += repo.commits;
                repoActivity[repo.repository].prs += repo.prsCreated;
                repoActivity[repo.repository].reviews += repo.prsReviewed;
            });
        });
        
        return Object.values(repoActivity).sort((a, b) => b.commits - a.commits);
    }

    /**
     * 커스텀 템플릿 기반 메시지 생성
     */
    renderCustomTemplate(template, data) {
        try {
            let message = template;
            
            // 기본 치환 변수들
            const replacements = {
                '{{TEAM_COMMITS}}': data.teamSummary.totalCommits,
                '{{TEAM_PRS}}': data.teamSummary.totalPRs,
                '{{TEAM_REVIEWS}}': data.teamSummary.totalReviews,
                '{{TEAM_ISSUES}}': data.teamSummary.totalIssues,
                '{{TEAM_LINES}}': this.formatNumber(data.teamSummary.totalLinesChanged),
                '{{MEMBER_COUNT}}': data.teamSummary.memberCount,
                '{{PERIOD_START}}': data.periodInfo.startDate,
                '{{PERIOD_END}}': data.periodInfo.endDate,
                '{{MVP_NAME}}': data.teamSummary.topContributors[0]?.displayName || 'N/A',
                '{{MVP_SCORE}}': data.teamSummary.topContributors[0]?.score || 0
            };
            
            // 치환 실행
            Object.entries(replacements).forEach(([key, value]) => {
                message = message.replace(new RegExp(key, 'g'), value);
            });
            
            return message;
            
        } catch (error) {
            logger.error(`Failed to render custom template: ${error.message}`, error);
            return '커스텀 템플릿 렌더링 중 오류가 발생했습니다.';
        }
    }
}

module.exports = GitHubMessageRenderer;
