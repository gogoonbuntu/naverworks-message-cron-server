// app.js
// 네이버웍스 메시지 자동 알림 스케줄러 - 메인 진입점

const logger = require('./logger');
const { startServer, stopServer } = require('./src/server');
const configService = require('./src/services/config-service');
const scheduleService = require('./src/services/schedule-service');

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
        const initialConfig = configService.loadConfig();
        logger.info(`Configuration loaded: ${initialConfig.teamMembers.length} team members, ${initialConfig.schedules.length} custom schedules`);
        
        // 스케줄링 시작
        scheduleService.rescheduleJobs(initialConfig);
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
