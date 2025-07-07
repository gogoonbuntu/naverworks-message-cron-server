// src 모듈 진입점
// 모든 하위 모듈들을 통합 관리

const services = require('./services');
const github = require('./github');
const messaging = require('./messaging');
const utils = require('./utils');
const api = require('./api/server');

module.exports = {
    services,
    github,
    messaging,
    utils,
    api
};
