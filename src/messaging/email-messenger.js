// 이메일 메신저 구현
// SMTP를 통한 이메일 전송

const https = require('https');
const logger = require('../../logger');

class EmailMessenger {
    constructor(config) {
        this.config = config;
        this.transporter = null;
    }

    /**
     * 메시지 전송
     */
    async sendMessage(message, options = {}) {
        try {
            const emailData = {
                from: this.config.from || this.config.auth.user,
                to: options.to || this.config.defaultRecipients,
                subject: options.subject || '팀 알림',
                text: message
            };

            // HTML 메시지인 경우
            if (options.html || options.useHtml) {
                emailData.html = this.formatAsHtml(message);
            }

            // 첨부파일
            if (options.attachments) {
                emailData.attachments = options.attachments;
            }

            // 우선순위
            if (options.priority) {
                emailData.priority = options.priority;
            }

            const result = await this.sendEmail(emailData);
            
            if (result.success) {
                logger.info('Email sent successfully');
                return { success: true, messageId: result.messageId };
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            logger.error(`Failed to send email: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * 이메일 전송 (SMTP 또는 API 사용)
     */
    async sendEmail(emailData) {
        try {
            if (this.config.provider === 'smtp') {
                return await this.sendViaSMTP(emailData);
            } else if (this.config.provider === 'sendgrid') {
                return await this.sendViaSendGrid(emailData);
            } else if (this.config.provider === 'ses') {
                return await this.sendViaSES(emailData);
            } else {
                throw new Error('Unsupported email provider');
            }
        } catch (error) {
            logger.error(`Email sending failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * SMTP를 통한 이메일 전송
     */
    async sendViaSMTP(emailData) {
        // 실제 구현에서는 nodemailer 등을 사용
        // 여기서는 기본 구조만 제공
        try {
            logger.info('SMTP email sending (placeholder implementation)');
            return { 
                success: true, 
                messageId: 'smtp-' + Date.now(),
                provider: 'smtp'
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * SendGrid API를 통한 이메일 전송
     */
    async sendViaSendGrid(emailData) {
        try {
            const sendGridData = {
                personalizations: [{
                    to: Array.isArray(emailData.to) ? 
                        emailData.to.map(email => ({ email })) : 
                        [{ email: emailData.to }],
                    subject: emailData.subject
                }],
                from: { email: emailData.from },
                content: [{
                    type: emailData.html ? 'text/html' : 'text/plain',
                    value: emailData.html || emailData.text
                }]
            };

            const response = await this.makeRequest('POST', 'https://api.sendgrid.com/v3/mail/send', 
                JSON.stringify(sendGridData), {
                    'Authorization': `Bearer ${this.config.apiKey}`,
                    'Content-Type': 'application/json'
                }
            );

            return { 
                success: true, 
                messageId: response.headers['x-message-id'] || 'sendgrid-' + Date.now(),
                provider: 'sendgrid'
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * AWS SES를 통한 이메일 전송
     */
    async sendViaSES(emailData) {
        try {
            // AWS SES API 호출 구현
            logger.info('AWS SES email sending (placeholder implementation)');
            return { 
                success: true, 
                messageId: 'ses-' + Date.now(),
                provider: 'ses'
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * 메시지를 HTML로 포맷팅
     */
    formatAsHtml(message) {
        try {
            let html = message;
            
            // 줄바꿈을 <br>로 변환
            html = html.replace(/\n/g, '<br>');
            
            // 볼드 텍스트
            html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            
            // 이탤릭
            html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
            
            // 코드 블록
            html = html.replace(/```(.*?)```/gs, '<pre><code>$1</code></pre>');
            
            // 인라인 코드
            html = html.replace(/`(.*?)`/g, '<code>$1</code>');
            
            // 기본 HTML 구조로 래핑
            return `
                <html>
                <head>
                    <meta charset="UTF-8">
                    <style>
                        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                        pre { background-color: #f4f4f4; padding: 10px; border-radius: 5px; }
                        code { background-color: #f4f4f4; padding: 2px 4px; border-radius: 3px; }
                    </style>
                </head>
                <body>
                    ${html}
                </body>
                </html>
            `;
        } catch (error) {
            logger.error(`Failed to format HTML email: ${error.message}`);
            return message;
        }
    }

    /**
     * 메시지 포맷팅
     */
    formatMessage(message, options = {}) {
        try {
            if (options.useHtml) {
                return this.formatAsHtml(message);
            }
            
            // 텍스트 이메일 포맷팅
            let formattedMessage = message;
            
            // 이메일 길이 제한
            if (formattedMessage.length > 10000) {
                formattedMessage = formattedMessage.substring(0, 9900) + '\n\n... (메시지가 길어 일부 생략됨)';
            }
            
            return formattedMessage;
        } catch (error) {
            logger.error(`Failed to format email message: ${error.message}`);
            return message;
        }
    }

    /**
     * 상태 확인
     */
    async getStatus() {
        try {
            // 테스트 이메일 전송으로 상태 확인
            const testResult = await this.sendMessage('상태 확인 테스트', {
                to: this.config.testRecipient || this.config.from,
                subject: '이메일 서비스 상태 확인'
            });

            return { 
                available: testResult.success,
                provider: this.config.provider,
                lastTest: new Date().toISOString()
            };
        } catch (error) {
            logger.error(`Failed to get email status: ${error.message}`);
            return { available: false, error: error.message };
        }
    }

    /**
     * HTTP 요청 헬퍼
     */
    makeRequest(method, url, data = null, headers = {}) {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            
            const options = {
                hostname: urlObj.hostname,
                port: urlObj.port || 443,
                path: urlObj.pathname + urlObj.search,
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
                    const result = {
                        statusCode: res.statusCode,
                        headers: res.headers,
                        data: responseData
                    };

                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            result.data = JSON.parse(responseData);
                        } catch (error) {
                            // JSON이 아닌 응답도 허용
                        }
                        resolve(result);
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            req.setTimeout(30000);

            if (data) {
                req.write(data);
            }

            req.end();
        });
    }
}

module.exports = EmailMessenger;
