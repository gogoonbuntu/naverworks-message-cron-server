// 슬랙 메신저 구현
// 슬랙 API를 통한 메시지 전송

const https = require('https');
const logger = require('../../logger');

class SlackMessenger {
    constructor(config) {
        this.config = config;
        this.baseUrl = 'https://slack.com/api';
    }

    /**
     * 메시지 전송
     */
    async sendMessage(message, options = {}) {
        try {
            const messageData = {
                text: message,
                channel: options.channelId || this.config.defaultChannelId
            };

            // 메시지 포맷팅 옵션
            if (options.username) {
                messageData.username = options.username;
            }

            if (options.iconEmoji) {
                messageData.icon_emoji = options.iconEmoji;
            }

            if (options.attachments) {
                messageData.attachments = options.attachments;
            }

            if (options.blocks) {
                messageData.blocks = options.blocks;
            }

            const response = await this.makeRequest('POST', '/chat.postMessage', messageData);

            if (response.ok) {
                logger.info('Slack message sent successfully');
                return { success: true, messageId: response.ts };
            } else {
                throw new Error(response.error || 'Unknown error');
            }
        } catch (error) {
            logger.error(`Failed to send Slack message: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * 메시지 포맷팅
     */
    formatMessage(message, options = {}) {
        try {
            let formattedMessage = message;

            // 슬랙 마크다운 변환
            if (options.useMarkdown !== false) {
                // 볼드 텍스트
                formattedMessage = formattedMessage.replace(/\*\*(.*?)\*\*/g, '*$1*');
                
                // 이탤릭
                formattedMessage = formattedMessage.replace(/\*(.*?)\*/g, '_$1_');
                
                // 코드 블록
                formattedMessage = formattedMessage.replace(/```(.*?)```/gs, '```$1```');
            }

            return formattedMessage;
        } catch (error) {
            logger.error(`Failed to format Slack message: ${error.message}`);
            return message;
        }
    }

    /**
     * 채널 목록 조회
     */
    async getChannels() {
        try {
            const response = await this.makeRequest('GET', '/conversations.list');

            if (response.ok) {
                return { success: true, channels: response.channels };
            } else {
                throw new Error(response.error || 'Unknown error');
            }
        } catch (error) {
            logger.error(`Failed to get Slack channels: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * 사용자 목록 조회
     */
    async getUsers() {
        try {
            const response = await this.makeRequest('GET', '/users.list');

            if (response.ok) {
                return { success: true, users: response.members };
            } else {
                throw new Error(response.error || 'Unknown error');
            }
        } catch (error) {
            logger.error(`Failed to get Slack users: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * 상태 확인
     */
    async getStatus() {
        try {
            const response = await this.makeRequest('GET', '/auth.test');

            if (response.ok) {
                return { 
                    available: true, 
                    botInfo: {
                        user: response.user,
                        userId: response.user_id,
                        team: response.team,
                        teamId: response.team_id
                    }
                };
            } else {
                throw new Error(response.error || 'Unknown error');
            }
        } catch (error) {
            logger.error(`Failed to get Slack status: ${error.message}`);
            return { available: false, error: error.message };
        }
    }

    /**
     * HTTP 요청 헬퍼
     */
    makeRequest(method, path, data = null) {
        return new Promise((resolve, reject) => {
            const headers = {
                'Authorization': `Bearer ${this.config.botToken}`,
                'Content-Type': 'application/json'
            };

            let requestData = null;
            let requestPath = path;

            if (method === 'GET' && data) {
                const params = new URLSearchParams(data).toString();
                requestPath = `${path}?${params}`;
            } else if (method === 'POST' && data) {
                requestData = JSON.stringify(data);
                headers['Content-Length'] = Buffer.byteLength(requestData);
            }

            const options = {
                hostname: 'slack.com',
                port: 443,
                path: `/api${requestPath}`,
                method: method,
                headers: headers
            };

            const req = https.request(options, (res) => {
                let responseData = '';

                res.on('data', (chunk) => {
                    responseData += chunk;
                });

                res.on('end', () => {
                    try {
                        const parsedData = JSON.parse(responseData);
                        resolve(parsedData);
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

            req.setTimeout(30000);

            if (requestData) {
                req.write(requestData);
            }

            req.end();
        });
    }
}

module.exports = SlackMessenger;
