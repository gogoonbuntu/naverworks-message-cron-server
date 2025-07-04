// app.js
// 네이버웍스 메시지 자동 알림 스케줄러 - 메인 진입점

const logger = require('./logger');
const { startServer, stopServer } = require('./src/api/server');
const ConfigService = require('./src/services/config-service');
const ScheduleService = require('./src/services/schedule-service');
const GitHubService = require('./src/services/github-service');
const { MessageSender } = require('./src/messaging');

// 서비스 인스턴스
const configService = new ConfigService();
const scheduleService = new ScheduleService();
let githubService = null;
let messageService = null;

/**
 * 애플리케이션 시작
 */
function startApplication() {
    logger.info('🚀 Starting Naverworks Message Cron Server...');
    
    // 서버 시작
    const server = startServer(() => {
        // 초기 설정 로드 및 스케줄링 시작
        initializeApplication();
        
        // 성공 메시지 출력
        logger.info("Initial configuration loaded and scheduling completed.");
        logger.info("🔥 Default schedules active:");
        logger.info("- Weekly duty assignment: Monday 8 AM → Channel");
        logger.info("- Duty reminders: Every day 2 PM & 4 PM → Channel");
        logger.info("- Code review pairs: Monday 9 AM → Channel");
        logger.info("- Laptop duty notifications: Every day 9 AM → Individual");
        logger.info("Press Ctrl+C to stop the server.");
    });
    
    // 종료 처리
    setupGracefulShutdown(server);
}

/**
 * 애플리케이션 초기화
 */
function initializeApplication() {
    try {
        // 설정 로드
        const config = configService.loadConfig();
        logger.info(`Configuration loaded: ${config.teamMembers.length} team members, ${Object.keys(config.schedules).length} schedule options`);
        
        // 메시지 서비스 초기화
        if (config.messaging) {
            messageService = new MessageSender(config.messaging);
            logger.info('Message service initialized');
        }
        
        // GitHub 서비스 초기화 (선택사항)
        if (config.github?.enabled) {
            githubService = new GitHubService();
            if (githubService.isEnabled) {
                logger.info('GitHub service initialized and enabled');
            } else {
                logger.warn('GitHub service initialization failed - feature disabled');
                githubService = null;
            }
        }
        
        // 서비스 객체 준비
        const services = {
            configService,
            messageService,
            githubService
        };
        
        // 스케줄링 시작
        const scheduleConfig = {
            ...config.schedules,
            services
        };
        
        scheduleService.rescheduleJobs(scheduleConfig);
        logger.info('Application initialized successfully');
        
    } catch (error) {
        logger.error(`Failed to initialize application: ${error.message}`, error);
        process.exit(1);
    }
}

/**
 * 우아한 종료 처리 설정
 * @param {Object} server - HTTP 서버 인스턴스
 */
function setupGracefulShutdown(server) {
    const gracefulShutdown = (signal) => {
        logger.info(`Received ${signal} signal. Shutting down server gracefully...`);
        
        // 스케줄된 작업 정리
        scheduleService.clearAllScheduledJobs();
        
        // 서버 종료
        stopServer(server, () => {
            logger.info('Application shutdown completed successfully.');
            process.exit(0);
        });
    };
    
    // 시그널 처리
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    
    // 처리되지 않은 예외 로깅
    process.on('uncaughtException', (error) => {
        logger.error('Uncaught Exception:', error);
        process.exit(1);
    });
    
    process.on('unhandledRejection', (reason, promise) => {
        logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
        process.exit(1);
    });
}

/**
 * 애플리케이션 정보 출력
 */
function displayApplicationInfo() {
    logger.info('📋 Naverworks Message Cron Server');
    logger.info('🎯 Purpose: Team notification automation');
    logger.info('⚙️ Features:');
    logger.info('   - Weekly duty assignment');
    logger.info('   - Daily duty reminders');
    logger.info('   - Code review pair assignment');
    logger.info('   - Laptop duty notifications');
    logger.info('   - GitHub activity reports (optional)');
    logger.info('');
}

// 메인 실행
if (require.main === module) {
    displayApplicationInfo();
    startApplication();
}

module.exports = {
    startApplication,
    initializeApplication,
    setupGracefulShutdown
};
