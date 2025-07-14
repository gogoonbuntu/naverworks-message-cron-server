// src/services/github-service.js
// GitHub 서비스 - 새로운 모듈식 서비스로 리다이렉트

const GitHubServiceMain = require('../github/github-service-main');

// 기존 인터페이스 유지를 위해 새로운 서비스를 래핑
module.exports = GitHubServiceMain;