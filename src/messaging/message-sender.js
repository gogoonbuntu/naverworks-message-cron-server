// 메시지 전송 모듈
// 네이버웍스, 슬랙, 이메일 등 다양한 채널로 메시지 전송

const logger = require('../../logger');
const NaverWorksMessenger = require('./naverworks-messenger');
const SlackMessenger = require('./slack-messenger');
const EmailMessenger = require('./email-messenger');

class MessageSender {
    constructor(config = {}) {
        this.config = config;
        this.messengers = {};
        this.initializeMessengers();
    }

    /**
     * 메신저 초기화
     */
    initializeMessengers() {
        try {
            // 네이버웍스 메신저
            if (this.config.naverworks?.enabled) {
                this.messengers.naverworks = new NaverWorksMessenger(this.config.naverworks);
            }

            // 슬랙 메신저
            if (this.config.slack?.enabled) {
                this.messengers.slack = new SlackMessenger(this.config.slack);
            }

            // 이메일 메신저
            if (this.config.email?.enabled) {
                this.messengers.email = new EmailMessenger(this.config.email);
            }

            logger.info(`Message sender initialized with ${Object.keys(this.messengers).length} messengers`);
        } catch (error) {
            logger.error(`Failed to initialize messengers: ${error.message}`);
        }
    }

    /**
     * 메시지 전송
     */
    async sendMessage(channel, message, options = {}) {
        try {
            const messenger = this.messengers[channel];
            
            if (!messenger) {
                throw new Error(`Messenger not found for channel: ${channel}`);
            }

            const result = await messenger.sendMessage(message, options);
            
            if (result.success) {
                logger.info(`Message sent successfully via ${channel}`);
            } else {
                logger.error(`Failed to send message via ${channel}: ${result.error}`);
            }

            return result;
        } catch (error) {
            logger.error(`Message sending failed for channel ${channel}: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * 다중 채널 메시지 전송
     */
    async sendToMultipleChannels(channels, message, options = {}) {
        try {
            const results = {};
            
            for (const channel of channels) {
                results[channel] = await this.sendMessage(channel, message, options);
            }
            
            return results;
        } catch (error) {
            logger.error(`Multi-channel message sending failed: ${error.message}`);
            return { error: error.message };
        }
    }

    /**
     * 방송 메시지 전송 (모든 활성 채널)
     */
    async broadcast(message, options = {}) {
        try {
            const activeChannels = Object.keys(this.messengers);
            return await this.sendToMultipleChannels(activeChannels, message, options);
        } catch (error) {
            logger.error(`Broadcast message failed: ${error.message}`);
            return { error: error.message };
        }
    }

    /**
     * 채널별 메시지 포맷 변환
     */
    formatMessageForChannel(channel, message, options = {}) {
        try {
            const messenger = this.messengers[channel];
            
            if (!messenger || !messenger.formatMessage) {
                return message;
            }
            
            return messenger.formatMessage(message, options);
        } catch (error) {
            logger.error(`Message formatting failed for channel ${channel}: ${error.message}`);
            return message;
        }
    }

    /**
     * 메신저 상태 확인
     */
    async getMessengerStatus(channel) {
        try {
            const messenger = this.messengers[channel];
            
            if (!messenger) {
                return { available: false, error: 'Messenger not found' };
            }

            if (messenger.getStatus) {
                return await messenger.getStatus();
            }

            return { available: true };
        } catch (error) {
            logger.error(`Failed to get messenger status for ${channel}: ${error.message}`);
            return { available: false, error: error.message };
        }
    }

    /**
     * 모든 메신저 상태 확인
     */
    async getAllMessengersStatus() {
        try {
            const statuses = {};
            
            for (const channel of Object.keys(this.messengers)) {
                statuses[channel] = await this.getMessengerStatus(channel);
            }
            
            return statuses;
        } catch (error) {
            logger.error(`Failed to get all messenger statuses: ${error.message}`);
            return {};
        }
    }

    /**
     * 메시지 템플릿 적용
     */
    applyTemplate(template, data) {
        try {
            let message = template;
            
            // 변수 치환
            for (const [key, value] of Object.entries(data)) {
                const regex = new RegExp(`{{${key}}}`, 'g');
                message = message.replace(regex, value);
            }
            
            return message;
        } catch (error) {
            logger.error(`Template application failed: ${error.message}`);
            return template;
        }
    }
}

module.exports = MessageSender;
