// src/services/message-service.js
// 메시지 전송 서비스

const fetch = require('node-fetch');
const logger = require('../../logger');

// 설정 변수
const NAVERWORKS_API_URL_BASE = "https://naverworks.danal.co.kr/message/direct/alarm/users/";
const NAVERWORKS_CHANNEL_API_URL = "https://naverworks.danal.co.kr/message/alarm/channels/daonbe1";
const RECIPIENT_DOMAIN = "@danal.co.kr";

const REQUEST_HEADERS = {
    'Content-Type': 'text/plain; charset=UTF-8'
};

const CHANNEL_REQUEST_HEADERS = {
    'Content-Type': 'application/json'
};

/**
 * 채널로 메시지 전송 (주간당직, 당직알림, 코드리뷰용)
 * @param {string} messageText - 전송할 메시지
 */
async function sendChannelMessage(messageText) {
    logger.debug(`Attempting to send channel message`);
    logger.debug(`Channel API URL: ${NAVERWORKS_CHANNEL_API_URL}`);
    logger.debug(`Message content: ${messageText}`);

    try {
        const startTime = Date.now();
        const messageBody = Buffer.from(messageText, 'utf8');
        
        const response = await fetch(NAVERWORKS_CHANNEL_API_URL, {
            method: 'POST',
            headers: CHANNEL_REQUEST_HEADERS,
            body: messageBody
        });
        const duration = Date.now() - startTime;

        logger.debug(`Response status: ${response.status} ${response.statusText}`);
        logger.debug(`Response headers: ${JSON.stringify(Object.fromEntries(response.headers))}`);

        if (response.ok) {
            try {
                const data = await response.json();
                logger.debug(`Channel API Response data: ${JSON.stringify(data)}`);
                
                if (data.resCode === '0000') {
                    logger.logMessageSent('daonbe1_channel', 'channel', true);
                    logger.info(`Channel message sent successfully`);
                } else {
                    const errorDetails = `resCode: ${data.resCode}, resMsg: ${data.resMsg || 'No message'}, data: ${JSON.stringify(data)}`;
                    logger.logMessageSent('daonbe1_channel', 'channel', false, errorDetails);
                    logger.error(`Channel message send failed - ${errorDetails}`);
                }
            } catch (parseError) {
                // JSON 파싱 실패시 텍스트로 응답 확인
                const responseText = await response.text();
                logger.debug(`Channel API Response (text): ${responseText}`);
                logger.logMessageSent('daonbe1_channel', 'channel', true);
                logger.info(`Channel message sent successfully (non-JSON response)`);
            }
        } else {
            const errorText = await response.text();
            const errorMsg = `HTTP ${response.status}: ${errorText}`;
            logger.logMessageSent('daonbe1_channel', 'channel', false, errorMsg);
            logger.error(`HTTP error when sending to channel: ${errorMsg}`);
        }
        
        logger.logApiCall('POST', NAVERWORKS_CHANNEL_API_URL, response.status, duration);
    } catch (error) {
        logger.logMessageSent('daonbe1_channel', 'channel', false, error.message);
        logger.error(`Network error when sending to channel: ${error.message}`, error);
    }
}

/**
 * 단일 수신자에게 메시지 전송
 * @param {string} recipientEmail - 수신자 이메일
 * @param {string} messageText - 전송할 메시지
 */
async function sendSingleMessage(recipientEmail, messageText) {
    const api_url = `${NAVERWORKS_API_URL_BASE}${recipientEmail}`;
    const messageBody = messageText;

    logger.debug(`Attempting to send message to ${recipientEmail}`);
    logger.debug(`API URL: ${api_url}`);
    logger.debug(`Message content: ${messageText}`);

    try {
        const startTime = Date.now();
        const response = await fetch(api_url, {
            method: 'POST',
            headers: REQUEST_HEADERS,
            body: messageBody
        });
        const duration = Date.now() - startTime;

        logger.debug(`Response status: ${response.status} ${response.statusText}`);

        if (response.ok) {
            const data = await response.json();
            logger.debug(`API Response data: ${JSON.stringify(data)}`);
            
            if (data.resCode === '0000') {
                logger.logMessageSent(recipientEmail, 'single', true);
                logger.info(`Message sent successfully to ${recipientEmail}`);
            } else {
                const errorDetails = `resCode: ${data.resCode}, resMsg: ${data.resMsg || 'No message'}, data: ${JSON.stringify(data)}`;
                logger.logMessageSent(recipientEmail, 'single', false, errorDetails);
                logger.error(`Message send failed for ${recipientEmail} - ${errorDetails}`);
            }
        } else {
            const errorText = await response.text();
            const errorMsg = `HTTP ${response.status}: ${errorText}`;
            logger.logMessageSent(recipientEmail, 'single', false, errorMsg);
            logger.error(`HTTP error when sending to ${recipientEmail}: ${errorMsg}`);
        }
        
        logger.logApiCall('POST', api_url, response.status, duration);
    } catch (error) {
        logger.logMessageSent(recipientEmail, 'single', false, error.message);
        logger.error(`Network error when sending to ${recipientEmail}: ${error.message}`, error);
    }
}

/**
 * 여러 수신자에게 메시지 전송
 * @param {string} messageText - 전송할 메시지
 * @param {string} recipientsString - 수신자 ID 문자열 (콤마로 구분)
 */
async function sendMessagesToMultipleRecipients(messageText, recipientsString) {
    try {
        const recipientIDs = recipientsString.split(',').map(id => id.trim()).filter(id => id.length > 0);
        logger.info(`Starting bulk message send to ${recipientIDs.length} recipients`);
        logger.debug(`Recipients: ${recipientIDs.join(', ')}`);
        
        for (const id of recipientIDs) {
            const recipientEmail = `${id}${RECIPIENT_DOMAIN}`;
            await sendSingleMessage(recipientEmail, messageText);
            await new Promise(resolve => setTimeout(resolve, 100)); // Rate limiting
        }
        
        logger.info(`Completed bulk message send to ${recipientIDs.length} recipients`);
    } catch (error) {
        logger.error(`Error in bulk message send: ${error.message}`, error);
    }
}

/**
 * 메시지 전송 설정 반환
 * @returns {Object} - 메시지 전송 설정 객체
 */
function getMessageConfig() {
    return {
        NAVERWORKS_API_URL_BASE,
        NAVERWORKS_CHANNEL_API_URL,
        RECIPIENT_DOMAIN,
        REQUEST_HEADERS,
        CHANNEL_REQUEST_HEADERS
    };
}

module.exports = {
    sendChannelMessage,
    sendSingleMessage,
    sendMessagesToMultipleRecipients,
    getMessageConfig
};
