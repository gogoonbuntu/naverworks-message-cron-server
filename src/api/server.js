// Express 서버 설정
// REST API 및 웹 인터페이스 제공

const express = require('express');
const path = require('path');
const logger = require('../../logger');

// 라우터 임포트
const apiRoutes = require('./routes/api');
const githubRoutes = require('./routes/github');
const configRoutes = require('./routes/config');
const scheduleRoutes = require('./routes/schedule');
const webRoutes = require('./routes/web');

class Server {
    constructor(config = {}) {
        this.app = express();
        this.port = config.port || process.env.PORT || 3000;
        this.config = config;
        this.server = null;
        
        this.setupMiddleware();
        this.setupRoutes();
        this.setupErrorHandling();
    }

    /**
     * 미들웨어 설정
     */
    setupMiddleware() {
        // Body parsing middleware
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

        // CORS 설정
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
            
            if (req.method === 'OPTIONS') {
                res.sendStatus(200);
            } else {
                next();
            }
        });

        // 요청 로깅
        this.app.use((req, res, next) => {
            logger.info(`${req.method} ${req.path} - ${req.ip}`);
            next();
        });

        // 정적 파일 서빙 (웹 인터페이스)
        if (this.config.enableWebInterface !== false) {
            this.app.use('/static', express.static(path.join(__dirname, '../web/static')));
        }
    }

    /**
     * 라우터 설정
     */
    setupRoutes() {
        // 기본 홈 페이지 - 웹 인터페이스 제공
        this.app.get('/', (req, res) => {
            // 웹 인터페이스가 활성화된 경우 index.html 제공
            if (this.config.enableWebInterface !== false) {
                try {
                    res.sendFile(path.join(__dirname, '../web/index.html'));
                } catch (error) {
                    logger.error('Failed to serve index.html:', error);
                    res.status(500).json({
                        error: 'Failed to load web interface',
                        message: 'Web interface file not found'
                    });
                }
            } else {
                // 웹 인터페이스가 비활성화된 경우 API 정보 제공
                res.json({
                    status: 'running',
                    service: 'Naverworks Message Cron Server',
                    version: '1.0.0',
                    timestamp: new Date().toISOString(),
                    message: 'Web interface is disabled. API endpoints available.',
                    endpoints: {
                        api: '/api',
                        github: '/api/github',
                        config: '/api/config',
                        schedule: '/api/schedule'
                    }
                });
            }
        });

        // API 정보 조회 (JSON 응답 전용)
        this.app.get('/api-info', (req, res) => {
            res.json({
                status: 'running',
                service: 'Naverworks Message Cron Server',
                version: '1.0.0',
                timestamp: new Date().toISOString(),
                endpoints: {
                    api: '/api',
                    github: '/api/github',
                    config: '/api/config',
                    schedule: '/api/schedule'
                }
            });
        });

        // Health check
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                version: process.version
            });
        });

        // API 라우터
        this.app.use('/api', apiRoutes);
        this.app.use('/api/github', githubRoutes);
        this.app.use('/api/config', configRoutes);
        this.app.use('/api/schedule', scheduleRoutes);
        
        // 웹 인터페이스 API 라우터
        this.app.use('/', webRoutes);

        // 웹 인터페이스 (Single Page Application)
        if (this.config.enableWebInterface !== false) {
            this.app.get('/web/*', (req, res) => {
                res.sendFile(path.join(__dirname, '../web/index.html'));
            });

            // 기본 웹 인터페이스 리다이렉트
            this.app.get('/dashboard', (req, res) => {
                res.redirect('/');
            });
        }

        // 404 핸들러
        this.app.use('*', (req, res) => {
            res.status(404).json({
                error: 'Not Found',
                message: `Endpoint ${req.originalUrl} not found`,
                availableEndpoints: [
                    '/',
                    '/health',
                    '/api',
                    '/api/github',
                    '/api/config',
                    '/api/schedule'
                ]
            });
        });
    }

    /**
     * 에러 핸들링 설정
     */
    setupErrorHandling() {
        // 글로벌 에러 핸들러
        this.app.use((error, req, res, next) => {
            logger.error(`Server error on ${req.method} ${req.path}: ${error.message}`, error);
            
            res.status(error.status || 500).json({
                error: 'Internal Server Error',
                message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
                timestamp: new Date().toISOString(),
                path: req.path
            });
        });
    }

    /**
     * 서버 시작
     */
    start(callback = null) {
        try {
            this.server = this.app.listen(this.port, () => {
                logger.info(`Server started on port ${this.port}`);
                logger.info(`Homepage available at: http://localhost:${this.port}/`);
                logger.info(`API available at: http://localhost:${this.port}/api`);
                
                if (this.config.enableWebInterface !== false) {
                    logger.info(`Web interface available at: http://localhost:${this.port}/`);
                }
                
                if (callback) callback();
            });

            return this.server;
        } catch (error) {
            logger.error(`Failed to start server: ${error.message}`, error);
            throw error;
        }
    }

    /**
     * 서버 중지
     */
    stop(callback = null) {
        if (this.server) {
            this.server.close((error) => {
                if (error) {
                    logger.error(`Error stopping server: ${error.message}`, error);
                } else {
                    logger.info('Server stopped successfully');
                }
                
                if (callback) callback(error);
            });
        } else {
            if (callback) callback();
        }
    }

    /**
     * Express 앱 인스턴스 반환
     */
    getApp() {
        return this.app;
    }

    /**
     * 서버 상태 반환
     */
    getStatus() {
        return {
            isRunning: !!this.server,
            port: this.port,
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            connections: this.server ? this.server.listening : false
        };
    }
}

// 싱글톤 인스턴스
let serverInstance = null;

/**
 * 서버 시작 함수
 */
function startServer(callback = null, config = {}) {
    try {
        if (serverInstance) {
            logger.warn('Server already running');
            if (callback) callback();
            return serverInstance.server;
        }

        serverInstance = new Server(config);
        return serverInstance.start(callback);
    } catch (error) {
        logger.error(`Failed to start server: ${error.message}`, error);
        throw error;
    }
}

/**
 * 서버 중지 함수
 */
function stopServer(server = null, callback = null) {
    try {
        if (serverInstance) {
            serverInstance.stop(callback);
            serverInstance = null;
        } else if (server) {
            server.close(callback);
        } else {
            if (callback) callback();
        }
    } catch (error) {
        logger.error(`Failed to stop server: ${error.message}`, error);
        if (callback) callback(error);
    }
}

/**
 * 서버 인스턴스 반환
 */
function getServerInstance() {
    return serverInstance;
}

module.exports = {
    Server,
    startServer,
    stopServer,
    getServerInstance
};
