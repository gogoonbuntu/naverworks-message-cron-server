// 메시징 모듈 진입점
// 다양한 메시지 전송 채널을 위한 통합 모듈

const MessageSender = require('./message-sender');
const NaverWorksMessenger = require('./naverworks-messenger');
const SlackMessenger = require('./slack-messenger');
const EmailMessenger = require('./email-messenger');

module.exports = {
    MessageSender,
    NaverWorksMessenger,
    SlackMessenger,
    EmailMessenger
};
