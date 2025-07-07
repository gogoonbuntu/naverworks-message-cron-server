// 네이버웍스 메신저 구현
// 네이버웍스 API를 통한 메시지 전송

const https = require('https');
const querystring = require('querystring');
const logger = require('../../logger');

class NaverWorksMessenger {
    constructor(config) {
        this.config = config;
        this.accessToken = null;
        this.tokenExpiry = null;
        this.baseUrl = 'https://www.worksapis.com/v1.0';
    }

    /**
     * 액세스 토큰 발급
     */
    async getAccessToken() {
        try {
            if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
                return this.accessToken;
            }

            const postData = querystring.stringify({
                grant_type: 'client_credentials',
                client_id: this.config.clientId,
                client_secret: this.config.clientSecret,
                scope: 'bot'
            });

            const response = await this.makeRequest('POST', '/oauth2/token', postData, {
                'Content-Type': 'application/x-www-form-urlencoded'
            });

            if (response.access_token) {
                this.accessToken = response.access_token;
                this.tokenExpiry = Date.now() + (response.expires_in * 1000) - 300000; // 5분 여유
                logger.info('NaverWorks access token obtained');
                return this.accessToken;
            }

            throw new Error('Failed to obtain access token');
        } catch (error) {
            logger.error(`Failed to get NaverWorks access token: ${error.message}`);
            throw error;
        }
    }

    /**
     * 메시지 전송
     */
    async sendMessage(message, options = {}) {
        try {
            const token = await this.getAccessToken();
            
            const messageData = {
                content: {
                    type: 'text',
                    text: message
                }
            };

            // 채널 또는 개인 메시지 설정
            if (options.channelId) {
                messageData.channelId = options.channelId;
            } else if (options.userId) {
                messageData.userId = options.userId;
            } else {
                messageData.channelId = this.config.defaultChannelId;
            }

            // 메시지 유형 설정
            if (options.messageType) {
                messageData.content.type = options.messageType;
            }

            // 첨부파일 추가
            if (options.attachments) {
                messageData.content.attachments = options.attachments;
            }

            // 버튼 추가
            if (options.buttons) {
                messageData.content.buttons = options.buttons;
            }

            const response = await this.makeRequest('POST', '/bots/messages', JSON.stringify(messageData), {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            });

            logger.info('NaverWorks message sent successfully');
            return { success: true, messageId: response.messageId };
        } catch (error) {
            logger.error(`Failed to send NaverWorks message: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * 메시지 포맷팅
     */
    formatMessage(message, options = {}) {
        try {
            let formattedMessage = message;

            // 네이버웍스 마크다운 변환
            if (options.useMarkdown !== false) {
                // 볼드 텍스트
                formattedMessage = formattedMessage.replace(/\*\*(.*?)\*\*/g, '*$1*');
                
                // 이탤릭
                formattedMessage = formattedMessage.replace(/\*(.*?)\*/g, '_$1_');
                
                // 코드 블록
                formattedMessage = formattedMessage.replace(/```(.*?)```/gs, '`$1`');
            }

            // 길이 제한
            if (formattedMessage.length > 4000) {
                formattedMessage = formattedMessage.substring(0, 3900) + '\n\n... (메시지가 길어 일부 생략됨)';
            }

            return formattedMessage;
        } catch (error) {
            logger.error(`Failed to format NaverWorks message: ${error.message}`);
            return message;
        }
    }

    /**
     * 채널 목록 조회
     */
    async getChannels() {
        try {
            const token = await this.getAccessToken();
            
            const response = await this.makeRequest('GET', '/bots/channels', null, {
                'Authorization': `Bearer ${token}`
            });

            return { success: true, channels: response.channels };
        } catch (error) {
            logger.error(`Failed to get NaverWorks channels: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * 사용자 목록 조회
     */
    async getUsers() {
        try {
            const token = await this.getAccessToken();
            
            const response = await this.makeRequest('GET', '/users', null, {
                'Authorization': `Bearer ${token}`
            });

            return { success: true, users: response.users };
        } catch (error) {
            logger.error(`Failed to get NaverWorks users: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * 상태 확인
     */
    async getStatus() {
        try {
            const token = await this.getAccessToken();
            
            // 봇 정보 조회로 상태 확인
            const response = await this.makeRequest('GET', '/bots/me', null, {
                'Authorization': `Bearer ${token}`
            });

            return { 
                available: true, 
                botInfo: response,
                tokenExpiry: this.tokenExpiry 
            };
        } catch (error) {
            logger.error(`Failed to get NaverWorks status: ${error.message}`);
            return { available: false, error: error.message };
        }
    }

    /**
     * HTTP 요청 헬퍼
     */
    makeRequest(method, path, data = null, headers = {}) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'www.worksapis.com',
                port: 443,
                path: `/v1.0${path}`,
                method: method,
                headers: headers
            };

            if (data) {
                options.headers['Content-Length'] = Buffer.byteLength(data);
            }

            const req = https.request(options, (res) => {
                let responseData = '';

                res.on('data', (chunk) => {
                    responseData += chunk;
                });

                res.on('end', () => {
                    try {
                        const parsedData = JSON.parse(responseData);
                        
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            resolve(parsedData);
                        } else {
                            reject(new Error(`HTTP ${res.statusCode}: ${parsedData.error || responseData}`));
                        }
                    } catch (error) {
                        reject(new Error(`Invalid JSON response: ${responseData}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            req.setTimeout(30000); // 30초 타임아웃

            if (data) {
                req.write(data);
            }

            req.end();
        });
    }
}

module.exports = NaverWorksMessenger;
