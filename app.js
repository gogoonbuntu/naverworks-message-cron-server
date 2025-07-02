// app.js
// 네이버웍스 메시지 자동 알림 스케줄러
// 웹 인터페이스, 스케줄 관리, 팀원 관리, 노트북 지참 및 코드리뷰 짝꿍 알림 기능

// SSL 인증서 유효성 검사 비활성화 (개발/테스트 환경)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// 필요한 모듈 임포트
const http = require('http');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const cron = require('node-cron');

// 설정 변수
const NAVERWORKS_API_URL_BASE = "https://naverworks.danal.co.kr/message/direct/alarm/users/";
const SENDER_ID = "alarm";
const RECIPIENT_DOMAIN = "@danal.co.kr";
const REQUEST_HEADERS = {
    'Content-Type': 'application/json; charset=UTF-8'
};
const CONFIG_FILE = path.join(__dirname, 'config.json');
const PORT = 3000;

// 스케줄 관리 변수
let scheduledJobs = {};

// 설정 파일 로드 함수
function loadConfig() {
    const defaultConfig = { schedules: [], teamMembers: [], currentLaptopDutyPair: [] };
    
    if (!fs.existsSync(CONFIG_FILE)) {
        console.log(`[${new Date().toISOString()}] 설정 파일이 없습니다. 기본 설정으로 초기화합니다.`);
        saveConfig(defaultConfig);
        return defaultConfig;
    }
    
    try {
        const configRaw = fs.readFileSync(CONFIG_FILE, 'utf8');
        const config = JSON.parse(configRaw);
        
        // 필수 속성 확인 및 초기화
        if (!config.schedules) config.schedules = [];
        if (!config.teamMembers) config.teamMembers = [];
        if (!config.currentLaptopDutyPair) config.currentLaptopDutyPair = [];
        
        console.log(`[${new Date().toISOString()}] 설정 파일 로드 완료. 스케줄 ${config.schedules.length}개, 팀원 ${config.teamMembers.length}명`);
        return config;
    } catch (e) {
        console.error(`[${new Date().toISOString()}] 설정 파일 파싱 오류:`, e.message);
        console.log(`[${new Date().toISOString()}] 기본 설정으로 초기화합니다.`);
        saveConfig(defaultConfig);
        return defaultConfig;
    }
}

// 설정 파일 저장 함수
function saveConfig(config) {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
        console.log(`[${new Date().toISOString()}] 설정 파일 저장 완료`);
    } catch (error) {
        console.error(`[${new Date().toISOString()}] 설정 파일 저장 실패:`, error.message);
        throw error;
    }
}

// 단일 수신자에게 메시지 전송
async function sendSingleMessage(recipientEmail, messageText) {
    const api_url = `${NAVERWORKS_API_URL_BASE}${SENDER_ID}/users/${recipientEmail}`;
    const messageBody = JSON.stringify({
        content: {
            type: "text",
            text: messageText
        }
    });

    try {
        const response = await fetch(api_url, {
            method: 'POST',
            headers: REQUEST_HEADERS,
            body: messageBody
        });

        if (response.ok) {
            const data = await response.json();
            if (data.resCode === '0000') {
                console.log(`[${new Date().toISOString()}] 메시지 전송 성공 (${recipientEmail}):`, data);
            } else {
                console.error(`[${new Date().toISOString()}] 메시지 전송 실패 (${recipientEmail}) - resCode: ${data.resCode}`);
            }
        } else {
            const errorText = await response.text();
            console.error(`[${new Date().toISOString()}] HTTP 오류 (${recipientEmail}) - ${response.status}: ${errorText}`);
        }
    } catch (error) {
        console.error(`[${new Date().toISOString()}] 네트워크 오류 (${recipientEmail}):`, error.message);
    }
}

// 여러 수신자에게 메시지 전송
async function sendMessagesToMultipleRecipients(messageText, recipientsString) {
    const recipientIDs = recipientsString.split(',').map(id => id.trim()).filter(id => id.length > 0);
    for (const id of recipientIDs) {
        const recipientEmail = `${id}${RECIPIENT_DOMAIN}`;
        await sendSingleMessage(recipientEmail, messageText);
        await new Promise(resolve => setTimeout(resolve, 100));
    }
}

// 노트북 지참 알림 배정 및 전송
async function assignLaptopDutyAndSendMessage() {
    const config = loadConfig();
    let teamMembers = config.teamMembers;

    const todayKST = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Seoul"})).getDay();
    
    let selectedPair = [];
    let message = "⚠️ 노트북 지참 알림 ⚠️\n\n오늘 노트북 지참 당번은 다음과 같습니다:\n";

    if (todayKST === 5) { // 금요일
        const authorizedMembers = teamMembers.filter(member => member.isAuthorized);
        authorizedMembers.sort((a, b) => a.laptopDutyCount - b.laptopDutyCount);
        const selectedAuthorized = authorizedMembers.length > 0 ? authorizedMembers[0] : null;

        const otherMembers = teamMembers.filter(member => !member.isAuthorized || member.id !== (selectedAuthorized ? selectedAuthorized.id : null));
        otherMembers.sort((a, b) => a.laptopDutyCount - b.laptopDutyCount);
        const selectedOther = otherMembers.length > 0 ? otherMembers[0] : null;

        if (selectedAuthorized && selectedOther) {
            selectedPair = [selectedAuthorized.id, selectedOther.id];
            teamMembers.find(m => m.id === selectedAuthorized.id).laptopDutyCount++;
            teamMembers.find(m => m.id === selectedOther.id).laptopDutyCount++;
            message += `- ${teamMembers.find(m => m.id === selectedAuthorized.id).name} (${selectedAuthorized.id})\n`;
            message += `- ${teamMembers.find(m => m.id === selectedOther.id).name} (${selectedOther.id})\n`;
        } else if (teamMembers.length >= 2) {
            teamMembers.sort((a, b) => a.laptopDutyCount - b.laptopDutyCount);
            selectedPair = [teamMembers[0].id, teamMembers[1].id];
            teamMembers.find(m => m.id === teamMembers[0].id).laptopDutyCount++;
            teamMembers.find(m => m.id === teamMembers[1].id).laptopDutyCount++;
            message += `- ${teamMembers.find(m => m.id === teamMembers[0].id).name} (${teamMembers[0].id})\n`;
            message += `- ${teamMembers.find(m => m.id === teamMembers[1].id).name} (${teamMembers[1].id})\n`;
        } else {
            message = "⚠️ 노트북 지참 알림 ⚠️\n\n팀원이 부족하여 노트북 당번을 배정할 수 없습니다.";
            selectedPair = [];
        }
        
        config.currentLaptopDutyPair = selectedPair;
        saveConfig(config);

    } else if (todayKST === 6 || todayKST === 0) { // 토/일요일
        if (config.currentLaptopDutyPair && config.currentLaptopDutyPair.length === 2) {
            selectedPair = config.currentLaptopDutyPair;
            const member1 = teamMembers.find(m => m.id === selectedPair[0]);
            const member2 = teamMembers.find(m => m.id === selectedPair[1]);
            message += `- ${member1 ? member1.name : selectedPair[0]} (${selectedPair[0]})\n`;
            message += `- ${member2 ? member2.name : selectedPair[1]} (${selectedPair[1]})\n`;
        } else {
            message = "⚠️ 노트북 지참 알림 ⚠️\n\n금요일 당번 정보가 없어 당번을 배정할 수 없습니다.";
            selectedPair = [];
        }
    } else { // 월~목요일
        const authorizedMembers = teamMembers.filter(member => member.isAuthorized);
        authorizedMembers.sort((a, b) => a.laptopDutyCount - b.laptopDutyCount);
        const selectedAuthorized = authorizedMembers.length > 0 ? authorizedMembers[0] : null;

        const otherMembers = teamMembers.filter(member => !member.isAuthorized || member.id !== (selectedAuthorized ? selectedAuthorized.id : null));
        otherMembers.sort((a, b) => a.laptopDutyCount - b.laptopDutyCount);
        const selectedOther = otherMembers.length > 0 ? otherMembers[0] : null;

        if (selectedAuthorized && selectedOther) {
            selectedPair = [selectedAuthorized.id, selectedOther.id];
            teamMembers.find(m => m.id === selectedAuthorized.id).laptopDutyCount++;
            teamMembers.find(m => m.id === selectedOther.id).laptopDutyCount++;
            message += `- ${teamMembers.find(m => m.id === selectedAuthorized.id).name} (${selectedAuthorized.id})\n`;
            message += `- ${teamMembers.find(m => m.id === selectedOther.id).name} (${selectedOther.id})\n`;
        } else if (teamMembers.length >= 2) {
            teamMembers.sort((a, b) => a.laptopDutyCount - b.laptopDutyCount);
            selectedPair = [teamMembers[0].id, teamMembers[1].id];
            teamMembers.find(m => m.id === teamMembers[0].id).laptopDutyCount++;
            teamMembers.find(m => m.id === teamMembers[1].id).laptopDutyCount++;
            message += `- ${teamMembers.find(m => m.id === teamMembers[0].id).name} (${teamMembers[0].id})\n`;
            message += `- ${teamMembers.find(m => m.id === teamMembers[1].id).name} (${teamMembers[1].id})\n`;
        } else {
            message = "⚠️ 노트북 지참 알림 ⚠️\n\n팀원이 부족하여 노트북 당번을 배정할 수 없습니다.";
            selectedPair = [];
        }
        config.currentLaptopDutyPair = [];
        saveConfig(config);
    }

    if (selectedPair.length > 0 || message.includes("부족")) {
        await sendMessagesToMultipleRecipients(message, teamMembers.map(m => m.id).join(','));
        console.log(`[${new Date().toISOString()}] 노트북 지참 알림 발송 완료.`);
    }
}

// 코드 리뷰 짝꿍 배정 및 전송
async function assignCodeReviewPairsAndSendMessage() {
    const config = loadConfig();
    let teamMembers = config.teamMembers;

    if (teamMembers.length < 2) {
        await sendMessagesToMultipleRecipients("👥 코드 리뷰 짝꿍 알림 👥\n\n팀원이 부족하여 코드 리뷰 짝꿍을 배정할 수 없습니다.", teamMembers.map(m => m.id).join(','));
        return;
    }

    const shuffledMembers = [...teamMembers].sort(() => 0.5 - Math.random());
    let pairs = [];
    let remainingMembers = [...shuffledMembers];

    while (remainingMembers.length >= 2) {
        if (remainingMembers.length === 3) {
            pairs.push(remainingMembers.splice(0, 3));
        } else {
            pairs.push(remainingMembers.splice(0, 2));
        }
    }

    let message = "👥 이번 주 코드 리뷰 짝꿍 알림 👥\n\n";
    pairs.forEach((pair, index) => {
        const pairNames = pair.map(member => teamMembers.find(m => m.id === member.id)?.name || member.id);
        message += `${index + 1}. ${pairNames.join(' & ')}\n`;
        
        pair.forEach(member => {
            const teamMember = teamMembers.find(m => m.id === member.id);
            if (teamMember) {
                teamMember.codeReviewCount = (teamMember.codeReviewCount || 0) + 1;
            }
        });
    });

    saveConfig(config);
    await sendMessagesToMultipleRecipients(message, teamMembers.map(m => m.id).join(','));
    console.log(`[${new Date().toISOString()}] 코드 리뷰 짝꿍 알림 발송 완료.`);
}

// 기존 스케줄된 작업들 중지
function clearAllScheduledJobs() {
    for (const jobId in scheduledJobs) {
        if (scheduledJobs[jobId]) {
            scheduledJobs[jobId].stop();
            console.log(`[${new Date().toISOString()}] 기존 cron 작업 중지: ${jobId}`);
        }
    }
    scheduledJobs = {};
}

// 스케줄 재설정
function rescheduleJobs(config) {
    clearAllScheduledJobs();

    config.schedules.forEach((item, index) => {
        const jobId = `job_${item.id || index}`;
        
        if (!cron.validate(item.cronSchedule)) {
            console.error(`[${new Date().toISOString()}] 유효하지 않은 cron 스케줄: ${item.cronSchedule}`);
            return;
        }

        let taskFunction;
        switch(item.type) {
            case 'message':
                taskFunction = () => {
                    console.log(`[${new Date().toISOString()}] 일반 메시지 전송 시작`);
                    sendMessagesToMultipleRecipients(item.message, item.recipients);
                };
                break;
            case 'laptop_duty':
                taskFunction = () => {
                    console.log(`[${new Date().toISOString()}] 노트북 지참 알림 시작`);
                    assignLaptopDutyAndSendMessage();
                };
                break;
            case 'code_review':
                taskFunction = () => {
                    console.log(`[${new Date().toISOString()}] 코드 리뷰 짝꿍 알림 시작`);
                    assignCodeReviewPairsAndSendMessage();
                };
                break;
            default:
                console.error(`[${new Date().toISOString()}] 알 수 없는 스케줄 타입: ${item.type}`);
                return;
        }

        const job = cron.schedule(item.cronSchedule, taskFunction, {
            scheduled: true,
            timezone: "Asia/Seoul"
        });
        scheduledJobs[jobId] = job;
        console.log(`[${new Date().toISOString()}] 새 cron 작업 스케줄됨 - 타입: ${item.type}, 스케줄: ${item.cronSchedule}`);
    });
}

// 웹 서버 생성
const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.url === '/' && req.method === 'GET') {
        fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain; charset=UTF-8' });
                res.end('서버 오류: index.html 파일을 찾을 수 없습니다.');
                console.error("index.html 파일을 읽을 수 없습니다:", err);
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
            res.end(data);
        });
    }
    else if (req.url === '/config' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify(loadConfig()));
    }
    else if (req.url === '/update-schedules' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const updatedSchedules = JSON.parse(body);
                const config = loadConfig();
                config.schedules = updatedSchedules;
                saveConfig(config);
                rescheduleJobs(config);
                res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
                res.end(JSON.stringify({ status: 'success', message: '스케줄 설정이 성공적으로 업데이트되었습니다.', config: config.schedules }));
            } catch (error) {
                console.error(`[${new Date().toISOString()}] 스케줄 설정 업데이트 중 오류:`, error.message);
                res.writeHead(400, { 'Content-Type': 'application/json; charset=UTF-8' });
                res.end(JSON.stringify({ status: 'error', message: '잘못된 요청: ' + error.message }));
            }
        });
    }
    else if (req.url === '/update-team-members' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const updatedTeamMembers = JSON.parse(body);
                const config = loadConfig();
                config.teamMembers = updatedTeamMembers;
                saveConfig(config);
                res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
                res.end(JSON.stringify({ status: 'success', message: '팀원 정보가 성공적으로 업데이트되었습니다.', teamMembers: config.teamMembers }));
            } catch (error) {
                console.error(`[${new Date().toISOString()}] 팀원 정보 업데이트 중 오류:`, error.message);
                res.writeHead(400, { 'Content-Type': 'application/json; charset=UTF-8' });
                res.end(JSON.stringify({ status: 'error', message: '잘못된 요청: ' + error.message }));
            }
        });
    }
    else {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
        res.end('404 Not Found');
    }
});

server.listen(PORT, () => {
    console.log(`[${new Date().toISOString()}] 웹 서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
    console.log("웹 브라우저에서 이 주소에 접속하여 메시지와 팀원 설정을 관리할 수 있습니다.");

    const initialConfig = loadConfig();
    rescheduleJobs(initialConfig);
    console.log(`[${new Date().toISOString()}] 초기 설정 로드 및 스케줄링 완료.`);
    console.log("Ctrl+C를 눌러 서버를 중지할 수 있습니다.");
});

process.on('SIGINT', () => {
    console.log(`[${new Date().toISOString()}] 서버 종료 중...`);
    clearAllScheduledJobs();
    server.close(() => {
        console.log(`[${new Date().toISOString()}] 서버가 종료되었습니다.`);
        process.exit(0);
    });
});
