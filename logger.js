// logger.js
// 단순화된 Winston 로깅 설정

const winston = require('winston');
const path = require('path');
const fs = require('fs');

// 로그 디렉토리 생성
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
}

// 단순한 로그 포맷
const logFormat = winston.format.combine(
    winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack }) => {
        if (stack) {
            return `[${timestamp}] ${level.toUpperCase()}: ${message}\n${stack}`;
        }
        return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    })
);

// Winston 로거 생성 (app.log만 사용)
const logger = winston.createLogger({
    level: 'info',
    format: logFormat,
    transports: [
        // 콘솔 출력
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                logFormat
            )
        }),
        
        // 모든 로그를 app.log에 저장
        new winston.transports.File({
            filename: path.join(logDir, 'app.log'),
            maxsize: 10 * 1024 * 1024, // 10MB
            maxFiles: 3,
            tailable: true
        })
    ]
});

// 메시지 전송 로그 함수
logger.logMessageSent = function(recipient, type, success, errorDetails = null) {
    const status = success ? 'SUCCESS' : 'FAILED';
    let message = `Message ${status} - Recipient: ${recipient}, Type: ${type}`;
    
    if (!success && errorDetails) {
        message += `, Error: ${errorDetails}`;
        logger.error(message);
    } else {
        logger.info(message);
    }
};

// API 호출 로그 함수
logger.logApiCall = function(method, url, statusCode, duration) {
    const message = `API Call - Method: ${method}, URL: ${url}, Status: ${statusCode}, Duration: ${duration}ms`;
    if (statusCode >= 200 && statusCode < 300) {
        logger.info(message);
    } else {
        logger.warn(message);
    }
};

// 스케줄된 작업 로그 함수
logger.logScheduledTask = function(taskType, cronSchedule, details) {
    const message = `Scheduled Task - Type: ${taskType}, Schedule: ${cronSchedule}, Details: ${details}`;
    logger.info(message);
};

// 설정 변경 로그 함수
logger.logConfigChange = function(configType, description, newValue = null) {
    let message = `Config Change - Type: ${configType}, Description: ${description}`;
    
    if (newValue && Array.isArray(newValue)) {
        message += `, Count: ${newValue.length}`;
    } else if (newValue && typeof newValue === 'object') {
        message += `, Keys: ${Object.keys(newValue).join(', ')}`;
    }
    
    logger.info(message);
    
    // 디버그 레벨에서 상세한 새 값 로그 (너무 크지 않은 경우만)
    if (newValue && JSON.stringify(newValue).length < 1000) {
        logger.debug(`Config Change Details: ${JSON.stringify(newValue, null, 2)}`);
    }
};

module.exports = logger;
