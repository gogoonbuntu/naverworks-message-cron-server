// 설정 관리 서비스
// 애플리케이션 설정 로드, 저장, 검증

const fs = require('fs');
const path = require('path');
const logger = require('../../logger');

class ConfigService {
    constructor() {
        this.configPath = path.join(__dirname, '../../config.json');
        this.config = null;
        this.watchers = [];
    }

    /**
     * 설정 로드
     */
    loadConfig() {
        try {
            if (!fs.existsSync(this.configPath)) {
                logger.warn('Configuration file not found. Creating default configuration.');
                this.createDefaultConfig();
            }

            const configData = fs.readFileSync(this.configPath, 'utf8');
            this.config = JSON.parse(configData);

            // 설정 유효성 검사
            const validation = this.validateConfig(this.config);
            if (!validation.isValid) {
                logger.warn('Configuration validation warnings:', validation.warnings);
            }

            logger.info('Configuration loaded successfully');
            return this.config;
        } catch (error) {
            logger.error(`Failed to load configuration: ${error.message}`, error);
            throw error;
        }
    }

    /**
     * 설정 저장
     */
    saveConfig(config = null) {
        try {
            const configToSave = config || this.config;
            
            // 설정 백업
            this.backupConfig();
            
            // 새 설정 저장
            fs.writeFileSync(this.configPath, JSON.stringify(configToSave, null, 2), 'utf8');
            this.config = configToSave;
            
            logger.info('Configuration saved successfully');
            return { success: true };
        } catch (error) {
            logger.error(`Failed to save configuration: ${error.message}`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 기본 설정 생성
     */
    createDefaultConfig() {
        try {
            const defaultConfig = {
                // 팀 멤버 설정
                teamMembers: [
                    {
                        name: "홍길동",
                        email: "hong@example.com",
                        githubUsername: "honggildong",
                        naverworksId: "hong.gildong",
                        role: "developer",
                        isActive: true
                    },
                    {
                        name: "김철수",
                        email: "kim@example.com", 
                        githubUsername: "kimcheolsu",
                        naverworksId: "kim.cheolsu",
                        role: "developer",
                        isActive: true
                    }
                ],

                // 스케줄 설정
                schedules: {
                    enableWeeklyDutyAssignment: true,
                    weeklyDutySchedule: "0 8 * * 1", // 매주 월요일 오전 8시
                    enableDutyReminders: true,
                    dutyRemindersSchedule: "0 14,16 * * *", // 매일 오후 2시, 4시
                    enableCodeReviewPairs: true,
                    codeReviewPairsSchedule: "0 9 * * 1", // 매주 월요일 오전 9시
                    // 노트북 당직 스케줄 제거됨 (주간 당직으로 통합)
                    enableGithubWeeklyReport: false,
                    githubWeeklySchedule: "0 9 * * 1",
                    enableGithubMonthlyReport: false,
                    githubMonthlySchedule: "0 9 1 * *",
                    enableGithubActivityAlerts: false,
                    githubActivityAlertsSchedule: "0 17 * * 5"
                },

                // 메시징 설정
                messaging: {
                    naverworks: {
                        enabled: true,
                        clientId: "YOUR_CLIENT_ID",
                        clientSecret: "YOUR_CLIENT_SECRET",
                        defaultChannelId: "YOUR_CHANNEL_ID"
                    },
                    slack: {
                        enabled: false,
                        botToken: "YOUR_BOT_TOKEN",
                        defaultChannelId: "general"
                    },
                    email: {
                        enabled: false,
                        provider: "smtp",
                        host: "smtp.gmail.com",
                        port: 587,
                        secure: false,
                        auth: {
                            user: "your-email@gmail.com",
                            pass: "your-password"
                        },
                        defaultRecipients: ["team@example.com"]
                    }
                },

                // 업무 배정 설정
                dutyAssignment: {
                    rotationOrder: [],
                    excludeWeekends: true,
                    notificationChannels: ["naverworks"],
                    reminderTimes: ["14:00", "16:00"]
                },

                // 코드 리뷰 설정
                codeReview: {
                    pairRotation: true,
                    excludeAuthorFromReview: true,
                    notificationChannels: ["naverworks"]
                },

                // 노트북 관리 설정 제거됨 (주간 당직으로 통합)

                // GitHub 설정 (선택사항)
                github: {
                    enabled: false,
                    configFile: "github-config.json"
                },

                // 시스템 설정
                system: {
                    timezone: "Asia/Seoul",
                    logLevel: "info",
                    port: 3000,
                    enableWebInterface: true
                }
            };

            fs.writeFileSync(this.configPath, JSON.stringify(defaultConfig, null, 2), 'utf8');
            logger.info('Default configuration created');
            return defaultConfig;
        } catch (error) {
            logger.error(`Failed to create default configuration: ${error.message}`, error);
            throw error;
        }
    }

    /**
     * 설정 유효성 검사
     */
    validateConfig(config) {
        const warnings = [];
        const errors = [];

        try {
            // 필수 필드 검사
            if (!config.teamMembers || config.teamMembers.length === 0) {
                errors.push('팀 멤버가 설정되지 않았습니다.');
            }

            if (!config.schedules) {
                errors.push('스케줄 설정이 없습니다.');
            }

            if (!config.messaging) {
                errors.push('메시징 설정이 없습니다.');
            }

            // 팀 멤버 유효성 검사
            if (config.teamMembers) {
                config.teamMembers.forEach((member, index) => {
                    if (!member.name) {
                        warnings.push(`팀 멤버 ${index + 1}: 이름이 설정되지 않았습니다.`);
                    }
                    if (!member.email) {
                        warnings.push(`팀 멤버 ${index + 1}: 이메일이 설정되지 않았습니다.`);
                    }
                });
            }

            // 메시징 설정 검사
            if (config.messaging) {
                let hasEnabledMessenger = false;
                
                if (config.messaging.naverworks?.enabled) {
                    hasEnabledMessenger = true;
                    if (!config.messaging.naverworks.clientId || config.messaging.naverworks.clientId === 'YOUR_CLIENT_ID') {
                        warnings.push('네이버웍스 클라이언트 ID가 설정되지 않았습니다.');
                    }
                    if (!config.messaging.naverworks.clientSecret || config.messaging.naverworks.clientSecret === 'YOUR_CLIENT_SECRET') {
                        warnings.push('네이버웍스 클라이언트 시크릿이 설정되지 않았습니다.');
                    }
                }

                if (config.messaging.slack?.enabled) {
                    hasEnabledMessenger = true;
                    if (!config.messaging.slack.botToken || config.messaging.slack.botToken === 'YOUR_BOT_TOKEN') {
                        warnings.push('슬랙 봇 토큰이 설정되지 않았습니다.');
                    }
                }

                if (config.messaging.email?.enabled) {
                    hasEnabledMessenger = true;
                    if (!config.messaging.email.auth?.user) {
                        warnings.push('이메일 인증 정보가 설정되지 않았습니다.');
                    }
                }

                if (!hasEnabledMessenger) {
                    warnings.push('활성화된 메시징 채널이 없습니다.');
                }
            }

            // GitHub 설정 검사
            if (config.github?.enabled) {
                const githubConfigPath = path.join(path.dirname(this.configPath), config.github.configFile || 'github-config.json');
                if (!fs.existsSync(githubConfigPath)) {
                    warnings.push('GitHub 설정 파일이 존재하지 않습니다.');
                }
            }

            const isValid = errors.length === 0;
            
            return {
                isValid,
                errors,
                warnings,
                summary: {
                    teamMemberCount: config.teamMembers?.length || 0,
                    enabledSchedules: this.countEnabledSchedules(config.schedules),
                    enabledMessengers: this.countEnabledMessengers(config.messaging)
                }
            };
        } catch (error) {
            logger.error(`Configuration validation failed: ${error.message}`, error);
            return {
                isValid: false,
                errors: [error.message],
                warnings: []
            };
        }
    }

    /**
     * 설정 백업
     */
    backupConfig() {
        try {
            if (!fs.existsSync(this.configPath)) return;

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = path.join(path.dirname(this.configPath), `config-backup-${timestamp}.json`);
            
            fs.copyFileSync(this.configPath, backupPath);
            logger.info(`Configuration backed up to: ${backupPath}`);
        } catch (error) {
            logger.error(`Failed to backup configuration: ${error.message}`, error);
        }
    }

    /**
     * 설정 감시 시작
     */
    watchConfig(callback) {
        try {
            const watcher = fs.watch(this.configPath, (eventType, filename) => {
                if (eventType === 'change') {
                    logger.info('Configuration file changed, reloading...');
                    try {
                        this.loadConfig();
                        if (callback) callback(this.config);
                    } catch (error) {
                        logger.error(`Failed to reload configuration: ${error.message}`);
                    }
                }
            });

            this.watchers.push(watcher);
            logger.info('Configuration file watching started');
            return watcher;
        } catch (error) {
            logger.error(`Failed to watch configuration file: ${error.message}`, error);
            return null;
        }
    }

    /**
     * 설정 감시 중지
     */
    stopWatchingConfig() {
        try {
            this.watchers.forEach(watcher => watcher.close());
            this.watchers = [];
            logger.info('Configuration file watching stopped');
        } catch (error) {
            logger.error(`Failed to stop watching configuration: ${error.message}`, error);
        }
    }

    /**
     * 특정 설정값 가져오기
     */
    get(key, defaultValue = null) {
        try {
            const keys = key.split('.');
            let value = this.config;
            
            for (const k of keys) {
                if (value && typeof value === 'object' && k in value) {
                    value = value[k];
                } else {
                    return defaultValue;
                }
            }
            
            return value;
        } catch (error) {
            logger.error(`Failed to get config value for key ${key}: ${error.message}`);
            return defaultValue;
        }
    }

    /**
     * 특정 설정값 설정하기
     */
    set(key, value) {
        try {
            const keys = key.split('.');
            let current = this.config;
            
            for (let i = 0; i < keys.length - 1; i++) {
                const k = keys[i];
                if (!current[k] || typeof current[k] !== 'object') {
                    current[k] = {};
                }
                current = current[k];
            }
            
            current[keys[keys.length - 1]] = value;
            return { success: true };
        } catch (error) {
            logger.error(`Failed to set config value for key ${key}: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * 유틸리티 메서드들
     */
    countEnabledSchedules(schedules) {
        if (!schedules) return 0;
        return Object.keys(schedules).filter(key => key.startsWith('enable') && schedules[key]).length;
    }

    countEnabledMessengers(messaging) {
        if (!messaging) return 0;
        let count = 0;
        if (messaging.naverworks?.enabled) count++;
        if (messaging.slack?.enabled) count++;
        if (messaging.email?.enabled) count++;
        return count;
    }

    /**
     * 설정 내보내기
     */
    exportConfig(exportPath = null) {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const defaultExportPath = path.join(path.dirname(this.configPath), `config-export-${timestamp}.json`);
            const targetPath = exportPath || defaultExportPath;
            
            fs.copyFileSync(this.configPath, targetPath);
            logger.info(`Configuration exported to: ${targetPath}`);
            return { success: true, exportPath: targetPath };
        } catch (error) {
            logger.error(`Failed to export configuration: ${error.message}`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 설정 가져오기
     */
    importConfig(importPath) {
        try {
            if (!fs.existsSync(importPath)) {
                throw new Error('Import file does not exist');
            }

            // 기존 설정 백업
            this.backupConfig();
            
            // 새 설정 검증
            const importData = JSON.parse(fs.readFileSync(importPath, 'utf8'));
            const validation = this.validateConfig(importData);
            
            if (!validation.isValid) {
                logger.warn('Imported configuration has validation errors:', validation.errors);
            }
            
            // 새 설정 적용
            fs.copyFileSync(importPath, this.configPath);
            this.config = importData;
            
            logger.info(`Configuration imported from: ${importPath}`);
            return { success: true, validation };
        } catch (error) {
            logger.error(`Failed to import configuration: ${error.message}`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 팀원 정보 업데이트
     */
    updateTeamMembers(teamMembers) {
        try {
            if (!this.config) {
                this.loadConfig();
            }
            
            this.config.teamMembers = teamMembers;
            return this.saveConfig();
        } catch (error) {
            logger.error(`Failed to update team members: ${error.message}`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 일간 당직 스케줄 업데이트
     */
    updateDailyDutySchedule(dateKey, members) {
        try {
            if (!this.config) {
                this.loadConfig();
            }
            
            if (!this.config.dailyDutySchedule) {
                this.config.dailyDutySchedule = {};
            }
            
            this.config.dailyDutySchedule[dateKey] = {
                members: members,
                updatedAt: new Date().toISOString()
            };
            
            return this.saveConfig();
        } catch (error) {
            logger.error(`Failed to update daily duty schedule: ${error.message}`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 코드 리뷰 짝꼭 업데이트
     */
    updateCodeReviewPairs(codeReviewPairs) {
        try {
            if (!this.config) {
                this.loadConfig();
            }
            
            this.config.codeReviewPairs = codeReviewPairs;
            return this.saveConfig();
        } catch (error) {
            logger.error(`Failed to update code review pairs: ${error.message}`, error);
            return { success: false, error: error.message };
        }
    }

    // 노트북 당직 관련 메서드 제거됨
}

// ConfigService 인스턴스를 생성하여 export
module.exports = ConfigService;

// 전역에서 사용할 수 있도록 인스턴스도 export
module.exports.instance = new ConfigService();
