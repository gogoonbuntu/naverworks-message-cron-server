// src/server.js
// HTTP 서버 설정

const http = require('http');
const logger = require('../logger');
const { handleWebRoutes } = require('./routes/web-routes');

const PORT = process.env.PORT || 3000;

/**
 * HTTP 서버 생성 및 설정
 * @returns {Object} - HTTP 서버 인스턴스
 */
function createServer() {
    // SSL 인증서 유효성 검사 비활성화 (개발/테스트 환경)
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    
    const server = http.createServer(handleWebRoutes);
    
    // 서버 이벤트 리스너 설정
    server.on('error', (error) => {
        logger.error(`Server error: ${error.message}`, error);
    });
    
    server.on('close', () => {
        logger.info('Server closed');
    });
    
    return server;
}

/**
 * 서버 시작
 * @param {Function} callback - 서버 시작 후 실행할 콜백 함수
 * @returns {Object} - HTTP 서버 인스턴스
 */
function startServer(callback) {
    const server = createServer();
    
    server.listen(PORT, () => {
        logger.info(`Web server started successfully on http://localhost:${PORT}`);
        logger.info("You can access the web interface to manage messages and team settings.");
        
        if (callback) {
            callback(server);
        }
    });
    
    return server;
}

/**
 * 서버 종료
 * @param {Object} server - HTTP 서버 인스턴스
 * @param {Function} callback - 서버 종료 후 실행할 콜백 함수
 */
function stopServer(server, callback) {
    if (server) {
        server.close(() => {
            logger.info('Server shutdown completed successfully.');
            if (callback) {
                callback();
            }
        });
    }
}

/**
 * 서버 포트 반환
 * @returns {number} - 서버 포트 번호
 */
function getServerPort() {
    return PORT;
}

module.exports = {
    createServer,
    startServer,
    stopServer,
    getServerPort
};
